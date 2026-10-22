import {allLocalFiles,appendLocalFiles,type StoredAttachment,MAX_FILE_BYTES} from './attachment-store';
import {isSiteKey,planSiteMerge,type SiteStorage} from './site-data-merge';

const SOURCE='https://kemou2333.github.io',TARGET='https://123.57.30.129',HOME=TARGET+'/';
const PENDING='campus-inbox:site-transfer:pending',CHUNK=1024*1024,MAX=128*CHUNK;
interface FileCopy {id:string;name:string;type:string;size:number;data:string}
interface Snapshot {version:1;source:string;storage:SiteStorage;session:SiteStorage;files:FileCopy[]}
interface Receipt {fingerprint?:string;storage:SiteStorage;mapping:Record<string,{digest:string;id:string}>}
const encode=(bytes:Uint8Array)=>{let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');};
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const sha=async(data:BufferSource)=>encode(new Uint8Array(await crypto.subtle.digest('SHA-256',data)));
function storageValues(store:Storage):SiteStorage{const values:SiteStorage={};for(let i=0;i<store.length;i++){const key=store.key(i);if(key&&isSiteKey(key))values[key]=store.getItem(key)!;}return values;}

async function archiveDatabase():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{const request=indexedDB.open('campus-inbox-site-merge',1);request.onupgradeneeded=()=>{request.result.createObjectStore('archives');request.result.createObjectStore('receipts');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('合并备份无法保存，原数据未改动。'));});
}
async function readReceipt(db:IDBDatabase):Promise<Receipt>{return new Promise((resolve,reject)=>{const request=db.transaction('receipts').objectStore('receipts').get(SOURCE);request.onsuccess=()=>resolve(request.result??{storage:{},mapping:{}});request.onerror=()=>reject(new Error('合并记录暂时无法读取。'));});}
async function archive(db:IDBDatabase,id:string,data:unknown,receipt?:Receipt):Promise<void>{return new Promise((resolve,reject)=>{const tx=db.transaction(['archives','receipts'],'readwrite');tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(new Error('本机空间不足，原数据未覆盖。'));tx.objectStore('archives').put(data,id);if(receipt)tx.objectStore('receipts').put(receipt,SOURCE);});}

