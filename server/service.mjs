import {createHash,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {analyze,boundedText,ServiceError} from './analyze.mjs';
const D=globalThis.CampusData;
export async function createService(config,options={}){
  if(!config.apiKey||!config.accessToken||config.accessToken.length<20)throw new Error('Server secrets are missing or too short');
  const now=options.now||Date.now,modelFetch=options.modelFetch||fetch,cache=new Map(),rates=new Map();
  let usage=null,busy=false;
  const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
  if(config.stateFile){try{usage=JSON.parse(await readFile(config.stateFile,'utf8'));if(!usage||typeof usage.day!=='string'||!Number.isInteger(usage.requests)||usage.requests<0)throw new Error('Invalid quota state');}catch(e){if(e.code!=='ENOENT')throw e;}}
  const persist=async()=>{if(config.stateFile){await writeFile(config.stateFile+'.tmp',JSON.stringify(usage),{mode:0o600});await rename(config.stateFile+'.tmp',config.stateFile);}};
  const authorized=header=>{const actual=createHash('sha256').update(header||'').digest(),expected=createHash('sha256').update('Bearer '+config.accessToken).digest();return timingSafeEqual(actual,expected);};
  return async function handle(request,ip='unknown'){
    const origin=request.headers.get('Origin'),allow=config.allowedOrigins||[],accepted=!!origin&&allow.includes(origin),url=new URL(request.url);
    const reply=(body,status=200)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(accepted?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'}:{})}});
    if(url.pathname==='/health'&&request.method==='GET')return reply({status:'ok'});
    if(url.pathname!=='/analyze')return reply({error:'接口不存在。'},404);
    if(!accepted)return reply({error:'此网页未获准调用整理服务。'},403);
    if(request.method==='OPTIONS')return reply({},204);
    if(request.method!=='POST')return reply({error:'请使用 POST 请求。'},405);
    if(!authorized(request.headers.get('Authorization')))return reply({error:'访问码不正确，请重新输入。'},401);
    if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return reply({error:'请求必须使用 JSON。'},415);
    const t=now(),entries=(rates.get(ip)||[]).filter(v=>t-v<60000);
    if(entries.length>=5)return reply({error:'整理过于频繁，请一分钟后再试。'},429);
    entries.push(t);rates.set(ip,entries);for(const [k,v] of rates)if(!v.some(x=>t-x<60000))rates.delete(k);
    let notice;
    try{const body=JSON.parse(await boundedText(request.body,64000));if(!body||typeof body.notice!=='string'||!body.notice.trim()||body.notice.length>D.MAX_TEXT||Object.keys(body).some(k=>k!=='notice'))throw new Error();notice=body.notice.trim();}
    catch(e){return reply({error:e instanceof ServiceError?e.message:'请提供 1–12,000 字的通知文字。'},e.status||400);}
    const hash=createHash('sha256').update(notice).digest('hex');
    for(const [k,v] of cache)if(t-v.created>15*60000)cache.delete(k);
    const saved=cache.get(hash);if(saved)return reply(saved.result);
    if(busy)return reply({error:'正在整理另一条通知，请稍后再试。'},429);
    if(usage?.day!==day())usage={day:day(),requests:0,input:0,output:0};
    if(usage.requests>=(config.dailyLimit||30))return reply({error:'今日整理次数已达上限，明天再试。'},429);
    busy=true;
    try{
      usage.requests++;await persist();
      const output=await analyze(notice,config,modelFetch);
      usage.input+=output.usage.input;usage.output+=output.usage.output;await persist();
      if(cache.size>=50)cache.delete(cache.keys().next().value);
      cache.set(hash,{created:now(),result:output.result});return reply(output.result);
    }catch(e){return reply({error:e instanceof ServiceError?e.message:'整理服务暂时不可用，请稍后重试。'},e.status||503);}
    finally{busy=false;}
  };
}
