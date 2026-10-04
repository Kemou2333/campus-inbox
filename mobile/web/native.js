/* Android-only adapter. Every native action is user initiated except receiving shares. */
(()=>{'use strict';
if(!globalThis.CampusNative?.postMessage)return;
document.documentElement.dataset.native='android';
const pending=new Map();let capabilities=null,seq=0,sharedBusy=false;
function status(message,error=false){window.dispatchEvent(new CustomEvent('campus-native-status',{detail:{message,error}}));}
function call(action,payload={},timeout=30000){return new Promise((resolve,reject)=>{const id='web-'+(++seq),timer=timeout?setTimeout(()=>{pending.delete(id);reject(new Error('操作未完成，请稍后再试。'));},timeout):null;pending.set(id,{resolve,reject,timer});try{CampusNative.postMessage(JSON.stringify({id,action,payload}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}
CampusNative.onmessage=event=>{let data;try{data=JSON.parse(event.data);}catch{return;}if(data.event==='shareAvailable'){consumeShare();return;}const request=pending.get(data.id);if(!request)return;pending.delete(data.id);clearTimeout(request.timer);if(data.ok)request.resolve(data.data);else request.reject(new Error(typeof data.error==='string'?data.error:'操作未完成。'));};
const ready=call('capabilities',{},10000).then(c=>{capabilities=c;globalThis.applyNativeTheme?.(c.theme||{});return c;}).catch(e=>{status(e.message,true);return {};});
function blocked(){return document.getElementById('notices')?.getAttribute('aria-busy')==='true';}
async function consumeShare(){
 if(sharedBusy||!globalThis.CampusComposer||blocked())return;
 sharedBusy=true;let added=0;
 try{
  await ready;
  for(let count=0;count<10;count++){
   if(blocked())break;
   const entries=CampusComposer.snapshot();
   if(entries.length>=20){status('输入区已满，待接收的分享会在整理后加入。');break;}
   const {text,remaining}=await call('consumeShare');if(!text)break;
   if(typeof text!=='string'||text.length>CampusData.MAX_TEXT){status('分享的文字超过4,000字，请分批复制。',true);if(!remaining)break;continue;}
   if(entries.length===1&&!entries[0].text.trim()&&!entries[0].files.length)entries[0].text=text;
   else entries.push({id:crypto.randomUUID(),text,files:[],fileCount:0});
   CampusComposer.restore(entries,{persist:true});added++;if(!remaining)break;
  }
  if(added){status(added===1?'已放入通知输入框。':`已放入${added}条通知。`);document.getElementById('notice')?.focus({preventScroll:true});}
 }catch(e){status(e.message,true);}finally{sharedBusy=false;}
}
function base64(bytes){const parts=[];for(let i=0;i<bytes.length;i+=32768)parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));return btoa(parts.join(''));}
let saving=false;
async function saveBlob(blob,name){if(saving)throw new Error('正在保存另一份文件。');saving=true;let token;try{const cap=await ready;if(!cap.fileSave)throw new Error('当前手机暂不支持文件保存。');const begin=await call('saveBegin',{name:name||'campus-inbox-file',mime:blob.type||'application/octet-stream',size:blob.size});token=begin.token;for(let offset=0;offset<blob.size;offset+=192*1024){const bytes=new Uint8Array(await blob.slice(offset,offset+192*1024).arrayBuffer());await call('saveChunk',{token,base64:base64(bytes)});}const result=await call('saveFinish',{token},0);if(result.status==='saved')status('文件已保存。');return result;}catch(e){if(token)call('saveCancel',{token}).catch(()=>{});throw e;}finally{saving=false;}}
document.addEventListener('click',event=>{const link=event.target.closest?.('a[download]');if(!link||!/^blob:/.test(link.href))return;event.preventDefault();event.stopImmediatePropagation();fetch(link.href).then(r=>r.blob()).then(blob=>saveBlob(blob,link.download)).catch(e=>status(e.message,true));},true);
async function openCalendar(n,due,allDay=false){const cap=await ready;if(!cap.calendar)throw new Error('未找到可用的日历应用，请使用日历文件导出。');const time=new Date(allDay?due+'T00:00:00Z':due).getTime();if(!Number.isFinite(time))throw new Error('请确认日期和时间。');const description=[n.summary,...n.tasks.filter(t=>!t.completed&&!t.dismissed).flatMap(t=>[`${t.assignee?t.assignee+'：':''}${t.text}${t.condition?'（'+t.condition+'）':''}`,...t.details,...t.steps.flatMap((s,i)=>[`${i+1}. ${s.text}`,...s.details])]),'原通知：',n.originalText].join('\n');const result=await call('calendar',{title:n.title+' · 截止',description,startMillis:time,allDay});if(result.status==='opened')status('请在日历中确认保存并设置提醒。');return result;}
globalThis.CampusAndroid=Object.freeze({ready,call,saveBlob,openCalendar,consumeShare});
window.addEventListener('load',()=>consumeShare());window.addEventListener('focus',()=>consumeShare());
window.addEventListener('campus-native-share',()=>consumeShare());
window.addEventListener('campus-composer-change',()=>consumeShare());
const noticeList=document.getElementById('notices');if(noticeList)new MutationObserver(()=>{if(!blocked())consumeShare();}).observe(noticeList,{attributes:true,attributeFilter:['aria-busy']});
})();
