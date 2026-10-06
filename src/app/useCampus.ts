import {useEffect, useRef, useState} from 'react';
import {createLocalRepository} from '../infrastructure/local-repository';
import {createCloudSync, type CloudSync, type SyncState} from '../infrastructure/sync-client';
import {createAuthClient, type AuthClient, type AuthSession} from '../infrastructure/auth-client';
import {analyzeSources} from '../infrastructure/ai-client';
import {addFiles, cleanupFiles, exportFiles, getFile, restoreFiles, MAX_NOTICE_FILES, MAX_NOTICE_FILE_BYTES} from '../infrastructure/attachment-store';
import {createNotice, exportBackup, newID, parseAnalysisBatch, parseBackup, parseNotices} from '../domain/notice';
import type {Notice} from '../domain/types';
import {createPlatform, type PlatformCapabilities} from '../platform';
import {loadConfig, type RuntimeConfig} from './config';
import type {ThemePreference} from './theme';

export interface Draft {id:string; text:string; attachments:string[]}
export interface Toast {id:number; text:string; undo?:()=>void}
const DRAFT_KEY='campus-inbox:draft:v5';
const RESULT_KEY='campus-inbox:pending-analysis:v5';
const USERNAME_KEY='campus-inbox:account-username:v1';
const makeDraft=():Draft=>({id:newID(),text:'',attachments:[]});
const message=(e:unknown)=>e instanceof Error?e.message:'操作未完成，请重试。';
const initialSync:SyncState={connected:false,status:'disconnected',lastSyncedAt:null,error:null,pendingChanges:0,hasMore:false,conflicts:[]};

