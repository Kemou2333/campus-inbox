import {createHash,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {analyze,boundedText,ServiceError,modelInput} from './analyze.mjs';
const D=globalThis.CampusData;
const RATE_WINDOW_MS=180000,RATE_LIMIT=5;
export async function createService(config,options={}){
  if(!config.apiKey||!config.accessToken||config.accessToken.length<20)throw new Error('Server secrets are missing or too short');
  const now=options.now||Date.now,modelFetch=options.modelFetch||fetch,cache=new Map(),rates=new Map();
  let usage=null,busy=false;
  const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
  if(config.stateFile){try{usage=JSON.parse(await readFile(config.stateFile,'utf8'));if(!usage||typeof usage.day!=='string'||!Number.isSafeInteger(usage.requests)||usage.requests<0||['input','output','reasoning'].some(key=>usage[key]!==undefined&&(!Number.isSafeInteger(usage[key])||usage[key]<0)))throw new Error('Invalid quota state');for(const key of ['input','output','reasoning'])usage[key]??=0;}catch(e){if(e.code!=='ENOENT')throw e;}}
  const persist=async()=>{if(config.stateFile){await writeFile(config.stateFile+'.tmp',JSON.stringify(usage),{mode:0o600});await rename(config.stateFile+'.tmp',config.stateFile);}};
  const authorized=header=>{const actual=createHash('sha256').update(header||'').digest(),expected=createHash('sha256').update('Bearer '+config.accessToken).digest();return timingSafeEqual(actual,expected);};
  return async function handle(request,ip='unknown'){
    const origin=request.headers.get('Origin'),allow=config.allowedOrigins||[],accepted=!!origin&&allow.includes(origin),url=new URL(request.url);
    const reply=(body,status=200,extraHeaders={})=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(accepted?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Expose-Headers':'Retry-After','Access-Control-Max-Age':'600'}:{}),...extraHeaders}});
    if(url.pathname==='/health'&&request.method==='GET')return reply({status:'ok'});
    if(url.pathname!=='/analyze')return reply({error:'接口不存在。'},404);
    if(!accepted)return reply({error:'此网页未获准调用整理服务。'},403);
    if(request.method==='OPTIONS')return reply({},204);
    if(request.method!=='POST')return reply({error:'请使用 POST 请求。'},405);
    if(!authorized(request.headers.get('Authorization')))return reply({error:'访问码不正确，请重新输入。'},401);
    if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return reply({error:'请求必须使用 JSON。'},415);
    const t=now(),entries=(rates.get(ip)||[]).filter(v=>t-v<RATE_WINDOW_MS);
    if(entries.length>=RATE_LIMIT){
      const retryAfter=Math.max(1,Math.ceil((entries[0]+RATE_WINDOW_MS-t)/1000));
      return reply({error:`每 3 分钟最多整理 ${RATE_LIMIT} 次，请 ${retryAfter} 秒后再试。`,code:'IP_RATE_LIMIT',retryAfterSeconds:retryAfter},429,{'Retry-After':String(retryAfter)});
    }
    entries.push(t);rates.set(ip,entries);for(const [k,v] of rates)if(!v.some(x=>t-x<RATE_WINDOW_MS))rates.delete(k);
    let notice;
    try{const body=JSON.parse(await boundedText(request.body,64000));if(!body||typeof body.notice!=='string'||!body.notice.trim()||body.notice.length>D.MAX_TEXT||Object.keys(body).some(k=>k!=='notice'))throw new Error();notice=body.notice.trim();modelInput(notice);}
    catch(e){return reply({error:e instanceof ServiceError?e.message:'请提供 1–4,000 字的通知文字。'},e.status||400);}
    const hash=createHash('sha256').update(notice).digest('hex');
    for(const [k,v] of cache)if(t-v.created>15*60000)cache.delete(k);
    const saved=cache.get(hash);if(saved)return reply(saved.result);
    if(busy)return reply({error:'正在整理另一条通知，请稍后再试。',code:'SERVICE_BUSY',retryAfterSeconds:3},429,{'Retry-After':'3'});
    if(usage?.day!==day())usage={day:day(),requests:0,input:0,output:0,reasoning:0};
    if(usage.requests>=(config.dailyLimit||30)){
      const retryAfter=Math.ceil((86400000-((t+8*3600000)%86400000))/1000);
      return reply({error:'今日整理次数已达上限，明天再试。',code:'DAILY_LIMIT',retryAfterSeconds:retryAfter},429,{'Retry-After':String(retryAfter)});
    }
    busy=true;
    let tokensRecorded=false;
    const recordTokens=async(stats,finishReason,failureCode)=>{
      // Only numeric metering survives a request, including paid failures.
      // Completion tokens already include reasoning; keep it as a separate detail.
      for(const key of ['input','output','reasoning'])usage[key]=Math.min(Number.MAX_SAFE_INTEGER,(usage[key]||0)+(stats[key]||0));
      if(finishReason)usage.lastFinishReason=finishReason;
      if(failureCode)usage.lastFailureCode=failureCode;else delete usage.lastFailureCode;
      tokensRecorded=true;await persist();
    };
    try{
      usage.requests++;await persist();
      const output=await analyze(notice,config,modelFetch);
      await recordTokens(output.usage,output.finishReason);
      if(cache.size>=50)cache.delete(cache.keys().next().value);
      cache.set(hash,{created:now(),result:output.result});return reply(output.result);
    }catch(e){
      if(e instanceof ServiceError&&e.usage&&!tokensRecorded){
        try{await recordTokens(e.usage,e.finishReason,e.failureCode);}catch{return reply({error:'整理服务暂时不可用，请稍后重试。'},503);}
      }
      return reply({error:e instanceof ServiceError?e.message:'整理服务暂时不可用，请稍后重试。'},e.status||503);
    }
    finally{busy=false;}
  };
}
