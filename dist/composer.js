/* Independent notice inputs. Files and drafts stay in this browser. */
(()=>{
'use strict';
const D=globalThis.CampusData,A=globalThis.CampusAttachments,S=globalThis.CampusScroll,$=id=>document.getElementById(id);
const container=$('notice-entries');if(!container)return;
const first=container.firstElementChild,primary=$('notice'),DRAFT='campus-inbox:compose:v2',LEGACY='campus-inbox:draft:v1';
const MAX_ENTRIES=20,motion=matchMedia('(prefers-reduced-motion: reduce)');
let entries=[fresh()],disabled=false,mode='personal',undo=null,undoTimer,exit=null;
const rowScroll=new WeakMap(),bound=new WeakSet(),arrivals=new Set();
const stage=make('div','compose-scroll-stage');container.before(stage);stage.append(container);
const stageScroll=S?.mount(container,{root:stage,label:'滚动通知列表'});
function fresh(text='',files=[]){return {id:crypto.randomUUID(),text,files:[...files],missingFiles:0};}
function make(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function error(message){window.dispatchEvent(new CustomEvent('campus-composer-error',{detail:{message}}));}
function resolve(row){return entries.find(e=>e.id===row.dataset.entryId);}
function rows(){return [...container.children].filter(row=>row.classList.contains('compose-entry')&&!row.classList.contains('compose-exit-ghost'));}
function sync(){for(const row of rows()){const entry=resolve(row);if(entry)entry.text=row.querySelector('textarea').value;}}
function current(){sync();return entries.map(e=>({id:e.id,text:e.text,files:[...e.files],fileCount:e.files.length+(e.missingFiles||0)}));}
function count(){return current().reduce((n,e)=>n+e.text.length,0);}
function persist(){if(mode!=='personal')return;try{if(entries.some(e=>e.text||e.files.length||e.missingFiles)){localStorage.setItem(DRAFT,JSON.stringify({version:2,entries:entries.map(e=>({id:e.id,text:e.text,fileCount:e.files.length+(e.missingFiles||0)}))}));localStorage.setItem(LEGACY,entries[0].text);}else{localStorage.removeItem(DRAFT);localStorage.removeItem(LEGACY);}}catch{}}
function controls(){
 $('notice-add').disabled=disabled||mode==='demo'||!!exit||entries.length>=MAX_ENTRIES;
 $('compose-undo-button').disabled=disabled||mode==='demo'||!!exit;
 for(const row of rows()){row.querySelector('.compose-entry-remove').disabled=disabled||mode==='demo'||!!exit;}
}
function notify(save=true){sync();const chars=count();$('char-count').textContent=`${chars.toLocaleString('en-US')} / 4,000 字`;$('char-count').classList.toggle('at-limit',chars>=D.MAX_TEXT);document.querySelector('.compose').dataset.entryCount=entries.length;controls();const missing=entries.some(e=>e.missingFiles>0);$('compose-draft-note').hidden=!missing;if(missing)$('compose-draft-note').textContent='草稿已恢复，附件需重新添加。';if(save)persist();stageScroll?.refresh();window.dispatchEvent(new CustomEvent('campus-composer-change',{detail:{chars,entries:entries.length,overLimit:chars>D.MAX_TEXT}}));}
function renderFiles(row,entry){
 const target=row.querySelector('.selected-files');target.replaceChildren();
 entry.files.forEach((file,index)=>{const chip=make('div','file-chip');chip.append(make('span',null,file.name));const remove=make('button',null,'×');remove.type='button';remove.disabled=disabled||mode==='demo';remove.setAttribute('aria-label',`移除 ${file.name}`);remove.addEventListener('click',()=>{if(disabled||mode==='demo')return;const live=resolve(row);if(!live)return;live.files.splice(index,1);renderFiles(row,live);notify();});chip.append(remove);target.append(chip);});stageScroll?.refresh();
}
function choose(entry,row,input){if(!entry||disabled||mode==='demo')return;try{const next=[...entry.files,...input.files];A.validate(next);const total=entries.reduce((n,e)=>n+(e===entry?next:e.files).reduce((s,f)=>s+f.size,0),0);if(total>A.MAX_TOTAL)throw new Error('本次附件合计不能超过20 MB。');entry.missingFiles=Math.max(0,entry.files.length+(entry.missingFiles||0)-next.length);entry.files=next;renderFiles(row,entry);notify();}catch(e){error(e.message);}finally{input.value='';}}
function clearUndo(){clearTimeout(undoTimer);undo=null;$('compose-undo').hidden=true;}
function stopExit(){if(!exit)return;const departing=exit;exit=null;departing.animation?.cancel();departing.node.remove();controls();stageScroll?.refresh();}
function stopAnimations(){stopExit();for(const animation of arrivals)animation.cancel();arrivals.clear();}
function departureClone(row){
 const clone=row.cloneNode(true);clone.classList.add('compose-exit-ghost');clone.classList.remove('is-new');clone.inert=true;clone.setAttribute('aria-hidden','true');delete clone.dataset.entryId;
 clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));clone.querySelectorAll('[for],[aria-controls]').forEach(n=>{n.removeAttribute('for');n.removeAttribute('aria-controls');});
 clone.querySelector('textarea').value=row.querySelector('textarea').value;clone.querySelectorAll('button,input').forEach(n=>n.disabled=true);return clone;
}
function removeEntry(index){
 if(disabled||mode==='demo'||exit||index<0||index>=entries.length)return;sync();const removed=entries[index],row=rows().find(r=>r.dataset.entryId===removed.id),height=row.getBoundingClientRect().height;
 clearUndo();undo={entry:removed,index};const clone=!motion.matches&&typeof row.animate==='function'?departureClone(row):null;
 if(clone)exit={node:clone,index,animation:null};entries.splice(index,1);if(!entries.length)entries=[fresh()];render();notify();$('compose-undo').hidden=false;
 if(clone){clone.style.height=height+'px';const gap=parseFloat(getComputedStyle(container).gap)||18;const animation=clone.animate([{height:height+'px',opacity:1,transform:'translateX(0)',marginBottom:'0px',paddingTop:'3px',paddingBottom:'3px'},{height:'0px',opacity:0,transform:'translateX(-14px)',marginBottom:-gap+'px',paddingTop:'0px',paddingBottom:'0px'}],{duration:440,easing:'cubic-bezier(.22,.7,.2,1)',fill:'forwards'});exit.animation=animation;animation.finished.catch(()=>{}).then(()=>{if(exit?.node===clone){stopExit();render();notify(false);}});}
 controls();undoTimer=setTimeout(clearUndo,10000);
}
function bindRow(row,entry,index){
 const oldID=row.dataset.entryId;row.dataset.entryId=entry.id;
 const input=row.querySelector('textarea'),label=row.querySelector('label'),remove=row.querySelector('.compose-entry-remove'),attach=row.querySelector('.attachment-button'),upload=row.querySelector('input[type=file]');
 if(row!==first)input.id='notice-'+entry.id;label.htmlFor=input.id;
 if(!bound.has(row)){
  bound.add(row);const shell=make('div','compose-input-shell');input.before(shell);shell.append(input);rowScroll.set(row,S?.mount(input,{root:shell,label:'滚动通知正文'}));
  input.addEventListener('input',()=>{const live=resolve(row);if(!live)return;live.text=input.value;rowScroll.get(row)?.refresh();notify();});
  remove.addEventListener('click',()=>removeEntry(entries.findIndex(e=>e.id===row.dataset.entryId)));
  attach.addEventListener('click',()=>{if(!disabled&&mode!=='demo')upload.click();});upload.addEventListener('change',()=>choose(resolve(row),row,upload));
 }
 if(input.value!==entry.text)input.value=entry.text;if(oldID&&oldID!==entry.id)input.scrollTop=0;
 input.readOnly=disabled||mode==='demo';label.textContent=`通知 ${index+1}`;remove.setAttribute('aria-label',`移除通知 ${index+1}`);remove.disabled=disabled||mode==='demo'||!!exit;attach.setAttribute('aria-label',`为通知 ${index+1} 添加附件`);attach.disabled=disabled||mode==='demo';upload.disabled=disabled||mode==='demo';renderFiles(row,entry);rowScroll.get(row)?.refresh();
}
function newRow(){
 const row=make('section','compose-entry'),head=make('div','compose-entry-head'),label=make('label','input-label'),remove=make('button','icon-button compose-entry-remove','×');remove.type='button';head.append(label,remove);
 const input=make('textarea');input.maxLength=D.MAX_TEXT;input.placeholder='粘贴这一条通知的原文……';input.setAttribute('aria-describedby','char-count');
 const fileRow=make('div','compose-entry-files'),attach=make('button','attachment-button icon-button','＋');attach.type='button';attach.title='添加附件';fileRow.append(attach,make('div','selected-files'));
 const upload=make('input');upload.type='file';upload.multiple=true;upload.hidden=true;row.append(head,input,fileRow,upload);return row;
}
function render(newID){
 const active=document.activeElement,selection=active?.tagName==='TEXTAREA'?{start:active.selectionStart,end:active.selectionEnd}:null;
 const old=new Map(rows().filter(row=>row!==first).map(row=>[row.dataset.entryId,row])),wanted=[];
 entries.forEach((entry,index)=>{if(exit?.index===index)wanted.push(exit.node);const row=index===0?first:old.get(entry.id)||newRow();if(index>0)old.delete(entry.id);bindRow(row,entry,index);wanted.push(row);});
 if(exit&&exit.index>=entries.length)wanted.push(exit.node);
 for(const row of old.values()){rowScroll.get(row)?.destroy();row.remove();}
 let cursor=container.firstChild;for(const node of wanted){if(node===cursor)cursor=cursor.nextSibling;else container.insertBefore(node,cursor);}
 if(active?.isConnected&&container.contains(active)&&!active.closest('.compose-exit-ghost')&&document.activeElement!==active){active.focus({preventScroll:true});if(selection)active.setSelectionRange(selection.start,selection.end);}
 if(newID&&!motion.matches){const row=wanted.find(r=>r.dataset.entryId===newID);if(row?.animate){const animation=row.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:460,easing:'cubic-bezier(.22,.7,.2,1)'});arrivals.add(animation);animation.finished.catch(()=>{}).then(()=>arrivals.delete(animation));}}
 notify(false);
}
$('notice-add').addEventListener('click',()=>{if(disabled||mode==='demo'||exit||entries.length>=MAX_ENTRIES)return;sync();const entry=fresh();entries.push(entry);render(entry.id);notify();const row=rows().find(r=>r.dataset.entryId===entry.id);row.querySelector('textarea').focus({preventScroll:true});container.scrollTo({top:Math.max(0,row.offsetTop-container.offsetTop+row.offsetHeight-container.clientHeight+10),behavior:motion.matches?'instant':'smooth'});});
$('compose-undo-button').addEventListener('click',()=>{if(!undo||disabled||mode==='demo'||exit)return;sync();const old=undo;if(entries.length===1&&!entries[0].text&&!entries[0].files.length&&!entries[0].missingFiles)entries=[];if(entries.length>=MAX_ENTRIES){error('已达到20条，请先移除一条再撤销。');return;}entries.splice(Math.min(old.index,entries.length),0,old.entry);clearUndo();render(old.entry.id);notify();});
function restore(snapshot,{persist:save=false}={}){
 if(!Array.isArray(snapshot)||!snapshot.length||snapshot.length>MAX_ENTRIES)throw new Error('通知草稿格式不正确。');const ids=new Set();
 const restored=snapshot.map(e=>{if(!e||typeof e.text!=='string'||e.text.length>D.MAX_TEXT)throw new Error('通知草稿格式不正确。');const id=typeof e.id==='string'&&e.id.length<=80&&!ids.has(e.id)?e.id:crypto.randomUUID();ids.add(id);const files=Array.isArray(e.files)?[...e.files]:[];A.validate(files);const fileCount=Number.isInteger(e.fileCount)&&e.fileCount>=0&&e.fileCount<=10?e.fileCount:files.length;return {id,text:e.text,files,missingFiles:Math.max(0,fileCount-files.length)};});
 stopAnimations();entries=restored;clearUndo();render();notify(save);
}
function prepare(){const all=current();all.forEach((e,i)=>{if(!e.text.trim()&&e.files.length)throw new Error(`请补充通知 ${i+1} 的正文。`);A.validate(e.files);});if(count()>D.MAX_TEXT)throw new Error('本次通知合计不能超过4,000字，请删减或分批整理。');const selected=all.filter(e=>e.text.trim()),texts=selected.map(e=>e.text.trim()),files=[],owners=[];selected.forEach((e,i)=>e.files.forEach(f=>{files.push(f);owners.push(i);}));if(files.reduce((n,f)=>n+f.size,0)>A.MAX_TOTAL)throw new Error('本次附件合计不能超过20 MB。');return {request:{sources:texts.map(text=>({text}))},originals:texts,files,owners,explicit:true};}
try{const raw=localStorage.getItem(DRAFT);if(raw&&raw.length<120000){const draft=JSON.parse(raw);if(draft.version===2&&Array.isArray(draft.entries)&&draft.entries.length&&draft.entries.length<=MAX_ENTRIES)restore(draft.entries);}else{const old=localStorage.getItem(LEGACY);if(old&&old.length<=D.MAX_TEXT)entries[0].text=old;}}catch{}
render();
motion.addEventListener('change',()=>{if(motion.matches){stopAnimations();render();}});
globalThis.CampusComposer={getEntries:current,snapshot:current,prepare,getRequest:()=>prepare().request,getInput:()=>prepare().originals.join('\n\n---\n\n'),restore,
 clear({persist:save=true}={}){stopAnimations();entries=[fresh()];clearUndo();$('compose-draft-note').hidden=true;render();notify(save);},
 setDisabled(value){sync();stopAnimations();disabled=!!value;render();notify(false);},
 setMode(value){sync();stopAnimations();mode=value==='demo'?'demo':'personal';render();notify(false);},
 renderFiles(){for(const row of rows()){const entry=resolve(row);if(entry)renderFiles(row,entry);}},
 setText(text){restore([fresh(text)]);notify();},
 key:DRAFT,maxEntries:MAX_ENTRIES};
})();