/** Business operations live here; presentation components do not write storage or call AI. */
export function useCampus(){
 const [platform]=useState(createPlatform);
 const [repository]=useState(createLocalRepository);
 const [boot]=useState(()=>{try{return {notices:repository.load(),error:''};}catch(e){return {notices:[] as Notice[],error:message(e)};}});
 const [notices,setNotices]=useState(boot.notices);
 const [error,setError]=useState(boot.error);
 const [config,setConfig]=useState<RuntimeConfig|null>(null);
 const [capabilities,setCapabilities]=useState<PlatformCapabilities|null>(null);
 const [cloud,setCloud]=useState<CloudSync|null>(null);
 const [auth,setAuth]=useState<AuthClient|null>(null);
 const [sync,setSync]=useState(initialSync);
 const [username,setUsername]=useState(()=>localStorage.getItem(USERNAME_KEY)||'');
 const [theme,setThemeState]=useState<ThemePreference>(()=>{
  const t=localStorage.getItem('campus-inbox:theme:v5');return t==='dark'||t==='light'?t:'system';
 });
 const [drafts,setDrafts]=useState<Draft[]>(()=>{
  try{const value=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');
   if(Array.isArray(value)&&value.length&&value.length<=20&&value.every(d=>typeof d.id==='string'&&typeof d.text==='string'&&Array.isArray(d.attachments)&&d.attachments.every((a:unknown)=>typeof a==='string')))return value;
  }catch{/* An unusable draft is not a notification backup. */}
  return [makeDraft()];
 });
 const [busy,setBusy]=useState(false);
 const [stage,setStage]=useState('');
 const [toast,setToast]=useState<Toast|null>(null);
 const [pending,setPending]=useState(()=>!!localStorage.getItem(RESULT_KEY));
 const resultRef=useRef<{sources:Draft[];result:unknown}|null>(null);
 const abort=useRef<AbortController|null>(null);
 const draftRef=useRef(drafts);draftRef.current=drafts;
 const noticeRef=useRef(notices);noticeRef.current=notices;
 const draftWriteError=useRef(false);
 const receivingShare=useRef(false);

 function tell(text:string,undo?:()=>void){setToast({id:Date.now(),text,undo});}
 function report(e:unknown){setError(message(e));}
 function setTheme(value:ThemePreference){localStorage.setItem('campus-inbox:theme:v5',value);setThemeState(value);}
 function save(next:Notice[]){repository.save(next);setNotices(next);}
 function update(id:string,change:(n:Notice)=>Notice){
  try{const current=repository.load();const before=current.find(n=>n.id===id);if(!before){tell('这条通知已在其他设备上移除。');return;}
   const after=change(before);save(current.map(n=>n.id===id?after:n));return {before,after};
  }catch(e){report(e);}
 }
 function undoChange(before:Notice,after:Notice|null){
  try{const current=repository.load(),found=current.find(n=>n.id===before.id);
   if(after?JSON.stringify(found)!==JSON.stringify(after):!!found){tell('这条通知已有新修改，无法撤销旧操作。');return;}
   save([...current.filter(n=>n.id!==before.id),{...before,updatedAt:new Date().toISOString()}]);tell('已撤销');
  }catch(e){report(e);}
 }
 function remove(id:string){
  try{const current=repository.load(),before=current.find(n=>n.id===id);if(!before)return;
   save(current.filter(n=>n.id!==id));tell('已删除',()=>undoChange(before,null));
  }catch(e){report(e);}
 }
 function act(id:string,change:(n:Notice)=>Notice,text:string){const result=update(id,change);if(result)tell(text,()=>undoChange(result.before,result.after));}

 useEffect(()=>repository.subscribe(setNotices),[repository]);
 useEffect(()=>{let alive=true;void loadConfig(platform.kind==='android').then(value=>{if(alive)setConfig(value);});
  void platform.ready.then(value=>{if(alive)setCapabilities(value);}).catch(report);
  return()=>{alive=false;platform.dispose();abort.current?.abort();};
 },[platform]);
 useEffect(()=>{try{localStorage.setItem(DRAFT_KEY,JSON.stringify(drafts));draftWriteError.current=false;}
  catch(e){if(!draftWriteError.current){report(e);draftWriteError.current=true;}}
 },[drafts]);
 useEffect(()=>{
  if(!config||boot.error)return;
  let c:CloudSync;
  try{c=createCloudSync(repository,config.syncEndpoint);}catch(e){report(e);return;}
  const a=createAuthClient(config.syncEndpoint);setCloud(c);setAuth(a);
  const unsubscribe=c.subscribe(setSync);
  let alive=true;
  const key=c.getKey();
  if(key)void a.status(key).then(status=>{if(!alive)return;if(status){setUsername(status.username);localStorage.setItem(USERNAME_KEY,status.username);void c.syncNow();}
   else {c.disconnect();tell('登录已过期，请重新登录。');}
  }).catch(()=>{/* Offline work remains available; server authenticates every request. */});
  return()=>{alive=false;unsubscribe();};
 },[config,repository,boot.error]);
 useEffect(()=>{
  if(!cloud||!sync.connected)return;
  const kick=()=>{if(document.visibilityState==='visible')void cloud.syncNow();};
  const timer=setInterval(kick,20_000);window.addEventListener('online',kick);window.addEventListener('focus',kick);document.addEventListener('visibilitychange',kick);
  return()=>{clearInterval(timer);window.removeEventListener('online',kick);window.removeEventListener('focus',kick);document.removeEventListener('visibilitychange',kick);};
 },[cloud,sync.connected]);
 useEffect(()=>{if(!cloud||!sync.connected)return;const timer=setTimeout(()=>void cloud.syncNow(),700);return()=>clearTimeout(timer);},[notices,cloud,sync.connected]);

 async function login(session:AuthSession){
  if(!cloud)throw new Error('同步服务尚未准备好。');
  setUsername(session.username);localStorage.setItem(USERNAME_KEY,session.username);
  await cloud.connect(session.key);tell('已登录，通知会自动同步。');
 }
 async function logout(){
  const key=cloud?.getKey();
  // Revoke first. A network failure must not leave a supposedly revoked session usable.
  if(key&&auth)await auth.logout(key);
  cloud?.disconnect();tell('已退出，本机通知仍然保留。');
 }
 function replaceDrafts(next:Draft[]){draftRef.current=next;setDrafts(next);}
 function changeDraft(id:string,text:string){replaceDrafts(draftRef.current.map(d=>d.id===id?{...d,text}:d));}
 function addDraft(text=''){if(draftRef.current.length>=20){tell('一次最多整理 20 条通知。');return;}replaceDrafts([...draftRef.current,{...makeDraft(),text}]);}
 async function attach(id:string,files:File[]){
  const target=draftRef.current.find(d=>d.id===id);if(!target||busy)return;
  if(target.attachments.length+files.length>MAX_NOTICE_FILES)throw new Error(`每条通知最多 ${MAX_NOTICE_FILES} 个附件。`);
  const existing=await Promise.all(target.attachments.map(getFile));
  if(existing.reduce((n,f)=>n+(f?.size??0),0)+files.reduce((n,f)=>n+f.size,0)>MAX_NOTICE_FILE_BYTES)throw new Error('每条通知的附件总大小最多 20 MB。');
  const ids=await addFiles(files);const current=draftRef.current;
  if(!current.some(d=>d.id===id)){await cleanupFiles(ids,[...noticeRef.current,...current.map(d=>({attachments:d.attachments}) as Notice)]);return;}
  replaceDrafts(current.map(d=>d.id===id?{...d,attachments:[...d.attachments,...ids]}:d));
 }
 async function detach(draftID:string,fileID:string){
  const next=draftRef.current.map(d=>d.id===draftID?{...d,attachments:d.attachments.filter(id=>id!==fileID)}:d);replaceDrafts(next);
  await cleanupFiles([fileID],[...noticeRef.current,...next.map(d=>({attachments:d.attachments}) as Notice)]);
 }
 async function removeDraft(id:string){
  const removed=draftRef.current.find(d=>d.id===id);const next=draftRef.current.filter(d=>d.id!==id);const final=next.length?next:[makeDraft()];replaceDrafts(final);
  if(removed)await cleanupFiles(removed.attachments,[...noticeRef.current,...final.map(d=>({attachments:d.attachments}) as Notice)]);
 }
 function commitResult(value:{sources:Draft[];result:unknown}){
  const batch=parseAnalysisBatch(value.result);
  if(batch.notices.length!==value.sources.length)throw new Error('整理结果未与原文逐条对应，请分批提交。');
  const current=repository.load();
  // Fixed IDs make recovering a result after refresh idempotent.
  const additions=batch.notices.map((a,i)=>({...createNotice(a,value.sources[i].text),id:`ai-${value.sources[i].id}`,attachments:value.sources[i].attachments}));
  save([...current,...additions.filter(n=>!current.some(old=>old.id===n.id))]);
  const consumed=new Set(value.sources.map(d=>d.id));const remaining=draftRef.current.filter(d=>!consumed.has(d.id));replaceDrafts(remaining.length?remaining:[makeDraft()]);
  localStorage.removeItem(RESULT_KEY);resultRef.current=null;setPending(false);tell(`已整理 ${additions.length} 条通知`);
 }
 async function analyze(){
  if(busy||!config)return false;
  if(pending)throw new Error('还有一份整理结果待恢复，请先保存它。');
  if(!cloud?.getKey())throw new Error('请先登录，再使用 AI 整理。');
  const sources=structuredClone(draftRef.current.filter(d=>d.text.trim()));
  if(!sources.length||sources.some(d=>!d.text.trim())||sources.reduce((n,d)=>n+d.text.length,0)>4000)throw new Error('通知总字数需在 1–4,000 之间。');
  if(draftRef.current.some(d=>!d.text.trim()&&d.attachments.length))throw new Error('有附件的通知还没填写原文，请补上后再整理。');
  setBusy(true);setStage('正在整理');abort.current=new AbortController();
  try{const result=await analyzeSources(sources.map(d=>({text:d.text})),{endpoint:config.apiEndpoint,sessionKey:cloud.getKey()!,signal:abort.current.signal,onStage:s=>setStage(s==='verifying'?'正在验证':'正在整理')});
   const value={sources,result};resultRef.current=value;setPending(true);
   try{localStorage.setItem(RESULT_KEY,JSON.stringify(value));}catch{/* The in-memory result remains recoverable without another paid call. */}
   commitResult(value);return true;
  }catch(e){report(e);return false;}finally{setBusy(false);setStage('');abort.current=null;}
 }
 function recoverResult(){try{const raw=localStorage.getItem(RESULT_KEY);const value=resultRef.current||(raw?JSON.parse(raw):null);if(value)commitResult(value);}catch(e){report(e);}}
 async function loadExamples(){
  const response=await fetch('./examples.json');if(!response.ok)throw new Error('示例暂时无法载入。');
  const records=parseBackup(await response.json());const current=repository.load();
  const added=records.filter(n=>!current.some(old=>old.originalText===n.originalText&&old.title===n.title));
  save([...current,...added]);tell(added.length?`已载入 ${added.length} 条示例通知`:'这些示例已经载入。');
 }
 async function backup(){
  const records=repository.load();const files=await exportFiles(records);const data=exportBackup(records,files);
  const result=await platform.saveFile(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`campus-inbox-${new Date().toISOString().slice(0,10)}.json`);
  if(result.status!=='cancelled')tell(result.status==='saved'?'备份已保存':'备份已下载');
 }
 async function importBackup(file:File){
  if(file.size>70*1024*1024)throw new Error('备份超过 70 MB，无法导入。');
  const data=JSON.parse(await file.text());let records=parseBackup(data);
  const restored=await restoreFiles(data.attachments??[],records);records=restored.notices;
  const current=repository.load();
  // Preserve the current version when a backup contains an already-existing ID.
  const added=records.filter(n=>!current.some(old=>old.id===n.id));
  save([...current,...added]);await cleanupFiles(restored.ids,[...repository.load(),...draftRef.current.map(d=>({attachments:d.attachments}) as Notice)]);
  tell(`已导入 ${added.length} 条通知，现有通知保留。`);
 }
 async function receiveShare(){
  if(busy||receivingShare.current)return false;
  receivingShare.current=true;let received=false;
  try{for(let count=0;count<20;count++){
   if(draftRef.current.length>=20&&!draftRef.current.some(d=>!d.text.trim()&&!d.attachments.length)){tell('先整理或移除一条草稿，再接收分享。');break;}
   const text=await platform.getSharedText();if(!text)break;
   const empty=draftRef.current.find(d=>!d.text.trim()&&!d.attachments.length);
   if(empty)changeDraft(empty.id,text);else addDraft(text);received=true;
  }return received;}finally{receivingShare.current=false;}
 }
 return {notices,drafts,busy,stage,error,setError,toast,setToast,pending,recoverResult,config,platform,capabilities,cloud,auth,sync,username,theme,setTheme,bootError:boot.error,
  report,tell,update,act,remove,changeDraft,addDraft,attach,detach,removeDraft,analyze,cancel:()=>abort.current?.abort(),loadExamples,backup,importBackup,login,logout,receiveShare};
}
export type CampusController=ReturnType<typeof useCampus>;
