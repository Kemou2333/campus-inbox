/* Browser and Worker share the same validation rules. User text is never HTML. */
(function(root){
'use strict';
const MAX_NOTICES=2000, MAX_TEXT=12000;
function object(x){return x && typeof x==='object' && !Array.isArray(x);}
function text(x,name,max=2000,empty=false){
 if(typeof x!=='string'||x.length>max||(!empty&&!x.trim()))throw new Error(`${name}格式不正确`);
 return x.trim();
}
function date(x){
 if(x===null)return null;
 if(typeof x!=='string')throw new Error('时间格式不正确');
 const m=x.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/);
 if(!m)throw new Error('时间必须为完整的 ISO 日期时间');
 const [y,mo,d,h,mi,se]=m.slice(1,7).map(v=>Number(v||0));
 const leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(y<1000||mo<1||mo>12||d<1||d>days[mo-1]||h>23||mi>59||se>59)throw new Error('日期或时间不存在');
 if(m[8]&&m[8]!=='Z'){const [oh,om]=m[8].slice(1).split(':').map(Number);if(oh>14||om>59||(oh===14&&om!==0))throw new Error('时区格式不正确');}
 if(!Number.isFinite(Date.parse(x)))throw new Error('日期无法识别');
 return x;
}
function strings(x,name){if(!Array.isArray(x)||x.length>100)throw new Error(`${name}必须为数组，最多 100 项`);return x.map(v=>text(v,name));}
function timeline(x,strict=false){if(x===undefined)return [];if(!Array.isArray(x)||x.length>100)throw new Error('时间节点格式不正确');return x.map(v=>{
 if(!object(v))throw new Error('时间节点格式不正确');
 const fields=['label','time','timeText','location'];
 if(strict&&(fields.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!fields.includes(k))))throw new Error('时间节点字段不完整或包含多余字段');
 return {label:text(v.label,'节点名称',200),time:date(v.time),timeText:text(v.timeText,'原文时间',500),location:v.location===null?null:text(v.location,'地点',500)};
});}
function task(x,strict=false){
 if(typeof x==='string'&&!strict)return {text:text(x,'任务'),assignee:null,details:[],time:null,timeText:'',location:null};
 if(!object(x))throw new Error('任务必须为结构化对象');
 const fields=['text','assignee','details','time','timeText','location'];
 if(strict&&(fields.some(k=>!Object.hasOwn(x,k))||Object.keys(x).some(k=>!fields.includes(k))))throw new Error('任务字段不完整或包含多余字段');
 const details=strings(x.details===undefined?[]:x.details,'执行细节');
 if(strict&&(details.length>20||details.some(v=>v.length>500)))throw new Error('执行细节过长');
 return {text:text(x.text,'任务名称',strict?60:2000),assignee:x.assignee==null?null:text(x.assignee,'责任对象',80),details,time:date(x.time===undefined?null:x.time),timeText:text(x.timeText===undefined?'':x.timeText,'任务时间',500,true),location:x.location==null?null:text(x.location,'任务地点',500)};
}
function analysis(x,strict=false){
 if(!object(x))throw new Error('整理结果必须为 JSON 对象');
 if(strict&&x.schemaVersion!==4)throw new Error('需要第4版通知格式');
 const fields=['schemaVersion','kind','title','summary','deadline','deadlineText','timeline','tasks','materials','warnings','reminders'];
 if(strict&&(fields.some(k=>!Object.hasOwn(x,k))||Object.keys(x).some(k=>!fields.includes(k))))throw new Error('通知字段不完整或包含多余字段');
 if(!Array.isArray(x.tasks)||x.tasks.length>100)throw new Error('任务必须为数组，最多100项');
 const kind=x.kind===undefined?(x.tasks.length?'task':'information'):x.kind;
 if(!['task','reminder','information'].includes(kind))throw new Error('通知类别不正确');
 const reminders=strings(x.reminders===undefined?[]:x.reminders,'提醒');
 if(strict&&((kind==='task')!==!!x.tasks.length||(kind==='reminder'&&!reminders.length)||reminders.length>20||reminders.some(v=>v.length>500)))throw new Error('通知类别与内容不一致');
 return {schemaVersion:4,kind,title:text(x.title,'标题',strict?40:200),summary:text(x.summary,'摘要',strict?140:2000),deadline:date(x.deadline),deadlineText:x.deadlineText===undefined?'':text(x.deadlineText,'截止描述',500,true),timeline:timeline(x.timeline,strict),tasks:x.tasks.map(t=>task(t,strict)),materials:strings(x.materials,'材料清单'),warnings:strings(x.warnings,'注意事项'),reminders};
}
function batch(x,strict=false){
 if(!strict&&object(x)&&Array.isArray(x.tasks))return {schemaVersion:4,notices:[analysis(x)]};
 if(!object(x)||x.schemaVersion!==4||!Array.isArray(x.notices)||!x.notices.length||x.notices.length>20||Object.keys(x).some(k=>!['schemaVersion','notices'].includes(k)))throw new Error('整理结果必须包含1–20条通知');
 return {schemaVersion:4,notices:x.notices.map(n=>analysis(n,strict))};
}
function attachmentIDs(x){if(x===undefined)return [];if(!Array.isArray(x)||x.length>10)throw new Error('每条通知最多10个附件');const ids=x.map(v=>text(v,'附件编号',100));if(new Set(ids).size!==ids.length)throw new Error('附件编号重复');return ids;}
function notice(x){
 if(!object(x)||!Array.isArray(x.tasks)||x.tasks.length>100||typeof x.completed!=='boolean')throw new Error('通知记录格式不正确');
 const states=x.tasks.map(t=>{if(!object(t)||typeof t.completed!=='boolean')throw new Error('任务完成状态格式不正确');return t.completed;});
 const normalized=analysis(x);
 const createdAt=date(x.createdAt);if(!createdAt)throw new Error('缺少创建时间');
 return {...normalized,id:text(x.id,'通知编号',150),originalText:text(x.originalText,'通知原文',MAX_TEXT),createdAt,completed:x.completed,attachments:attachmentIDs(x.attachments),tasks:normalized.tasks.map((t,i)=>({...t,completed:states[i]}))};
}
function notices(x){if(!Array.isArray(x)||x.length>MAX_NOTICES)throw new Error(`最多保存 ${MAX_NOTICES} 条通知`);const ids=new Set();return x.map(v=>{const n=notice(v);if(ids.has(n.id))throw new Error('存在重复的通知编号');ids.add(n.id);return n;});}
function backup(x){if(!object(x)||x.app!=='campus-inbox'||![1,2,3,4].includes(x.version))throw new Error('请选择校园 Inbox 导出的 JSON 备份');return notices(x.notices);}
function exportBackup(ns){return {app:'campus-inbox',version:4,exportedAt:new Date().toISOString(),notices:notices(ns)};}
function create(result,originalText){const a=analysis(result);return {...a,id:root.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`,originalText:text(originalText,'通知原文',MAX_TEXT),createdAt:new Date().toISOString(),completed:false,attachments:[],tasks:a.tasks.map(t=>({...t,completed:false}))};}
function sort(ns,order){return [...ns].sort((a,b)=>order==='newest'?Date.parse(b.createdAt)-Date.parse(a.createdAt):(a.deadline===null?Infinity:Date.parse(a.deadline))-(b.deadline===null?Infinity:Date.parse(b.deadline))||Date.parse(b.createdAt)-Date.parse(a.createdAt));}
const api={MAX_TEXT,MAX_NOTICES,date,task,analysis,batch,notice,notices,backup,exportBackup,create,sort};root.CampusData=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
