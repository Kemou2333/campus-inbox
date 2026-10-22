const focusable='button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]';
const readingKeys=new Set(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End']);
const mutationEvents=new Set(['beforeinput','input','change','paste','cut','drop','compositionstart','compositionupdate','compositionend']);
const element=(node:EventTarget|null):HTMLElement|null=>node&&'nodeType' in node&&node.nodeType===1?node as HTMLElement:null;
const contains=(parent:HTMLElement|null,node:HTMLElement|null)=>!!parent&&!!node&&(parent===node||parent.contains(node));
const stop=(event:Event,prevent=true)=>{if(prevent)event.preventDefault();event.stopImmediatePropagation();};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

/** A long reading area may move through the viewport, but never past its ends. */
export function guideReadingScrollLimits(top:number,max:number,reading:{top:number;bottom:number},viewport:{top:number;bottom:number}){
 if(reading.bottom-reading.top<=viewport.bottom-viewport.top)return {min:top,max:top};
 return {min:clamp(top+reading.top-viewport.top,0,max),max:clamp(top+reading.bottom-viewport.bottom,0,max)};
}

type GuideModalOptions={
 document:Document;panel:()=>HTMLElement|null;action:()=>HTMLElement|null;reading:()=>HTMLElement|null;
 viewport:()=>{top:number;bottom:number};readOnly:()=>boolean;dismissible:boolean;
 onClose:()=>void;onBlocked:()=>void;
};

/** Keep the real practice control live without making the rest of the page interactive. */
export function installGuideModalGuard(options:GuideModalOptions){
 const {document:doc,panel,action,reading}=options;
 let redirecting=false,touch:{node:HTMLElement;y:number}|null=null;
 const inPanel=(node:HTMLElement|null)=>contains(panel(),node);
 const inAction=(node:HTMLElement|null)=>contains(action(),node);
 const inReading=(node:HTMLElement|null)=>contains(reading(),node);
 const items=()=>{
  const next=action(),list:HTMLElement[]=[];
  if(next&&!next.matches(':disabled'))list.push(next);
  if(panel())list.push(...panel()!.querySelectorAll<HTMLElement>(focusable));
  return list;
 };
 function ensureFocus(){
  const current=element(doc.activeElement);
  if(redirecting||inPanel(current)||inAction(current))return;
  redirecting=true;(items()[0]??panel())?.focus({preventScroll:true});redirecting=false;
 }
 function interaction(event:Event){
  const node=element(event.target);
  if(inPanel(node))return;
  if(inAction(node)&&!['contextmenu','auxclick','dblclick','dragstart'].includes(event.type)){
   if(!options.readOnly()||!mutationEvents.has(event.type))return;
  }
  // Reading can retain native selection, but no card swipe or other page handler.
  const selection=inReading(node)&&['pointerdown','pointermove','pointerup','pointercancel','mousedown','mousemove','mouseup'].includes(event.type);
  stop(event,!selection);
  if(['click','contextmenu','auxclick','paste','cut','drop','beforeinput'].includes(event.type))options.onBlocked();
 }
 function scrollReading(node:HTMLElement|null,delta:number,edge?:'start'|'end'){
  let owner:HTMLElement|null=null,local=false;
  if(inPanel(node)){owner=panel();local=true;}
  else if(inReading(node)||inAction(node)){
   const area=reading();
   for(let next=node;next&&contains(area,next);next=next.parentElement){
    if(next.scrollHeight>next.clientHeight&&(/auto|scroll|overlay/.test(doc.defaultView?.getComputedStyle(next).overflowY??'')||next.tagName==='TEXTAREA')){owner=next;local=true;break;}
    if(next===area)break;
   }
   owner??=area?.closest<HTMLElement>('.workspace-pane')??doc.scrollingElement as HTMLElement|null;
  }
  if(!owner)return;
  const max=Math.max(0,owner.scrollHeight-owner.clientHeight),area=reading();
  let limits={min:0,max};
  if(!local&&area){
   const viewport=options.viewport(),bounds=owner.getBoundingClientRect();
   const visible=owner===doc.scrollingElement?viewport:{top:Math.max(viewport.top,bounds.top),bottom:Math.min(viewport.bottom,bounds.bottom)};
   limits=guideReadingScrollLimits(owner.scrollTop,max,area.getBoundingClientRect(),visible);
  }
  owner.scrollTop=edge==='start'?limits.min:edge==='end'?limits.max:clamp(owner.scrollTop+delta,limits.min,limits.max);
 }
 function wheel(event:WheelEvent){
  stop(event);
  const height=options.viewport().bottom-options.viewport().top;
  scrollReading(element(event.target),event.deltaY*(event.deltaMode===1?20:event.deltaMode===2?height:1));
 }
 function touchStart(event:TouchEvent){
  const node=element(event.target),point=event.touches[0];
  touch=node&&point&&event.touches.length===1&&(inPanel(node)||inAction(node)||inReading(node))?{node,y:point.clientY}:null;
  if(!touch){stop(event);return;}
  if(!inPanel(node)&&!inAction(node))stop(event,false);
 }
 function touchMove(event:TouchEvent){
  stop(event);
  const point=event.touches[0];if(!touch||!point||event.touches.length!==1)return;
  scrollReading(touch.node,touch.y-point.clientY);touch.y=point.clientY;
 }
 function touchEnd(event:TouchEvent){touch=null;interaction(event);}
 function keyboard(event:KeyboardEvent){
  const node=element(event.target),inside=inPanel(node)||inAction(node);
  if(event.key==='Escape'){
   stop(event);if(event.type==='keydown'){if(options.dismissible&&!event.repeat)options.onClose();else if(!options.dismissible)options.onBlocked();}return;
  }
  if(event.key==='Tab'){
   stop(event);if(event.type!=='keydown')return;
   const list=items(),index=list.indexOf(doc.activeElement as HTMLElement);
   const next=event.shiftKey?(index<=0?list.length-1:index-1):(index+1)%list.length;
   (list[next]??panel())?.focus({preventScroll:true});return;
  }
  // Only the current control may activate. Other shortcuts never reach the app.
  const modified=event.altKey||event.ctrlKey||event.metaKey;
  if(inside&&!modified&&(event.key==='Enter'||event.key===' '))return;
  if(inAction(node)&&options.readOnly()&&(readingKeys.has(event.key)||modified&&['c','a'].includes(event.key.toLowerCase())))return;
  if(inside&&!modified&&readingKeys.has(event.key)){
   stop(event);if(event.type!=='keydown')return;
   const amount=event.key==='ArrowDown'?48:event.key==='ArrowUp'?-48:(options.viewport().bottom-options.viewport().top)*.8*(event.key==='PageUp'?-1:1);
   const caption=panel(),scrollTarget=inPanel(node)&&caption&&caption.scrollHeight<=caption.clientHeight?reading():node;
   scrollReading(scrollTarget,amount,event.key==='Home'?'start':event.key==='End'?'end':undefined);return;
  }
  stop(event);
 }
 const focus=(event:FocusEvent)=>{if(!inPanel(element(event.target))&&!inAction(element(event.target))){stop(event,false);ensureFocus();}};
 const listeners:[string,EventListener][]=[];
 const listen=(name:string,handler:(event:never)=>void)=>{const listener=handler as EventListener;listeners.push([name,listener]);doc.addEventListener(name,listener,{capture:true,passive:false});};
 for(const name of ['pointerdown','pointermove','pointerup','pointercancel','mousedown','mousemove','mouseup','click','dblclick','auxclick','contextmenu','dragstart',...mutationEvents])listen(name,interaction);
 for(const name of ['keydown','keyup','keypress'])listen(name,keyboard);
 listen('focusin',focus);listen('wheel',wheel);listen('touchstart',touchStart);listen('touchmove',touchMove);listen('touchend',touchEnd);listen('touchcancel',touchEnd);
 ensureFocus();
 return {ensureFocus,dispose:()=>{for(const [name,listener] of listeners)doc.removeEventListener(name,listener,true);}};
}
