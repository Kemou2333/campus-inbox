/* Keep a paid result recoverable if browser persistence fails. */
(()=>{
'use strict';
const D=globalThis.CampusData,A=globalThis.CampusAttachments,$=id=>document.getElementById(id),KEY='campus-inbox:pending-analysis:v1';
let pending=null,busy=false,handlers={save:null,discard:null};
function status(text){$('recovery-status').textContent=text;}
function paint(){const count=pending?.records.length||0;$('pending-result-banner').hidden=!count;$('pending-result-label').textContent=`${count} 条整理结果尚未保存`;for(const id of['recovery-save','recovery-export','recovery-export-text','recovery-discard'])$(id).disabled=busy;}
function keep(){try{if(pending)sessionStorage.setItem(KEY,JSON.stringify(pending));else sessionStorage.removeItem(KEY);}catch{}}
function open(){if(!pending)return;paint();if(!$('recovery-dialog').open)$('recovery-dialog').showModal();}
function close(){if(busy)return;$('recovery-dialog').close();}
function clear(){pending=null;keep();paint();if($('recovery-dialog').open)$('recovery-dialog').close();status('');$('recovery-export-text').hidden=true;}
function download(body){const blob=new Blob([JSON.stringify(body,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='校园Inbox-未保存结果-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function exportResult(textOnly=false){if(!pending||busy)return;busy=true;paint();try{const records=textOnly?pending.records.map(n=>({...n,attachments:[]})):pending.records;const body=D.exportBackup(records);body.attachments=textOnly?[]:await A.exportFiles(records);download(body);pending.exported=true;keep();status(textOnly?'文字结果已导出，附件仍可从原文件重新添加。':'已导出这次结果，可通过备份恢复。');}catch(e){status(e.message+' 可以先导出文字结果。');$('recovery-export-text').hidden=false;}finally{busy=false;paint();}}
$('recovery-close').addEventListener('click',close);$('recovery-dialog').addEventListener('cancel',e=>{e.preventDefault();close();});$('pending-result-open').addEventListener('click',open);
$('recovery-export').addEventListener('click',()=>exportResult());$('recovery-export-text').addEventListener('click',()=>exportResult(true));
$('recovery-save').addEventListener('click',async()=>{if(!pending||busy||!handlers.save)return;busy=true;paint();status('');try{if(await handlers.save(pending.records)){clear();}else status('仍未保存成功，结果继续保留。请先导出备份。');}catch(e){status(e.message||'暂时无法保存，请先导出备份。');}finally{busy=false;paint();}});
$('recovery-discard').addEventListener('click',async()=>{if(!pending||busy||!handlers.discard)return;busy=true;paint();try{if(await handlers.discard(pending.records))clear();}catch(e){status(e.message||'暂时无法放弃，请稍后重试。');}finally{busy=false;paint();}});
window.addEventListener('beforeunload',e=>{if(pending&&!pending.exported){e.preventDefault();e.returnValue='';}});
try{const raw=sessionStorage.getItem(KEY);if(raw&&raw.length<=500000){const value=JSON.parse(raw);if(value.version===1)pending={version:1,records:D.notices(value.records),exported:value.exported===true};}}catch{}
paint();
globalThis.CampusRecovery={stage(records,{openDialog=true}={}){if(pending)throw new Error('请先处理上次未保存的结果。');pending={version:1,records:D.notices(records),exported:false};keep();status('');paint();if(openDialog)open();},hasPending:()=>!!pending,getRecords:()=>pending?structuredClone(pending.records):[],protectedIDs:()=>pending?pending.records.flatMap(n=>n.attachments):[],setHandlers(value){handlers={...handlers,...value};},open,clear,key:KEY};
})();
