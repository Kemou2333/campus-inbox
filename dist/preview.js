/* Attachment previews use their own local URLs, independent of card thumbnails. */
(()=>{
'use strict';
const IMAGE_TYPES=new Set(['image/png','image/jpeg','image/gif','image/webp']);
const TEXT_TYPES=new Set(['application/json','application/ld+json','image/svg+xml']);
const TEXT_NAMES=/\.(?:txt|json|csv|svg|html?|log|md)$/i;
const MAX_TEXT_BYTES=256*1024;
const urls=new Set();
let generation=0,view;

function release(){
 generation++;
 if(view){view.body.replaceChildren();view.download.removeAttribute('href');}
 for(const url of urls)URL.revokeObjectURL(url);
 urls.clear();
}
function elements(){
 if(view)return view;
 const dialog=document.getElementById('preview-dialog'),title=document.getElementById('preview-title'),body=document.getElementById('preview-body'),download=document.getElementById('preview-download');
 if(!dialog||!title||!body||!download||typeof dialog.showModal!=='function')throw new Error('附件预览暂不可用。');
 view={dialog,title,body,download};
 dialog.addEventListener('close',()=>{if(!dialog.open)release();});
 return view;
}
function localURL(blob,type){
 const url=URL.createObjectURL(blob.slice(0,blob.size,type));
 urls.add(url);return url;
}
function message(body,text){const p=document.createElement('p');p.textContent=text;body.replaceChildren(p);}
function imageMatches(type,b){
 if(type==='image/png')return b.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n);
 if(type==='image/jpeg')return b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255;
 if(type==='image/gif')return b.length>=6&&b[0]===71&&b[1]===73&&b[2]===70&&b[3]===56&&(b[4]===55||b[4]===57)&&b[5]===97;
 if(type==='image/webp')return b.length>=12&&b[0]===82&&b[1]===73&&b[2]===70&&b[3]===70&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80;
 return false;
}
function pdfMatches(b){return b.length>=5&&b[0]===37&&b[1]===80&&b[2]===68&&b[3]===70&&b[4]===45;}
async function open(record){
 if(!record||!(record.blob instanceof Blob))throw new Error('无法读取此附件。');
 const ui=elements(),name=typeof record.name==='string'&&record.name?record.name.slice(0,250):'附件';
 const type=typeof record.type==='string'?record.type.split(';',1)[0].trim().toLowerCase():'';
 release();const current=generation;
 const active=()=>current===generation&&ui.dialog.open;
 ui.title.textContent=name;ui.download.download=name;
 // A forced binary download never navigates to executable attachment content.
 ui.download.href=localURL(record.blob,'application/octet-stream');
 message(ui.body,'正在打开…');
 try{
  if(!ui.dialog.open)ui.dialog.showModal();
  const header=new Uint8Array(await record.blob.slice(0,16).arrayBuffer());
  if(!active())return;
  if(pdfMatches(header)){
   const frame=document.createElement('iframe');frame.title=name;frame.referrerPolicy='no-referrer';
   // Only a verified PDF header is given to the browser's native PDF viewer.
   // HTML and SVG are always text; no attachment is inserted as page markup.
   frame.src=localURL(record.blob,'application/pdf');ui.body.replaceChildren(frame);return;
  }
  if(IMAGE_TYPES.has(type)&&imageMatches(type,header)){
   const img=document.createElement('img');img.alt=name;img.decoding='async';img.referrerPolicy='no-referrer';
   img.addEventListener('error',()=>{if(active())message(ui.body,'无法预览此图片，可下载查看。');},{once:true});
   img.src=localURL(record.blob,type);ui.body.replaceChildren(img);return;
  }
  if(type.startsWith('text/')||TEXT_TYPES.has(type)||TEXT_NAMES.test(name)){
   const text=await record.blob.slice(0,MAX_TEXT_BYTES).text();
   if(!active())return;
   const pre=document.createElement('pre');pre.textContent=text;
   if(record.blob.size>MAX_TEXT_BYTES)pre.textContent+='\n\n…预览已截取，完整内容可下载。';
   ui.body.replaceChildren(pre);return;
  }
  message(ui.body,IMAGE_TYPES.has(type)?'文件格式不匹配，可下载查看。':'此文件暂不支持预览，可下载查看。');
 }catch{
  if(active())message(ui.body,'无法预览此附件，可下载查看。');
  else if(current===generation)release();
 }
}
window.addEventListener('pagehide',()=>{if(view?.dialog.open)view.dialog.close();release();});
window.CampusPreview={open};
})();
