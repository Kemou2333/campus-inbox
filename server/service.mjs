import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {analyze,boundedText,ServiceError,modelInput} from './analyze.mjs';
const D=globalThis.CampusData;
const RATE_WINDOW_MS=180000,RATE_LIMIT=5;
export async function createService(config,options={}){
  if(!config.apiKey||!config.accessToken||config.accessToken.length<20)throw new Error('Server secrets are missing or too short');
  // Legacy private mode is retained for isolated tests; production is explicitly public.
  const publicMode=config.requireAccess===false,now=options.now||Date.now,modelFetch=options.modelFetch||fetch;
  const cache=new Map(),rates=new Map(),challenges=new Map();
  const ipLimit=Number.isInteger(config.ipDailyLimit)&&config.ipDailyLimit>0?config.ipDailyLimit:10;
  const bits=16,sign=value=>createHmac('sha256',config.accessToken).update(value).digest('base64url');
  const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
  let usage=null,busy=false,persistQueue=Promise.resolve();
  if(config.stateFile){try{usage=JSON.parse(await readFile(config.stateFile,'utf8'));if(!usage||typeof usage.day!=='string'||!Number.isSafeInteger(usage.requests)||usage.requests<0||['input','output','reasoning'].some(key=>usage[key]!==undefined&&(!Number.isSafeInteger(usage[key])||usage[key]<0)))throw new Error('Invalid quota state');for(const key of ['input','output','reasoning'])usage[key]??=0;if(usage.clients!==undefined&&(typeof usage.clients!=='object'||!usage.clients||Array.isArray(usage.clients)||Object.entries(usage.clients).some(([k,v])=>!/^[-\w]{43}$/.test(k)||!v||!Number.isSafeInteger(v.requests)||v.requests<0||!Array.isArray(v.times)||v.times.length>5||v.times.some(t=>!Number.isSafeInteger(t)||t<0))))throw new Error('Invalid address quota state');if(usage.accounts!==undefined&&(!usage.accounts||typeof usage.accounts!=='object'||Array.isArray(usage.accounts)||Object.entries(usage.accounts).some(([k,v])=>!/^[-\w]{43}$/.test(k)||!Number.isSafeInteger(v)||v<0)))throw new Error('Invalid identity quota state');}catch(e){if(e.code!=='ENOENT')throw e;}}
  const persist=()=>{if(!config.stateFile)return Promise.resolve();const snapshot=JSON.stringify(usage);const pending=persistQueue.catch(()=>{}).then(async()=>{await writeFile(config.stateFile+'.tmp',snapshot,{mode:0o600});await rename(config.stateFile+'.tmp',config.stateFile);});persistQueue=pending;return pending;};
  const authorized=header=>timingSafeEqual(createHash('sha256').update(header||'').digest(),createHash('sha256').update('Bearer '+config.accessToken).digest());
  const verify=(proof,ipKey,hash,origin,t)=>{
    try{
      if(proof.length>2000)throw 0;const p=JSON.parse(proof);
      if(!p||typeof p.token!=='string'||!Number.isSafeInteger(p.nonce)||p.nonce<0||p.nonce>10000000)throw 0;
      const [payload,signature,...extra]=p.token.split('.');if(extra.length||!signature||signature.length!==43||!timingSafeEqual(Buffer.from(signature),Buffer.from(sign(payload))))throw 0;
      const value=JSON.parse(Buffer.from(payload,'base64url').toString());
      if(value.ip!==ipKey||value.hash!==hash||value.origin!==origin||value.expires<=t||value.bits!==bits||!challenges.has(value.id))throw 0;
      const digest=createHash('sha256').update(p.token+':'+p.nonce).digest();if(digest[0]!==0||digest[1]!==0)throw 0;
      challenges.delete(value.id);return true;
    }catch{return false;}
  };
  return async function handle(request,ip='unknown'){
    const origin=request.headers.get('Origin'),accepted=!!origin&&(config.allowedOrigins||[]).includes(origin),url=new URL(request.url);
    const reply=(body,status=200,extraHeaders={})=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(accepted?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Campus-Proof','Access-Control-Expose-Headers':'Retry-After','Access-Control-Max-Age':'600'}:{}),...extraHeaders}});
    if(url.pathname==='/health'&&request.method==='GET')return reply({status:'ok'});
    if(url.pathname!=='/analyze')return reply({error:'接口不存在。'},404);
    if(!accepted)return reply({error:'此网页未获准调用整理服务。'},403);
    if(request.method==='OPTIONS')return reply({},204);
    if(request.method!=='POST')return reply({error:'请使用 POST 请求。'},405);
    if(!publicMode&&!authorized(request.headers.get('Authorization')))return reply({error:'访问码不正确，请重新输入。'},401);
    let account=null;
    if(config.requireIdentity){
      const token=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
      account=token&&options.accountForToken?await options.accountForToken(token):null;
      if(!account)return reply({error:'请先登录，再整理通知。',code:'AUTH_REQUIRED'},401);
    }
    if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return reply({error:'请求必须使用 JSON。'},415);
    let notice;
    try{const body=JSON.parse(await boundedText(request.body,64000));if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1)throw new Error();if(Object.hasOwn(body,'notice')){if(typeof body.notice!=='string'||!body.notice.trim()||body.notice.length>D.MAX_TEXT)throw new Error();notice=body.notice.trim();}else if(Object.hasOwn(body,'sources'))notice=body;else throw new Error();modelInput(notice);}
    catch(e){return reply({error:e instanceof ServiceError?e.message:'请提供 1–4,000 字的通知文字。'},e.status||400);}
    const t=now(),hash=createHash('sha256').update(JSON.stringify(modelInput(notice))).digest('hex');
    for(const [k,v] of cache)if(t-v.created>15*60000)cache.delete(k);
    const saved=cache.get(hash);
    if(busy&&!saved)return reply({error:'正在整理另一条通知，请稍后再试。',code:'SERVICE_BUSY',retryAfterSeconds:3},429,{'Retry-After':'3'});
    if(busy&&usage?.day!==day())return reply({error:'正在整理另一条通知，请稍后再试。',code:'SERVICE_BUSY',retryAfterSeconds:3},429,{'Retry-After':'3'});
    if(!usage||usage.day!==day())usage={day:day(),requests:0,input:0,output:0,reasoning:0,...(publicMode?{clients:{}}:{})};
    const requestUsage=usage;
    const accountKey=account?sign(usage.day+':account:'+account.id):null;
    const accountLimit=Number.isInteger(config.accountDailyLimit)&&config.accountDailyLimit>0?config.accountDailyLimit:10;
    if(publicMode)usage.clients??={};const ipKey=sign(usage.day+':'+ip),client=usage.clients?.[ipKey]||{requests:0,times:[]};
    const entries=(publicMode?client.times:(rates.get(ip)||[])).filter(v=>t-v<RATE_WINDOW_MS);
    const proof=request.headers.get('X-Campus-Proof');
    if(proof){if(!publicMode||!verify(proof,ipKey,hash,origin,t))return reply({error:'安全验证已失效，请重新提交。',code:'INVALID_PROOF'},400);}
    else{
      if(entries.length>=RATE_LIMIT){const seconds=Math.max(1,Math.ceil((entries[0]+RATE_WINDOW_MS-t)/1000));return reply({error:`每 3 分钟最多整理 ${RATE_LIMIT} 次，请 ${seconds} 秒后再试。`,code:'IP_RATE_LIMIT',retryAfterSeconds:seconds},429,{'Retry-After':String(seconds)});}
      entries.push(t);
      if(publicMode){client.times=entries;}
      else{rates.set(ip,entries);for(const [k,v] of rates)if(!v.some(x=>t-x<RATE_WINDOW_MS))rates.delete(k);}
    }
    const seconds=Math.ceil((86400000-((t+8*3600000)%86400000))/1000);
    const limited=(error,code)=>reply({error,code,retryAfterSeconds:seconds},429,{'Retry-After':String(seconds)});
    // Paid failures also consume both caps. Cache reuse does not spend the budget.
    if(!saved&&usage.requests>=(config.dailyLimit||30))return limited('今日整理次数已达上限，明天再试。','DAILY_LIMIT');
    if(publicMode&&!saved&&client.requests>=ipLimit)return limited('此网络今日整理次数已达上限，明天再试。','IP_DAILY_LIMIT');
    if(accountKey&&!saved&&(usage.accounts?.[accountKey]||0)>=accountLimit)return limited('此账号今日整理次数已达上限，明天再试。','ACCOUNT_DAILY_LIMIT');
    if(publicMode){
      usage.clients[ipKey]=client;
      // Bound the persisted map: paid clients are at most the global daily cap.
      for(const [k,v] of Object.entries(usage.clients))if(k!==ipKey&&!v.requests&&!v.times.some(x=>t-x<RATE_WINDOW_MS))delete usage.clients[k];
      if(Object.keys(usage.clients).length>2000){delete usage.clients[ipKey];return reply({error:'服务繁忙，请稍后再试。'},503);}
      try{await persist();}catch{return reply({error:'整理服务暂时不可用，请稍后重试。'},503);}
    }
    if(requestUsage!==usage||usage.day!==day())return reply({error:'整理服务时间已更新，请稍后再试。',code:'SERVICE_BUSY',retryAfterSeconds:3},429,{'Retry-After':'3'});
    if(saved)return reply(saved.result);
    if(publicMode&&!proof&&entries.length>=3){
      for(const [id,expires] of challenges)if(expires<=t)challenges.delete(id);
      if(challenges.size>=2000)return reply({error:'服务繁忙，请稍后再试。'},503);
      const id=randomBytes(16).toString('hex'),expires=t+120000;
      const payload=Buffer.from(JSON.stringify({id,ip:ipKey,hash,origin,expires,bits})).toString('base64url');challenges.set(id,expires);
      return reply({code:'VERIFICATION_REQUIRED',challenge:{token:payload+'.'+sign(payload),bits,expires}},428);
    }
    // Recheck after asynchronous persistence; two arrivals must never start two model calls.
    if(busy)return reply({error:'正在整理另一条通知，请稍后再试。',code:'SERVICE_BUSY',retryAfterSeconds:3},429,{'Retry-After':'3'});
    if(usage.requests>=(config.dailyLimit||30))return limited('今日整理次数已达上限，明天再试。','DAILY_LIMIT');
    if(publicMode&&client.requests>=ipLimit)return limited('此网络今日整理次数已达上限，明天再试。','IP_DAILY_LIMIT');
    if(accountKey&&(usage.accounts?.[accountKey]||0)>=accountLimit)return limited('此账号今日整理次数已达上限，明天再试。','ACCOUNT_DAILY_LIMIT');
    busy=true;let tokensRecorded=false;
    const recordTokens=async(stats,finishReason,failureCode)=>{
      for(const key of ['input','output','reasoning'])usage[key]=Math.min(Number.MAX_SAFE_INTEGER,(usage[key]||0)+(stats[key]||0));
      if(finishReason)usage.lastFinishReason=finishReason;if(failureCode)usage.lastFailureCode=failureCode;else delete usage.lastFailureCode;
      tokensRecorded=true;await persist();
    };
    try{
      usage.requests++;if(publicMode)client.requests++;if(accountKey){usage.accounts??={};usage.accounts[accountKey]=(usage.accounts[accountKey]||0)+1;}await persist();
      const output=await analyze(notice,config,modelFetch);await recordTokens(output.usage,output.finishReason);
      if(cache.size>=50)cache.delete(cache.keys().next().value);cache.set(hash,{created:now(),result:output.result});return reply(output.result);
    }catch(e){
      if(e instanceof ServiceError&&e.usage&&!tokensRecorded){try{await recordTokens(e.usage,e.finishReason,e.failureCode);}catch{return reply({error:'整理服务暂时不可用，请稍后重试。'},503);}}
      return reply({error:e instanceof ServiceError?e.message:'整理服务暂时不可用，请稍后重试。'},e.status||503);
    }finally{busy=false;}
  };
}
