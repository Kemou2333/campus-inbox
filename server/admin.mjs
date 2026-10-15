import {randomBytes} from 'node:crypto';
import {open} from 'node:fs/promises';
import {canonicalUsername} from './auth.mjs';
import {boundedText,ServiceError} from './analyze.mjs';
import {adminHtml} from './admin-ui.mjs';

export async function backupSummary(file){
  if(!file)return {status:'not_configured'};
  let handle;
  try{
    handle=await open(file,'r');const buffer=Buffer.alloc(4097),read=await handle.read(buffer,0,buffer.length,0);if(read.bytesRead>4096)throw new Error('status limit');
    const value=JSON.parse(buffer.subarray(0,read.bytesRead).toString());if(!value||!['running','ok','error'].includes(value.status))throw new Error('status format');
    const safeDate=key=>typeof value[key]==='string'&&value[key].length<=80&&Number.isFinite(Date.parse(value[key]))?value[key]:null;
    const knownErrors=new Set(['BACKUP_CAPACITY','BACKUP_SOURCE_MISSING','BACKUP_INTEGRITY','BACKUP_FAILED']);
    return {status:value.status,lastAttemptAt:safeDate('lastAttemptAt'),lastSuccessAt:safeDate('lastSuccessAt'),sizeBytes:Number.isSafeInteger(value.sizeBytes)&&value.sizeBytes>=0?value.sizeBytes:null,errorCode:knownErrors.has(value.errorCode)?value.errorCode:null};
  }catch(error){return {status:error.code==='ENOENT'?'not_configured':'unavailable'};}finally{await handle?.close();}
}

/** Only deployment configuration grants this read-only capability. User input,
 * synced records, request headers and registered display names cannot grant it. */