function validateSnapshot(value:unknown):asserts value is Snapshot{
 const x=value as Snapshot;
 if(!x||x.version!==1||x.source!==SOURCE||!x.storage||!x.session||!Array.isArray(x.files)||x.files.length>20000)throw new Error('旧站数据格式不正确，原数据仍保留。');
 for(const values of [x.storage,x.session]){
  if(typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>10000)throw new Error('旧站数据格式不正确。');
  for(const [key,raw] of Object.entries(values))if(!isSiteKey(key)||typeof raw!=='string')throw new Error('旧站数据范围不正确。');
 }
 const ids=new Set<string>();for(const file of x.files){if(!file||typeof file.id!=='string'||!file.id||file.id.length>150||ids.has(file.id)||typeof file.name!=='string'||file.name.length>250||typeof file.type!=='string'||file.type.length>100||!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_FILE_BYTES||typeof file.data!=='string'||file.data.length>Math.ceil(MAX_FILE_BYTES/3)*4||!/^[A-Za-z0-9_-]*$/.test(file.data))throw new Error('旧站附件格式不正确。');ids.add(file.id);}
}
async function applySnapshot(snapshot:Snapshot,id:string){
 validateSnapshot(snapshot);
 const db=await archiveDatabase();
 try{
  const previous=await readReceipt(db),before=storageValues(localStorage),beforeSession=storageValues(sessionStorage);
  // Do not merge two different signed-in identities into the same local list.
  planSiteMerge(before,snapshot.storage,previous.storage);
  const fingerprint=await sha(new TextEncoder().encode(JSON.stringify(snapshot)));
  if(previous.fingerprint===fingerprint)return;
  await archive(db,id,{source:snapshot,destination:{storage:before,session:beforeSession},createdAt:new Date().toISOString()});
  const existing=new Map((await allLocalFiles()).map(file=>[file.id,file])),mapping={...previous.mapping},idMap=new Map<string,string>(),additions:StoredAttachment[]=[];
  for(const file of snapshot.files){
   const bytes=decode(file.data);if(bytes.byteLength!==file.size)throw new Error('附件校验失败，原文件未覆盖。');
   const hash=await sha(bytes),remembered=mapping[file.id];let target=remembered?.digest===hash?remembered.id:file.id;
   const current=existing.get(target);
   if(current&&await sha(await current.blob.arrayBuffer())!==hash)target=crypto.randomUUID();
   if(!existing.has(target)){const record={id:target,name:file.name,type:file.type,size:file.size,blob:new Blob([bytes],{type:file.type})};additions.push(record);existing.set(target,record);}
   idMap.set(file.id,target);mapping[file.id]={digest:hash,id:target};
  }
  const rewrite=(value:unknown):unknown=>typeof value==='string'?idMap.get(value)??value:Array.isArray(value)?value.map(rewrite):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rewrite(item)])):value;
  const remap=(values:SiteStorage):SiteStorage=>Object.fromEntries(Object.entries(values).map(([key,raw])=>{try{return [key,JSON.stringify(rewrite(JSON.parse(raw)))];}catch{return [key,raw];}}));
  const incoming=remap(snapshot.storage),sessions=remap(snapshot.session),changes=planSiteMerge(before,incoming,previous.storage,Object.fromEntries([...existing.values()].map(file=>[file.id,file.size])));
  const sessionChanges=planSiteMerge(beforeSession,sessions);
  if(additions.length)await appendLocalFiles(additions);
  // Guard against a second tab changing either store while files were saved.
  for(const [store,original] of [[localStorage,before],[sessionStorage,beforeSession]] as const){if(JSON.stringify(storageValues(store))!==JSON.stringify(original))throw new Error('另一标签页刚更新了内容，请刷新后继续合并。');}
  const written:Array<[Storage,string,string|null,string]>=[];
  try{
   for(const [store,values] of [[localStorage,changes],[sessionStorage,sessionChanges]] as const)for(const [key,raw] of Object.entries(values)){written.push([store,key,store.getItem(key),raw]);store.setItem(key,raw);}
   await archive(db,id,{source:snapshot,destination:{storage:before,session:beforeSession},createdAt:new Date().toISOString(),merged:true},{storage:incoming,mapping,fingerprint});
  }catch(error){for(const [store,key,raw,wrote] of written.reverse()){if(store.getItem(key)!==wrote)continue;if(raw===null)store.removeItem(key);else store.setItem(key,raw);}throw error;}
 }finally{db.close();}
}

