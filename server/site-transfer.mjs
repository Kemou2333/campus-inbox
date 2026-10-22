// Temporary opaque ciphertext only. No account database, AI or mail access.
import {mkdir,readdir,readFile,writeFile,rename,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

const SOURCE='https://kemou2333.github.io',TARGET='https://123.57.30.129';
const CHUNK=1024*1024+64,MAX=128*1024*1024,GLOBAL=256*1024*1024,TTL=15*60_000;
const digest=value=>createHash('sha256').update(value).digest();
async function bounded(request,limit){
 const parts=[];let length=0;
 if(request.body)for await(const chunk of request.body){length+=chunk.byteLength;if(length>limit)throw Error('size');parts.push(Buffer.from(chunk));}
 return Buffer.concat(parts);
}
export function createSiteTransfer({directory,now=Date.now,cleanupInterval=60000}){
 const rates=new Map(),requestRates=new Map(),activeClients=new Map();let activeRequests=0;let queue=Promise.resolve();
 // Serialize the small admission/write operations so parallel uploads cannot
 // reserve the same slot or escape the total disk budget.
 const serial=operation=>{const task=queue.then(operation);queue=task.catch(()=>{});return task;};
 async function inventory(){
  await mkdir(directory,{recursive:true,mode:0o700});const active=[];
  for(const name of await readdir(directory)){
   if(!/^[a-f0-9]{32}$/.test(name))continue;
   const folder=join(directory,name);
   try{const meta=JSON.parse(await readFile(join(folder,'meta.json'),'utf8'));
    if(meta.expires<=now()){await rm(folder,{recursive:true,force:true});continue;}
    active.push(meta);
   }catch{const info=await stat(folder);if(info.mtimeMs+TTL<=now())await rm(folder,{recursive:true,force:true});}
  }
  return active;
 }
 async function metadata(id,authorization){
  if(!/^[a-f0-9]{32}$/.test(id))throw Error('missing');
  const token=authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!token)throw Error('missing');
  const meta=JSON.parse(await readFile(join(directory,id,'meta.json'),'utf8'));
  if(meta.expires<=now()||!timingSafeEqual(digest(token),Buffer.from(meta.tokenHash,'hex')))throw Error('missing');
  return meta;
 }
 async function save(meta){const path=join(directory,meta.id,'meta.json'),pending=path+'.pending';await writeFile(pending,JSON.stringify(meta),{mode:0o600});await rename(pending,path);}
 const handle=async(request,ip='unknown')=>{
  const origin=request.headers.get('Origin'),allowed=origin===SOURCE||origin===TARGET;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'}:{})};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
  if(!allowed)return reply({error:'来源不受支持。'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({error:'请求方式不受支持。'},405);
  const path=new URL(request.url).pathname;
  for(const [key,value] of requestRates)if(value.expires<=now())requestRates.delete(key);
  const traffic=requestRates.get(ip)||{count:0,expires:now()+60000};
  if(activeRequests>=4||(activeClients.get(ip)||0)>=2||traffic.count>=400||requestRates.size>=2000)return reply({error:'传输忙，请稍后重试。'},429);
  traffic.count++;requestRates.set(ip,traffic);activeRequests++;activeClients.set(ip,(activeClients.get(ip)||0)+1);
  try{
   if(path==='/site-transfer'){
    if(origin!==SOURCE)return reply({error:'来源不受支持。'},403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'请求格式不正确。'},415);
    const body=JSON.parse((await bounded(request,1024)).toString());
    if(!Number.isSafeInteger(body.parts)||body.parts<1||body.parts>129||!Number.isSafeInteger(body.bytes)||body.bytes<1||body.bytes>MAX||body.parts!==Math.ceil(body.bytes/(1024*1024)))return reply({error:'本机数据超过临时传输限制，原数据仍保留。'},413);
    return await serial(async()=>{
     const active=await inventory(),client=digest(ip).toString('hex');
     for(const [key,value] of rates)if(value.expires<=now())rates.delete(key);
     const rate=rates.get(client)||{count:0,expires:now()+3600_000};
     if(rate.count>=10||active.filter(x=>x.client===client).length>=2||active.filter(x=>x.client===client).reduce((sum,x)=>sum+x.bytes,0)+body.bytes>MAX||rates.size>2000||active.length>=8||active.reduce((sum,x)=>sum+x.bytes,0)+body.bytes>GLOBAL)return reply({error:'临时传输忙，请稍后重试。'},429);
     rate.count++;rates.set(client,rate);
     const id=randomBytes(16).toString('hex'),token=randomBytes(32).toString('base64url');
     await mkdir(join(directory,id),{mode:0o700});
     await save({id,tokenHash:digest(token).toString('hex'),client,parts:body.parts,bytes:body.bytes,expires:now()+60000,ready:false});
     return reply({id,token,expiresIn:TTL/1000});
    });
   }
   const match=path.match(/^\/site-transfer\/([a-f0-9]{32})\/(write|read)\/(\d+)$|^\/site-transfer\/([a-f0-9]{32})\/(ready|manifest|complete)$/);
   if(!match)return reply({error:'传输不存在或已过期。'},404);
   const id=match[1]||match[4],action=match[2]||match[5],part=Number(match[3]);
   if((['write','ready'].includes(action)?origin!==SOURCE:origin!==TARGET))return reply({error:'来源不受支持。'},403);
   const meta=await metadata(id,request.headers.get('Authorization'));
   if(['write','read'].includes(action)&&(!Number.isSafeInteger(part)||part<0||part>=meta.parts))return reply({error:'分片不存在。'},404);
   if(action==='write'){
    if(meta.ready)return reply({error:'传输已封存。'},409);
    const bytes=await bounded(request,CHUNK),expected=Math.min(1024*1024,meta.bytes-part*1024*1024)+28;
    if(bytes.length!==expected)return reply({error:'分片不完整。'},400);
    return await serial(async()=>{
     const fresh=await metadata(id,request.headers.get('Authorization'));if(fresh.ready)return reply({error:'传输已封存。'},409);
     const destination=join(directory,id,String(part));
     try{await writeFile(destination,bytes,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST'||!(await readFile(destination)).equals(bytes))return reply({error:'分片内容冲突。'},409);}
     fresh.expires=now()+TTL;await save(fresh);return reply({saved:true});
    });
   }
   if(action==='ready')return await serial(async()=>{
    for(let i=0;i<meta.parts;i++){const info=await stat(join(directory,id,String(i)));if(info.size!==Math.min(1024*1024,meta.bytes-i*1024*1024)+28)throw Error('incomplete');}
    meta.ready=true;await save(meta);return reply({ready:true});
   });
   if(!meta.ready)return reply({error:'传输尚未完成。'},409);
   if(action==='manifest')return reply({parts:meta.parts,bytes:meta.bytes});
   if(action==='read')return new Response(await readFile(join(directory,id,String(part))),{headers:{...headers,'Content-Type':'application/octet-stream'}});
   if(action==='complete'){await serial(()=>rm(join(directory,id),{recursive:true,force:true}));return reply({completed:true});}
  }catch{return reply({error:'传输未完成，原数据仍在旧网址。'},400);}finally{activeRequests--;const count=(activeClients.get(ip)||1)-1;if(count)activeClients.set(ip,count);else activeClients.delete(ip);}
 };
 const timer=cleanupInterval?setInterval(()=>{void serial(inventory).catch(()=>{});},cleanupInterval):null;timer?.unref();
 handle.close=()=>{if(timer)clearInterval(timer);};
 return handle;
}