export function createAdminService(config,{auth,sync,ai,now=Date.now}){
  const names=new Set((config.usernames||[]).map(canonicalUsername));
  // Pin already-existing account UUIDs at boot. Registering an allowed-looking
  // name after startup cannot turn a normal account into an administrator.
  const owners=new Set(auth.adminReader.list({limit:500}).filter(account=>names.has(account.username)).map(account=>account.id));
  const origins=new Set(config.allowedOrigins||[]);
  const rates=new Map(),enabled=names.size>0;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
  return async function handle(request){
    const url=new URL(request.url),origin=request.headers.get('Origin'),accepted=origins.has(origin);
    const reply=(body,status=200)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Vary':'Origin',...(accepted?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'}:{})}});
    if(!enabled)return reply({error:'接口不存在。'},404);
    if(url.pathname==='/admin'||url.pathname==='/admin/'){
      if(!['GET','HEAD'].includes(request.method))return reply({error:'请使用支持的请求方法。'},405);
      const nonce=randomBytes(24).toString('base64');
      return new Response(request.method==='HEAD'?null:adminHtml(nonce),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; base-uri 'none'; frame-ancestors 'none'; frame-src https://kemou2333.github.io; form-action 'self'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'`}});
    }
    if(!accepted)return reply({error:'此应用未获准访问后台。'},403);
    if(request.method==='OPTIONS')return reply({},204);
    if(!['GET','POST'].includes(request.method))return reply({error:'后台仅支持读取。'},405);
    const key=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1],identity=key?auth.getIdentity(key):null;
    if(!identity)return reply({error:'请先登录管理员账号。',code:'AUTH_REQUIRED'},401);
    if(identity.provider!=='invite'||!names.has(identity.username)||!owners.has(identity.subject))return reply({error:'此账号没有后台权限。'},403);
    const t=now(),times=(rates.get(identity.subject)||[]).filter(time=>t-time<60000);
    if(times.length>=60)return reply({error:'后台刷新较多，请稍后再试。'},429);
    times.push(t);rates.set(identity.subject,times);
    for(const [id,entries] of rates)if(!entries.some(time=>t-time<60000))rates.delete(id);
    try{
      if(request.method==='POST'){
        if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))throw new ServiceError('读取请求必须使用 JSON。',415);
        let value;try{value=JSON.parse(await boundedText(request.body,1024));}catch{throw new ServiceError('读取请求格式不正确。',400);}
        if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length)throw new ServiceError('后台不接受修改参数。',400);
      }
      if(url.pathname==='/admin/summary')return reply({accounts:auth.adminReader.count(),...sync.adminReader.summary(),daily:sync.adminReader.daily(),usage:ai.adminSummary(),backup:await backupSummary(config.backupStateFile),readOnly:true});
      if(url.pathname==='/admin/accounts'){
        const raw=url.searchParams.get('offset')||'0';if(!/^\d{1,5}$/.test(raw))throw new ServiceError('分页位置不正确。',400);
        const offset=Number(raw),accounts=auth.adminReader.list({offset,limit:51}),hasMore=accounts.length>50;
        return reply({accounts:accounts.slice(0,50).map(account=>({...account,...sync.adminReader.accountStats(account.id)})),hasMore,nextOffset:hasMore?offset+50:null});
      }
      const recordsPath=url.pathname.match(/^\/admin\/accounts\/([0-9a-f-]{36})\/records(?:\/(.+))?$/);
      if(recordsPath){
        const subject=recordsPath[1];
        if(recordsPath[2]){
          let id;try{id=decodeURIComponent(recordsPath[2]);if(!id||id.length>150||id!==id.trim())throw 0;}catch{throw new ServiceError('通知编号不正确。',400);}
          const result=sync.adminReader.record(subject,id);return result?reply(result):reply({error:'通知不存在或已删除。'},404);
        }
        const raw=url.searchParams.get('before');let before;
        if(raw){try{if(raw.length>1024)throw 0;before=JSON.parse(Buffer.from(raw,'base64url').toString());if(!Array.isArray(before)||before.length!==2||!Number.isSafeInteger(before[0])||before[0]<1||typeof before[1]!=='string'||!before[1]||before[1].length>150)throw 0;}catch{throw new ServiceError('分页位置不正确。',400);}}
        const rows=sync.adminReader.records({subject,before,limit:21}),hasMore=rows.length>20,records=rows.slice(0,20),last=records.at(-1);
        return reply({records,hasMore,nextBefore:hasMore?Buffer.from(JSON.stringify([last.version,last.id])).toString('base64url'):null});
      }
      if(url.pathname==='/admin/jobs'){
        const subject=url.searchParams.get('account')||undefined,beforeRaw=url.searchParams.get('before');
        if(subject&&!/^[0-9a-f-]{36}$/.test(subject))throw new ServiceError('账号编号不正确。',400);
        let before;
        if(beforeRaw){try{if(beforeRaw.length>500)throw 0;before=JSON.parse(Buffer.from(beforeRaw,'base64url').toString());if(!Array.isArray(before)||before.length!==2||typeof before[0]!=='string'||!Number.isFinite(Date.parse(before[0]))||typeof before[1]!=='string'||!/^[0-9a-f-]{36}$/.test(before[1]))throw 0;}catch{throw new ServiceError('分页位置不正确。',400);}}
        const rows=sync.adminReader.jobs({subject,before,limit:21}),hasMore=rows.length>20,jobs=rows.slice(0,20),last=jobs.at(-1);
        const namesByID=new Map(auth.adminReader.list({limit:500}).map(account=>[account.id,account.username]));
        return reply({jobs:jobs.map(job=>({...job,username:namesByID.get(job.ownerSubject)||'已停用账号'})),hasMore,nextBefore:hasMore?Buffer.from(JSON.stringify([last.createdAt,last.id])).toString('base64url'):null});
      }
      if(/^\/admin\/jobs\/[0-9a-f-]{36}$/.test(url.pathname)){
        const job=sync.adminReader.job(url.pathname.split('/').at(-1));
        return job?reply({job}):reply({error:'任务不存在。'},404);
      }
      return reply({error:'接口不存在。'},404);
    }catch(error){return reply({error:error instanceof ServiceError?error.message:'后台暂时无法读取。'},error.status||503);}
  };
}