async function post(path:string,body:BodyInit,token?:string,binary=false){
 const response=await fetch(HOME+'site-transfer'+path,{method:'POST',headers:{'Content-Type':binary?'application/octet-stream':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body,cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('数据暂时未能合并，原数据仍在旧网址。');return response;
}
async function exportSnapshot():Promise<Snapshot>{
 const files:FileCopy[]=[];let size=0;
 for(const file of await allLocalFiles()){
  size+=file.size;if(size>88*CHUNK)throw new Error('附件较多，请先导出完整备份；原网址仍可使用。');
  files.push({id:file.id,name:file.name,type:file.type,size:file.size,data:encode(new Uint8Array(await file.blob.arrayBuffer()))});
 }
 return {version:1,source:SOURCE,storage:storageValues(localStorage),session:storageValues(sessionStorage),files};
}
async function send(){
 const snapshot=await exportSnapshot();
 if(!Object.keys(snapshot.storage).length&&!Object.keys(snapshot.session).length&&!snapshot.files.length){location.replace(HOME+location.search);return;}
 const bytes=new TextEncoder().encode(JSON.stringify(snapshot));if(bytes.byteLength>MAX)throw new Error('本机数据较多，请先导出备份；原网址仍可使用。');
 const keyBytes=crypto.getRandomValues(new Uint8Array(32)),key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt']);
 const {id,token}=await (await post('',JSON.stringify({parts:Math.ceil(bytes.length/CHUNK),bytes:bytes.length}))).json();
 if(!/^[a-f0-9]{32}$/.test(id)||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('传输入口暂时不可用。');
 for(let part=0;part<Math.ceil(bytes.length/CHUNK);part++){
  const iv=crypto.getRandomValues(new Uint8Array(12)),aad=new TextEncoder().encode(id+':'+part),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,bytes.subarray(part*CHUNK,(part+1)*CHUNK)));
  const payload=new Uint8Array(iv.length+cipher.length);payload.set(iv);payload.set(cipher,iv.length);await post('/'+id+'/write/'+part,payload,token,true);
 }
 await post('/'+id+'/ready','{}',token);
 // Disclose only this trusted source origin for the one authenticated handoff.
 document.querySelector<HTMLMetaElement>('meta[name="referrer"]')?.setAttribute('content','origin');
 location.replace(HOME+location.search+'#campus-transfer='+[id,token,encode(keyBytes)].join('.'));
}
async function receive(value:string){
 const [id,token,rawKey,...extra]=value.split('.');if(extra.length||!/^[a-f0-9]{32}$/.test(id)||!/^[A-Za-z0-9_-]{43}$/.test(token)||!/^[A-Za-z0-9_-]{43}$/.test(rawKey))throw new Error('合并地址不完整，原数据仍保留。');
 const key=await crypto.subtle.importKey('raw',decode(rawKey),'AES-GCM',false,['decrypt']);
 const manifest=await (await post('/'+id+'/manifest','{}',token)).json();
 if(!Number.isSafeInteger(manifest.bytes)||manifest.bytes<1||manifest.bytes>MAX||manifest.parts!==Math.ceil(manifest.bytes/CHUNK))throw new Error('传输大小不正确。');
 const bytes=new Uint8Array(manifest.bytes);let offset=0;
 for(let part=0;part<manifest.parts;part++){
  const encrypted=new Uint8Array(await (await post('/'+id+'/read/'+part,'{}',token)).arrayBuffer());
  const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:encrypted.subarray(0,12),additionalData:new TextEncoder().encode(id+':'+part)},key,encrypted.subarray(12)));
  if(plain.length!==Math.min(CHUNK,manifest.bytes-offset))throw new Error('传输未完整收到。');bytes.set(plain,offset);offset+=plain.length;
 }
 await applySnapshot(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),id);
 sessionStorage.removeItem(PENDING);
 // A failed cleanup must not undo a completed, locally verified import.
 try{await post('/'+id+'/complete','{}',token);}catch{/* Encrypted relay expires automatically. */}
}
function status(message:string){const root=document.getElementById('root')!;root.replaceChildren();const text=document.createElement('p');text.textContent=message;text.setAttribute('role','status');text.style.cssText='margin:35vh auto 0;text-align:center;font:16px system-ui;color:#315950';root.append(text);}

/** Run before mounting repositories, so no blank initial state can overwrite imports. */
export async function prepareSiteEntry():Promise<boolean>{
 if(window.top!==window||window.CampusNative?.postMessage)return true;
 if(location.origin===SOURCE&&location.pathname.startsWith('/campus-inbox/')){
  if(new URLSearchParams(location.search).get('stay')==='1')return true;
  status('正在合并本机数据…');
  try{await send();return false;}catch{status('暂时无法切换，原来的数据仍在这里。');const button=document.createElement('button');button.textContent='继续使用备用入口';button.onclick=()=>{const url=new URL(location.href);url.searchParams.set('stay','1');location.replace(url);};button.style.cssText='display:block;margin:24px auto;padding:12px 20px';document.getElementById('root')!.append(button);return false;}
 }
 if(location.origin===TARGET){
  const hash=location.hash.startsWith('#campus-transfer=')?location.hash.slice('#campus-transfer='.length):null;
  if(hash){
   // Prevent a link from another site from fixing an attacker's login session.
   let trusted=false;try{trusted=new URL(document.referrer).origin===SOURCE;}catch{}
   history.replaceState(null,'',location.pathname+location.search);
   if(!trusted){status('合并入口无效，请从原来的 GitHub 网址打开。');return false;}
   sessionStorage.setItem(PENDING,hash);
  }
  const pending=sessionStorage.getItem(PENDING);
  if(pending){status('正在合并本机数据…');try{await receive(pending);}catch(error){status(error instanceof Error&&/[\u4e00-\u9fff]/.test(error.message)?error.message:'合并未完成，原数据仍保留。');const retry=document.createElement('button');retry.textContent='重新合并';retry.onclick=()=>location.reload();retry.style.cssText='display:block;margin:24px auto;padding:12px 20px';const home=document.createElement('button');home.textContent='先打开主页';home.onclick=()=>{sessionStorage.removeItem(PENDING);location.reload();};home.style.cssText=retry.style.cssText;document.getElementById('root')!.append(retry,home);return false;}}
 }
 return true;
}
