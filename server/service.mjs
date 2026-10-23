import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {analyze,answerNoticeQuestion,boundedText,ServiceError,modelInput,modelPayload,questionInput,questionPayload} from './analyze.mjs';
import {createImageCaptcha,captchaAnswerHash} from './image-captcha.mjs';
import {createRollingQuota,pruneRollingQuota,checkRollingQuota,reserveRollingQuota,remainingRollingAccount,createSplitQuota} from './ai-quota.mjs';
const D=globalThis.CampusData;
const RATE_WINDOW_MS=180000,RATE_LIMIT=5,AUTHENTICATED_IP_RATE_LIMIT=20;
// Peak list prices translated at a conservative 8 RMB/USD; cached input is
// deliberately priced as a miss. These estimates are not provider invoices.
// Update both values when the provider's prices change.
const INPUT_MICRO_RMB_PER_TOKEN=2.4,OUTPUT_MICRO_RMB_PER_TOKEN=9.6;
const tokenCostMicro=(input,output)=>Math.min(Number.MAX_SAFE_INTEGER,Math.ceil(input*INPUT_MICRO_RMB_PER_TOKEN+output*OUTPUT_MICRO_RMB_PER_TOKEN));
const validTokenCounts=stats=>stats&&['input','output'].every(key=>Number.isSafeInteger(stats[key])&&stats[key]>=0);
function publicAIErrorCode(error){
  if(!(error instanceof ServiceError))return undefined;
  if(error.code==='AI_TIMEOUT')return error.code;
  // The provider details remain server-side finite categories. Clients receive
  // only the broad failure type, never raw validator paths or model content.
  if(error.failureCode&&error.failureCode!=='CONTENT_BOUNDARY')return 'AI_FORMAT_INVALID';
  if(error.finishReason&&error.finishReason!=='stop')return 'AI_INCOMPLETE';
  return undefined;
}
export async function createService(config,options={}){
  if(!config.apiKey||!config.accessToken||config.accessToken.length<20)throw new Error('Server secrets are missing or too short');
  // Legacy private mode is retained for isolated tests; production is explicitly public.
  const publicMode=config.requireAccess===false,now=options.now||Date.now,modelFetch=options.modelFetch||fetch;
  const verificationMode=config.captchaMode||'image';
  if(!['image','pow'].includes(verificationMode))throw new Error('CAPTCHA_MODE must be image or pow');
  const imageCaptcha=options.imageCaptcha||createImageCaptcha;
  const cache=new Map(),rates=new Map(),challenges=new Map(),pendingJobs=new Set(),admissions=new Map();
  const dailyLimit=config.dailyLimit===undefined?50:config.dailyLimit;
  if(!Number.isSafeInteger(dailyLimit)||dailyLimit<1)throw new Error('Daily AI budget must be a positive integer');
  const questionDailyLimit=config.questionDailyLimit===undefined?40:config.questionDailyLimit;
  if(!Number.isSafeInteger(questionDailyLimit)||questionDailyLimit<1)throw new Error('Daily question limit must be a positive integer');
  const dailyBudgetRmb=config.dailyBudgetRmb===undefined?3:config.dailyBudgetRmb;
  const dailyBudgetMicro=Math.floor(dailyBudgetRmb*1_000_000);
  if(typeof dailyBudgetRmb!=='number'||!Number.isFinite(dailyBudgetRmb)||!Number.isSafeInteger(dailyBudgetMicro)||dailyBudgetMicro<1)throw new Error('Daily AI currency budget must be a positive number');
  // Optional legacy daily limits remain available only when explicitly passed
  // by isolated callers. Production uses the rolling limits below instead.
  const ipLimit=Number.isInteger(config.ipDailyLimit)&&config.ipDailyLimit>0?config.ipDailyLimit:Infinity;
  const rollingLimit=(value,fallback)=>{const limit=value===undefined?fallback:value;if(!Number.isSafeInteger(limit)||limit<1)throw new Error('Rolling AI quota limits must be positive integers');return limit;};
  const rollingLimits={accountFiveHourLimit:rollingLimit(config.accountFiveHourLimit,5),accountThreeDayLimit:rollingLimit(config.accountThreeDayLimit,20),ipFiveHourLimit:rollingLimit(config.ipFiveHourLimit,5)};
  const questionRollingLimits={accountFiveHourLimit:rollingLimit(config.questionAccountFiveHourLimit,5),accountThreeDayLimit:rollingLimit(config.questionAccountThreeDayLimit,15),ipFiveHourLimit:rollingLimit(config.questionIPFiveHourLimit,5)};
  const bits=16,sign=value=>createHmac('sha256',config.accessToken).update(value).digest('base64url');
  const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
  let usage=null,busy=false,persistQueue=Promise.resolve(),currencyMigration=false;
  if(config.stateFile){try{
    usage=JSON.parse(await readFile(config.stateFile,'utf8'));
    if(!usage||typeof usage.day!=='string'||!Number.isSafeInteger(usage.requests)||usage.requests<0||['input','output','reasoning'].some(key=>usage[key]!==undefined&&(!Number.isSafeInteger(usage[key])||usage[key]<0)))throw new Error('Invalid quota state');
    for(const key of ['input','output','reasoning'])usage[key]??=0;
    if(usage.costMicro===undefined){usage.costMicro=tokenCostMicro(usage.input,usage.output);currencyMigration=true;}
    if(!Number.isSafeInteger(usage.costMicro)||usage.costMicro<0)throw new Error('Invalid currency budget state');
    const validTimes=(value,limit)=>Array.isArray(value)&&value.length<=limit&&value.every(t=>Number.isSafeInteger(t)&&t>=0);
    const validMap=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=2000;
    if(usage.clients!==undefined&&(!validMap(usage.clients)||Object.entries(usage.clients).some(([k,v])=>!/^[-\w]{43}$/.test(k)||!v||!Number.isSafeInteger(v.requests)||v.requests<0||!validTimes(v.times,config.requireIdentity?AUTHENTICATED_IP_RATE_LIMIT:RATE_LIMIT))))throw new Error('Invalid address quota state');
    if(usage.accounts!==undefined&&(!validMap(usage.accounts)||Object.entries(usage.accounts).some(([k,v])=>!/^[-\w]{43}$/.test(k)||!Number.isSafeInteger(v)||v<0)))throw new Error('Invalid identity quota state');
    if(usage.questionAccounts!==undefined&&(!validMap(usage.questionAccounts)||Object.entries(usage.questionAccounts).some(([k,v])=>!/^[-\w]{43}$/.test(k)||!Number.isSafeInteger(v)||v<0||v>5)))throw new Error('Invalid question quota state');
    if(usage.accountRates!==undefined&&(!validMap(usage.accountRates)||Object.entries(usage.accountRates).some(([k,v])=>!/^[-\w]{43}$/.test(k)||!validTimes(v,RATE_LIMIT))))throw new Error('Invalid account rate state');
  }catch(e){if(e.code!=='ENOENT')throw e;}}
  if(usage){currencyMigration||=usage.rolling===undefined||usage.splitQuota===undefined;usage.rolling=createRollingQuota(usage,now());usage.splitQuota=createSplitQuota(usage,now());}
  const persist=()=>{if(!config.stateFile)return Promise.resolve();const snapshot=JSON.stringify(usage);const pending=persistQueue.catch(()=>{}).then(async()=>{await writeFile(config.stateFile+'.tmp',snapshot,{mode:0o600});await rename(config.stateFile+'.tmp',config.stateFile);});persistQueue=pending;return pending;};
  if(currencyMigration)await persist();
  // Compatible response field, now reflecting only this account's independent
  // question windows. Network/site/currency limits can still stop admissions.
  const remainingQuestionsFor=account=>remainingRollingAccount(usage?.splitQuota?.questionRolling,{...questionRollingLimits,time:now(),accountKey:sign('rolling:account:'+account.id),legacyAccountKey:usage?.splitQuota?.questionRolling?.legacy?sign(usage.splitQuota.questionRolling.legacy.day+':account:'+account.id):null});
  const authorized=header=>timingSafeEqual(createHash('sha256').update(header||'').digest(),createHash('sha256').update('Bearer '+config.accessToken).digest());
  const verify=(proof,ipKey,hash,origin,t,accountKey)=>{
    try{
      if(proof.length>4096)throw 0;const p=JSON.parse(proof);
      if(!p||typeof p.token!=='string'||p.token.length>1800)throw 0;
      const [payload,signature,...extra]=p.token.split('.');if(extra.length||!signature||signature.length!==43||!timingSafeEqual(Buffer.from(signature),Buffer.from(sign(payload))))throw 0;
      const value=JSON.parse(Buffer.from(payload,'base64url').toString());
      const challenge=challenges.get(value.id);
      if(value.ip!==ipKey||value.hash!==hash||value.origin!==origin||value.account!==accountKey||value.expires<=t||!challenge||challenge.exhausted)throw 0;
      if(value.type==='image'){
        if(verificationMode!=='image'||challenge.type!=='image')throw 0;
        if(Object.keys(p).some(key=>!['token','answer'].includes(key)))throw 0;
        challenge.attempts++;
        const matches=typeof p.answer==='string'&&/^\d{4}$/.test(p.answer)
          &&timingSafeEqual(Buffer.from(captchaAnswerHash(value.id,p.answer),'hex'),Buffer.from(challenge.answerHash,'hex'));
        if(!matches){if(challenge.attempts>=5)challenge.exhausted=true;return {remainingAttempts:Math.max(0,5-challenge.attempts)};}
        // Synchronous consume happens before any persistence/model await, including simultaneous submissions.
        challenges.delete(value.id);return true;
      }
      if(verificationMode!=='pow'||value.type!=='pow'||challenge.type!=='pow'||value.bits!==bits||p.type&&p.type!=='pow'
        ||!Number.isSafeInteger(p.nonce)||p.nonce<0||p.nonce>10000000)throw 0;
      const digest=createHash('sha256').update(p.token+':'+p.nonce).digest();if(digest[0]!==0||digest[1]!==0)throw 0;
      challenges.delete(value.id);return true;
    }catch{return false;}
  };
  const handle=async function handle(request,ip='unknown'){
    const origin=request.headers.get('Origin'),accepted=!!origin&&(config.allowedOrigins||[]).includes(origin),url=new URL(request.url);
    const questionRoute=url.pathname==='/notice-question';
    const jobRoute=url.pathname==='/analysis-jobs'||/^\/analysis-jobs\/[0-9a-f-]{36}(?:\/save)?$/.test(url.pathname);
    let admissionDone;
    const reply=(body,status=200,extraHeaders={})=>{
      admissionDone?.({body,status,extraHeaders});
      return new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(accepted?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':jobRoute?'GET, POST, OPTIONS':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Campus-Proof','Access-Control-Expose-Headers':'Retry-After','Access-Control-Max-Age':'600'}:{}),...extraHeaders}});
    };
    if(url.pathname==='/health'&&request.method==='GET')return reply({status:'ok'});
    if(url.pathname!=='/analyze'&&!jobRoute&&!questionRoute)return reply({error:'接口不存在。'},404);
    if(!accepted)return reply({error:'此网页未获准调用整理服务。'},403);
    if(request.method==='OPTIONS')return reply({},204);
    if(request.method!=='POST'&&!(jobRoute&&request.method==='GET'))return reply({error:'请使用支持的请求方法。'},405);
    if(!publicMode&&!authorized(request.headers.get('Authorization')))return reply({error:'访问码不正确，请重新输入。'},401);
    let account=null;
    if(config.requireIdentity){
      const token=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
      account=token&&options.accountForToken?await options.accountForToken(token):null;
      if(!account)return reply({error:'请先登录，再整理通知。',code:'AUTH_REQUIRED'},401);
    }
    if((jobRoute||questionRoute)&&!account)return reply({error:'请先登录，再使用 AI 服务。',code:'AUTH_REQUIRED'},401);
    if(jobRoute&&!options.jobs)return reply({error:'后台整理服务暂时不可用，请稍后再试。'},503);
    if(questionRoute&&!options.questions)return reply({error:'提问服务暂时不可用，请稍后再试。',code:'SERVICE_UNAVAILABLE'},503);
    if(jobRoute&&url.pathname.endsWith('/save')){
      if(request.method!=='POST')return reply({error:'请使用POST恢复保存。'},405);
      if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return reply({error:'请求必须使用 JSON。'},415);
      try{
        const body=JSON.parse(await boundedText(request.body,1024));if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)throw new ServiceError('恢复保存无需填写额外内容。',400);
        return reply({job:options.jobs.retrySave(account,url.pathname.split('/')[2])},202);
      }catch(error){return reply({error:error instanceof ServiceError?error.message:'整理结果暂时无法恢复保存。'},error.status||503);}
    }
    if(jobRoute&&request.method==='GET'){
      try{
        if(url.pathname==='/analysis-jobs')return reply(options.jobs.list(account,url.searchParams.get('before')));
        const job=options.jobs.get(account,url.pathname.slice('/analysis-jobs/'.length));
        return job?reply({job}):reply({error:'整理任务不存在。'},404);
      }catch(error){return reply({error:error instanceof ServiceError?error.message:'整理任务暂时无法读取。'},error.status||503);}
    }
    if(jobRoute&&url.pathname!=='/analysis-jobs')return reply({error:'此任务接口仅支持读取。'},405);
    if(request.signal.aborted)return reply({error:'整理已取消，请重新提交。',code:'CANCELLED'},499);
    if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return reply({error:'请求必须使用 JSON。'},415);
    let notice,requestID;
    try{const body=JSON.parse(await boundedText(request.body,64000));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();
      if(questionRoute){if(Object.keys(body).length!==3||typeof body.requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$/.test(body.requestId))throw new Error();requestID=body.requestId;notice=questionInput({sourceText:body.sourceText,question:body.question});}
      else{
        if(jobRoute){if(Object.keys(body).some(key=>!['sources','requestId','maintenanceReviewConsent'].includes(key))||!Object.hasOwn(body,'sources')||typeof body.requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$/.test(body.requestId)||Object.hasOwn(body,'maintenanceReviewConsent')&&typeof body.maintenanceReviewConsent!=='boolean')throw new Error();requestID=body.requestId;notice={sources:body.sources};}
        else{if(Object.keys(body).length!==1)throw new Error();if(Object.hasOwn(body,'notice')){if(typeof body.notice!=='string'||!body.notice.trim()||body.notice.length>D.MAX_TEXT)throw new Error();notice=body.notice.trim();}else if(Object.hasOwn(body,'sources'))notice=body;else throw new Error();}modelInput(notice);if(jobRoute)notice={sources:notice.sources.map(source=>({text:source.text.trim()}))};
      }}
    catch(e){return reply({error:e instanceof ServiceError?e.message:questionRoute?'请提供有效的单条原文、问题和请求编号。':'请提供 1–4,000 字的通知文字。'},e.status||400);}
    const t=now(),hash=createHash('sha256').update(JSON.stringify(questionRoute?{type:'notice-question',...notice}:modelInput(notice))).digest('hex');
    if(questionRoute){try{
      const existing=options.questions.findRequest(account,requestID);
      if(existing){
        if(existing.hash!==hash)return reply({error:'同一请求编号不能提交不同原文或问题。',code:'REQUEST_ID_CONFLICT'},409);
        if(existing.response){
          const remainingQuestions=remainingQuestionsFor(account);
          return reply(existing.response.status===200?{...existing.response.body,remainingQuestions}:existing.response.body,existing.response.status);
        }
        return reply({error:'这次提问仍在处理，请稍后使用同一请求编号查询。',code:'QUESTION_IN_PROGRESS',retryAfterSeconds:3},409,{'Retry-After':'3'});
      }
    }catch{return reply({error:'提问记录暂时无法读取，请稍后用同一请求编号查询。',code:'SERVICE_UNAVAILABLE'},503);}}
    if(jobRoute){try{const existing=options.jobs.findRequest(account,requestID,hash);if(existing)return reply({job:existing},202);options.jobs.checkCapacity(account);}catch(error){return reply({error:error instanceof ServiceError?error.message:'整理任务暂时不可用。'},error.status||503);}}
    if(jobRoute||questionRoute){
      const key=(questionRoute?'question:':'job:')+account.id+':'+requestID,previous=admissions.get(key);
      if(previous){
        if(previous.hash!==hash)return reply({error:questionRoute?'同一请求编号不能提交不同原文或问题。':'同一任务编号不能提交不同原文，请重新创建任务。',...(questionRoute?{code:'REQUEST_ID_CONFLICT'}:{})},409);
        const response=await previous.promise;return reply(response.body,response.status,response.extraHeaders);
      }
      let resolve;const promise=new Promise(done=>{resolve=done;});admissions.set(key,{hash,promise});
      admissionDone=response=>{admissions.delete(key);resolve(response);admissionDone=undefined;};
    }
    try{
    for(const [k,v] of cache)if(t-v.created>15*60000)cache.delete(k);
    // Questions reuse only their durable request ID, never another account's
    // response or a different paid request's allowance.
    const saved=questionRoute?undefined:cache.get(hash);
    if(busy&&!saved)return reply({error:'AI 正在处理另一条请求，请稍后再试。',code:'SERVICE_BUSY',retryAfterSeconds:3},429,{'Retry-After':'3'});
    if(busy&&usage?.day!==day())return reply({error:'AI 正在处理另一条请求，请稍后再试。',code:'SERVICE_BUSY',retryAfterSeconds:3},429,{'Retry-After':'3'});
    if(!usage||usage.day!==day()){
      const rolling=createRollingQuota(usage,t),splitQuota=createSplitQuota(usage,t);
      usage={day:day(),requests:0,input:0,output:0,reasoning:0,costMicro:0,rolling,
        splitQuota:{...splitQuota,organizeRequests:0,questionRequests:0},...(publicMode?{clients:{}}:{})};
    }
    pruneRollingQuota(usage.rolling,t);pruneRollingQuota(usage.splitQuota.questionRolling,t);
    const routeRolling=questionRoute?usage.splitQuota.questionRolling:usage.rolling,routeLimits=questionRoute?questionRollingLimits:rollingLimits;
    const requestUsage=usage;
    const accountKey=account?sign(usage.day+':account:'+account.id):null;
    const accountLimit=Number.isInteger(config.accountDailyLimit)&&config.accountDailyLimit>0?config.accountDailyLimit:Infinity;
    const rollingKeys={accountKey:account?sign('rolling:account:'+account.id):null,ipKey:sign('rolling:ip:'+ip),
      legacyAccountKey:account&&routeRolling.legacy?sign(routeRolling.legacy.day+':account:'+account.id):null,
      legacyIPKey:routeRolling.legacy?sign(routeRolling.legacy.day+':'+ip):null};
    const rollingLimited=()=>{if(!publicMode)return null;const blocked=checkRollingQuota(routeRolling,{...rollingKeys,...routeLimits,activity:questionRoute?'提问':'整理',time:now()});return blocked?reply(blocked,429,{'Retry-After':String(blocked.retryAfterSeconds)}):null;};
    if(publicMode)usage.clients??={};const ipKey=sign(usage.day+':'+ip),client=usage.clients?.[ipKey]||{requests:0,times:[]};
    const entries=(publicMode?client.times:(rates.get(ip)||[])).filter(v=>t-v<RATE_WINDOW_MS);
    const networkRateLimit=accountKey?AUTHENTICATED_IP_RATE_LIMIT:RATE_LIMIT;
    if(accountKey)usage.accountRates??={};
    const accountEntries=accountKey?(usage.accountRates[accountKey]||[]).filter(v=>t-v<RATE_WINDOW_MS):null;
    const proof=request.headers.get('X-Campus-Proof');
    const imageScopes=challenge=>challenge.type==='image'&&(challenge.network===rollingKeys.ipKey||account&&challenge.owner===rollingKeys.accountKey);
    const findRecentImages=()=>publicMode&&!proof&&!saved&&verificationMode==='image'?[...challenges.values()].filter(challenge=>imageScopes(challenge)&&now()-challenge.created<30000&&challenge.expires>now()):[];
    let recentImages=findRecentImages();
    if(proof){
      const verified=publicMode?verify(proof,ipKey,hash,origin,t,accountKey):false;
      if(verified!==true){
        if(verified&&typeof verified==='object')return reply({error:verified.remainingAttempts>0?'数字不正确，请再试一次。':'验证码尝试次数已用完，请重新提交。',
          code:'CAPTCHA_INCORRECT',remainingAttempts:verified.remainingAttempts},400);
        return reply({error:verificationMode==='image'?'验证码已过期，请重新提交。':'安全验证已失效，请重新提交。',code:'INVALID_PROOF'},400);
      }
    }
    else if(!recentImages.length||(accountEntries||entries).length<3){
      if(accountEntries?.length>=RATE_LIMIT){const seconds=Math.max(1,Math.ceil((accountEntries[0]+RATE_WINDOW_MS-t)/1000));return reply({error:`每个账号每 3 分钟最多发起 ${RATE_LIMIT} 次 AI 请求，请 ${seconds} 秒后再试。`,code:'ACCOUNT_RATE_LIMIT',retryAfterSeconds:seconds},429,{'Retry-After':String(seconds)});}
      if(entries.length>=networkRateLimit){const seconds=Math.max(1,Math.ceil((entries[0]+RATE_WINDOW_MS-t)/1000));return reply({error:`此网络每 3 分钟最多发起 ${networkRateLimit} 次 AI 请求，请 ${seconds} 秒后再试。`,code:'IP_RATE_LIMIT',retryAfterSeconds:seconds},429,{'Retry-After':String(seconds)});}
      entries.push(t);
      if(accountEntries){accountEntries.push(t);usage.accountRates[accountKey]=accountEntries;}
      if(publicMode){client.times=entries;}
      else{rates.set(ip,entries);for(const [k,v] of rates)if(!v.some(x=>t-x<RATE_WINDOW_MS))rates.delete(k);}
    }
    const seconds=Math.ceil((86400000-((t+8*3600000)%86400000))/1000);
    const limited=(error,code)=>reply({error,code,retryAfterSeconds:seconds},429,{'Retry-After':String(seconds)});
    // UTF-8 bytes upper-bound the text input tokens, with extra room for chat
    // framing. Output includes the reasoning budget rather than adding it twice.
    const payload=saved?null:questionRoute?questionPayload(notice,config):modelPayload(notice,config);
    const reservedCostMicro=payload?tokenCostMicro(Buffer.byteLength(JSON.stringify(payload),'utf8')+1024,payload.max_tokens):0;
    const currencyLimited=()=>limited('今日 AI 服务预算已用完，明天再试。','DAILY_COST_LIMIT');
    const dailyLimited=()=>{
      if(questionRoute&&usage.splitQuota.questionRequests>=questionDailyLimit)return limited('今日全站提问次数已达上限，明天再试。','QUESTION_DAILY_LIMIT');
      if(!questionRoute&&usage.splitQuota.organizeRequests>=dailyLimit)return limited('今日全站整理次数已达上限，明天再试。','DAILY_LIMIT');
      return null;
    };
    // Paid failures consume their route's count and the shared currency budget. Cache reuse is free.
    if(!saved&&usage.costMicro>dailyBudgetMicro-reservedCostMicro)return currencyLimited();
    if(!saved){const blocked=dailyLimited();if(blocked)return blocked;}
    if(publicMode&&!saved&&client.requests>=ipLimit)return limited('此网络今日整理次数已达上限，明天再试。','IP_DAILY_LIMIT');
    if(accountKey&&!saved&&(usage.accounts?.[accountKey]||0)>=accountLimit)return limited('此账号今日整理次数已达上限，明天再试。','ACCOUNT_DAILY_LIMIT');
    if(!saved){const blocked=rollingLimited();if(blocked)return blocked;}
    if(publicMode){
      usage.clients[ipKey]=client;
      // Bound the persisted map: paid clients are at most the global daily cap.
      for(const [k,v] of Object.entries(usage.clients))if(k!==ipKey&&!v.requests&&!v.times.some(x=>t-x<RATE_WINDOW_MS))delete usage.clients[k];
      if(Object.keys(usage.clients).length>2000){delete usage.clients[ipKey];return reply({error:'服务繁忙，请稍后再试。'},503);}
      if(accountKey){
        for(const [key,times] of Object.entries(usage.accountRates))if(key!==accountKey&&!times.some(x=>t-x<RATE_WINDOW_MS))delete usage.accountRates[key];
        if(Object.keys(usage.accountRates).length>2000){delete usage.accountRates[accountKey];return reply({error:'服务繁忙，请稍后再试。'},503);}
      }
      try{await persist();}catch{return reply({error:'整理服务暂时不可用，请稍后重试。'},503);}
    }
    if(requestUsage!==usage||usage.day!==day())return reply({error:'整理服务时间已更新，请稍后再试。',code:'SERVICE_BUSY',retryAfterSeconds:3},429,{'Retry-After':'3'});
    if(saved){
      if(!jobRoute)return reply(saved.result);
      let job;
      try{job=options.jobs.accept(account,requestID,hash,notice.sources);options.jobs.metrics?.(account,job.id,{providerCalled:false,cacheReuse:true});options.jobs.stage(account,job.id,saved.result);return reply({job:options.jobs.complete(account,job.id)},202);}
      catch(error){if(job){try{options.jobs.fail(account,job.id,'JOB_SAVE_FAILED');}catch{}}return reply({error:error instanceof ServiceError?error.message:'整理结果暂时无法保存。'},error.status||503);}
    }
    if(publicMode&&!proof&&(accountEntries||entries).length>=3){
      for(const [id,challenge] of challenges)if(challenge.expires<=t)challenges.delete(id);
      // Persistence above yields: another arrival may have created a challenge
      // in the meantime. Recheck synchronously before generating a replacement.
      recentImages=findRecentImages();
      if(recentImages.length){
        const existing=recentImages.find(challenge=>!challenge.exhausted&&challenge.hash===hash&&challenge.origin===origin&&challenge.account===accountKey&&challenge.ip===ipKey);
        if(existing&&recentImages.length===1)return reply({code:'VERIFICATION_REQUIRED',challenge:existing.publicChallenge},428);
        const seconds=Math.max(1,Math.ceil((Math.max(...recentImages.map(challenge=>challenge.created))+30000-t)/1000));
        return reply({error:`更换图形验证码需间隔 30 秒，请 ${seconds} 秒后再试。`,code:'CAPTCHA_REFRESH_LIMIT',retryAfterSeconds:seconds},429,{'Retry-After':String(seconds)});
      }
      if(verificationMode==='image')for(const [id,challenge] of challenges)if(imageScopes(challenge))challenges.delete(id);
      if(challenges.size>=2000)return reply({error:'服务繁忙，请稍后再试。'},503);
      const id=randomBytes(16).toString('hex'),expires=t+120000,type=verificationMode;
      const image=type==='image'?imageCaptcha(id):null;
      const payload=Buffer.from(JSON.stringify({id,ip:ipKey,hash,origin,expires,account:accountKey,type,
        ...(type==='pow'?{bits}:{})})).toString('base64url');
      const token=payload+'.'+sign(payload);
      const publicChallenge=image?{type,token,image:image.image,expires}:{type,token,bits,expires};
      challenges.set(id,{type,expires,attempts:0,...(image?{answerHash:image.answerHash,created:t,hash,origin,account:accountKey,ip:ipKey,owner:rollingKeys.accountKey,network:rollingKeys.ipKey,publicChallenge}:{})});
      return reply({code:'VERIFICATION_REQUIRED',challenge:publicChallenge},428);
    }
    // Recheck after asynchronous persistence; two arrivals must never start two model calls.
    if(busy)return reply({error:'AI 正在处理另一条请求，请稍后再试。',code:'SERVICE_BUSY',retryAfterSeconds:3},429,{'Retry-After':'3'});
    {const blocked=dailyLimited();if(blocked)return blocked;}
    if(usage.costMicro>dailyBudgetMicro-reservedCostMicro)return currencyLimited();
    if(publicMode&&client.requests>=ipLimit)return limited('此网络今日整理次数已达上限，明天再试。','IP_DAILY_LIMIT');
    if(accountKey&&(usage.accounts?.[accountKey]||0)>=accountLimit)return limited('此账号今日整理次数已达上限，明天再试。','ACCOUNT_DAILY_LIMIT');
    {const blocked=rollingLimited();if(blocked)return blocked;}
    if(request.signal.aborted)return reply({error:'整理已取消，请重新提交。',code:'CANCELLED'},499);
    const admittedUsage=usage;
    busy=true;let tokensRecorded=false,acceptedJob,acceptedQuestion=false;
    const recordTokens=async(stats,finishReason,failureCode,usageAvailable)=>{
      // Settle against the exact day/object that reserved this call. Never
      // release an old-day reservation from a replacement day's allowance.
      for(const key of ['input','output','reasoning'])admittedUsage[key]=Math.min(Number.MAX_SAFE_INTEGER,(admittedUsage[key]||0)+(stats?.[key]||0));
      if(usageAvailable===true&&validTokenCounts(stats))admittedUsage.costMicro=Math.min(Number.MAX_SAFE_INTEGER,admittedUsage.costMicro-reservedCostMicro+tokenCostMicro(stats.input,stats.output));
      if(finishReason)admittedUsage.lastFinishReason=finishReason;if(failureCode)admittedUsage.lastFailureCode=failureCode;else delete admittedUsage.lastFailureCode;
      tokensRecorded=true;if(admittedUsage===usage)await persist();
    };
    try{
      // Claim the idempotency key synchronously before the quota write yields.
      // Concurrent repeats can already find this durable task, even if its ACK
      // or budget persistence later fails. No provider runs before both stores.
      if(jobRoute)acceptedJob=options.jobs.accept(account,requestID,hash,notice.sources);
      if(questionRoute){options.questions.accept(account,requestID,hash);acceptedQuestion=true;}
      admittedUsage.costMicro+=reservedCostMicro;admittedUsage.requests++;admittedUsage.splitQuota[questionRoute?'questionRequests':'organizeRequests']++;if(publicMode){client.requests++;reserveRollingQuota(routeRolling,{...rollingKeys,time:now()});}if(accountKey){admittedUsage.accounts??={};admittedUsage.accounts[accountKey]=(admittedUsage.accounts[accountKey]||0)+1;}await persist();
      if(questionRoute){
        // Once admitted, finish independently of the browser connection so a
        // lost response can be recovered with the same ID without a new charge.
        const worker=(async()=>{
          try{
            const output=await answerNoticeQuestion(notice,config,modelFetch);
            await recordTokens(output.usage,output.finishReason,undefined,output.usageAvailable);
            const remainingQuestions=remainingQuestionsFor(account);
            const response={status:200,body:{...output.result,remainingQuestions}};
            options.questions.complete(account,requestID,response);return response;
          }catch(error){
            if(error instanceof ServiceError&&error.usage&&!tokensRecorded){try{await recordTokens(error.usage,error.finishReason,error.failureCode,error.usageAvailable);}catch{error=new ServiceError('AI 用量暂时无法保存。',503);}}
            const response={status:error.status||503,body:{error:(error instanceof ServiceError?error.message:'提问服务暂时不可用。')+' 同一请求不会再次收费。',code:publicAIErrorCode(error)||'QUESTION_FAILED'}};
            options.questions.complete(account,requestID,response);return response;
          }
        })();
        pendingJobs.add(worker);let response;
        try{response=await worker;}finally{pendingJobs.delete(worker);}
        return reply(response.body,response.status);
      }
      if(jobRoute){
        // Both the quota reservation and accepted task are durable before ACK.
        // The background call is not bound to the browser's request signal.
        const job=acceptedJob;
        const worker=(async()=>{
          let outputReceived=false,modelOutput;
          try{
            options.jobs.start(account,job.id);
            options.jobs.metrics?.(account,job.id,{providerCalled:true,cacheReuse:false});
            const output=await analyze(notice,config,modelFetch);outputReceived=true;modelOutput=output;
            options.jobs.metrics?.(account,job.id,{providerCalled:true,cacheReuse:false,usage:output.usage});
            options.jobs.stage(account,job.id,output.result);
            options.jobs.complete(account,job.id);
            await recordTokens(output.usage,output.finishReason,undefined,output.usageAvailable);
            if(cache.size>=50)cache.delete(cache.keys().next().value);cache.set(hash,{created:now(),result:output.result});
          }catch(error){
            if(error instanceof ServiceError&&error.usage){try{options.jobs.metrics?.(account,job.id,{providerCalled:true,cacheReuse:false,usage:error.usage});}catch{}}
            if(modelOutput&&!tokensRecorded){try{await recordTokens(modelOutput.usage,modelOutput.finishReason,undefined,modelOutput.usageAvailable);}catch{}}
            if(error instanceof ServiceError&&error.usage&&!tokensRecorded){try{await recordTokens(error.usage,error.finishReason,error.failureCode,error.usageAvailable);}catch{}}
            const code=outputReceived?'JOB_SAVE_FAILED':error.failureCode==='CONTENT_BOUNDARY'?'CONTENT_BOUNDARY':publicAIErrorCode(error)||'SERVICE_UNAVAILABLE';
            try{options.jobs.fail(account,job.id,code);}catch{}
          }finally{busy=false;}
        })();
        pendingJobs.add(worker);worker.finally(()=>pendingJobs.delete(worker)).catch(()=>{});
        return reply({job:options.jobs.findRequest(account,requestID,hash)},202);
      }
      if(request.signal.aborted)throw new ServiceError('整理已取消，请重新提交。',499);
      const output=await analyze(notice,config,modelFetch,request.signal);await recordTokens(output.usage,output.finishReason,undefined,output.usageAvailable);
      if(request.signal.aborted)throw new ServiceError('整理已取消，请重新提交。',499);
      if(cache.size>=50)cache.delete(cache.keys().next().value);cache.set(hash,{created:now(),result:output.result});return reply(output.result);
    }catch(e){
      if(acceptedJob){try{options.jobs.fail(account,acceptedJob.id,'SERVICE_UNAVAILABLE');}catch{}}
      if(e instanceof ServiceError&&e.usage&&!tokensRecorded){try{await recordTokens(e.usage,e.finishReason,e.failureCode,e.usageAvailable);}catch{e=new ServiceError('AI 用量暂时无法保存，请稍后用同一请求编号查询。',503);}}
      const code=publicAIErrorCode(e);
      if(acceptedQuestion){
        const body={error:(e instanceof ServiceError?e.message:'提问服务暂时不可用。')+' 同一请求不会再次收费。',code:code||'QUESTION_FAILED'};
        try{options.questions.complete(account,requestID,{status:e.status||503,body});}catch{return reply({error:'提问结果暂时无法保存，请稍后用同一请求编号查询。',code:'QUESTION_INTERRUPTED'},503);}
        return reply(body,e.status||503);
      }
      return reply({error:e instanceof ServiceError?e.message:'整理服务暂时不可用，请稍后重试。',...(code?{code}:{})},e.status||503);
    }finally{if(!jobRoute||!pendingJobs.size)busy=false;}
    }catch(error){
      // Every in-memory admission waiter must receive a finite response even if
      // preflight fails unexpectedly before the durable task can be accepted.
      return reply({error:error instanceof ServiceError?error.message:'整理服务暂时不可用，请稍后重试。'},error.status||503);
    }
  };
  handle.drain=()=>Promise.allSettled([...pendingJobs]);
  handle.adminSummary=()=>({day:usage?.day||day(),requests:usage?.requests||0,inputTokens:usage?.input||0,outputTokens:usage?.output||0,reasoningTokens:usage?.reasoning||0,estimatedCostRmb:(usage?.costMicro||0)/1_000_000,costIsEstimate:true,dailyRequestLimit:dailyLimit,dailyQuestionLimit:questionDailyLimit,organizingRequests:usage?.splitQuota?.organizeRequests||0,questionRequests:usage?.splitQuota?.questionRequests||0,dailyBudgetRmb,...rollingLimits,questionAccountFiveHourLimit:questionRollingLimits.accountFiveHourLimit,questionAccountThreeDayLimit:questionRollingLimits.accountThreeDayLimit,questionIPFiveHourLimit:questionRollingLimits.ipFiveHourLimit,processing:busy});
  return handle;
}
