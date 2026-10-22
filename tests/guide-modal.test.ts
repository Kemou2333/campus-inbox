import {expect,test,vi} from 'vitest';
import {guideReadingScrollLimits,installGuideModalGuard} from '../src/features/onboarding/guide-modal';

class Surface {
 nodeType=1;parentElement:Surface|null=null;children:Surface[]=[];disabled=false;tabbable=false;pane=false;tagName='DIV';
 scrollTop=0;scrollHeight=100;clientHeight=100;overflowY='visible';bounds={top:100,bottom:300};
 constructor(readonly doc:Harness,readonly name:string){}
 append(...children:Surface[]){for(const child of children){child.parentElement=this;this.children.push(child);}return this;}
 contains(node:unknown):boolean{return node===this||this.children.some(child=>child.contains(node));}
 matches(selector:string){return selector===':disabled'&&this.disabled;}
 closest():Surface|null{return this.pane?this:this.parentElement?.closest()??null;}
 querySelectorAll():Surface[]{return this.children.flatMap(child=>[...(child.tabbable&&!child.disabled?[child]:[]),...child.querySelectorAll()]);}
 focus(){this.doc.activeElement=this;this.doc.emit('focusin',this);}
 getBoundingClientRect(){return this.bounds;}
}
class Harness {
 activeElement:Surface|null=null;scrollingElement:Surface|null=null;
 defaultView={getComputedStyle:(node:Surface)=>({overflowY:node.overflowY})};
 listeners=new Map<string,Set<EventListener>>();
 addEventListener(name:string,listener:EventListener){const list=this.listeners.get(name)??new Set();list.add(listener);this.listeners.set(name,list);}
 removeEventListener(name:string,listener:EventListener){this.listeners.get(name)?.delete(listener);}
 emit(name:string,target:Surface,extra:Record<string,unknown>={}){
  const event=new Event(name,{cancelable:true,bubbles:true});let stopped=false;
  Object.defineProperties(event,Object.fromEntries(Object.entries({target,...extra}).map(([key,value])=>[key,{value}])));
  const stop=vi.spyOn(event,'stopImmediatePropagation').mockImplementation(()=>{stopped=true;});
  for(const listener of this.listeners.get(name)??[]){listener(event);if(stopped)break;}
  return {event,stop};
 }
}
function setup(options:{dismissible?:boolean;readOnly?:boolean;action?:boolean}={}){
 const doc=new Harness(),page=new Surface(doc,'page'),reading=new Surface(doc,'reading'),action=new Surface(doc,'practice'),background=new Surface(doc,'settings'),panel=new Surface(doc,'guide'),back=new Surface(doc,'back'),next=new Surface(doc,'next'),portal=new Surface(doc,'other-dialog');
 action.tabbable=back.tabbable=next.tabbable=true;next.disabled=true;
 reading.append(action);page.append(reading,background);panel.append(back,next);doc.scrollingElement=page;
 const onClose=vi.fn(),onBlocked=vi.fn();
 const guard=installGuideModalGuard({document:doc as unknown as Document,panel:()=>panel as unknown as HTMLElement,action:()=>options.action===false?null:action as unknown as HTMLElement,reading:()=>reading as unknown as HTMLElement,viewport:()=>({top:80,bottom:500}),readOnly:()=>!!options.readOnly,dismissible:!!options.dismissible,onClose,onBlocked});
 return {doc,page,reading,action,background,panel,back,next,portal,onClose,onBlocked,guard};
}
test('only the current real action and tutorial panel activate; other page and portal controls are blocked',()=>{
 const x=setup();
 for(const target of [x.action,x.back])expect(x.doc.emit('click',target).event.defaultPrevented).toBe(false);
 for(const target of [x.background,x.portal,x.page]){
  const blocked=x.doc.emit('click',target);expect(blocked.event.defaultPrevented).toBe(true);expect(blocked.stop).toHaveBeenCalledOnce();
 }
 const reading=x.doc.emit('pointerdown',x.reading);expect(reading.event.defaultPrevented).toBe(false);expect(reading.stop).toHaveBeenCalledOnce();
 expect(x.doc.emit('pointermove',x.background).event.defaultPrevented).toBe(true);
 x.guard.dispose();expect([...x.doc.listeners.values()].every(value=>value.size===0)).toBe(true);
});
test('Tab and programmatic focus stay on enabled practice or navigation controls',()=>{
 const x=setup();expect(x.doc.activeElement).toBe(x.action);
 const tab=x.doc.emit('keydown',x.action,{key:'Tab'});expect(tab.event.defaultPrevented).toBe(true);expect(tab.stop).toHaveBeenCalledOnce();expect(x.doc.activeElement).toBe(x.back);
 x.doc.emit('keydown',x.back,{key:'Tab'});expect(x.doc.activeElement).toBe(x.action);
 x.doc.emit('keydown',x.action,{key:'Tab',shiftKey:true});expect(x.doc.activeElement).toBe(x.back);
 x.portal.focus();expect(x.doc.activeElement).toBe(x.action);
 x.next.disabled=false;x.next.tabbable=true;x.back.focus();x.doc.emit('keydown',x.back,{key:'Tab'});expect(x.doc.activeElement).toBe(x.next);
 x.guard.dispose();
 const reading=setup({action:false});expect(reading.doc.activeElement).toBe(reading.back);reading.guard.dispose();
});
test('first-time Escape cannot close or reach shortcuts; rewatch can close exactly once per press',()=>{
 const x=setup();
 for(const type of ['keydown','keyup','keypress'])expect(x.doc.emit(type,x.action,{key:'Escape'}).event.defaultPrevented).toBe(true);
 expect(x.onClose).not.toHaveBeenCalled();
 for(const extra of [{key:'k',ctrlKey:true},{key:'ArrowLeft',altKey:true},{key:'[',metaKey:true},{key:'Enter'}]){
  const blocked=x.doc.emit('keydown',x.background,extra);expect(blocked.event.defaultPrevented).toBe(true);expect(blocked.stop).toHaveBeenCalledOnce();
 }
 expect(x.doc.emit('keydown',x.action,{key:'Enter'}).event.defaultPrevented).toBe(false);x.guard.dispose();
 const rewatch=setup({dismissible:true});rewatch.doc.emit('keydown',rewatch.action,{key:'Escape'});rewatch.doc.emit('keydown',rewatch.action,{key:'Escape',repeat:true});rewatch.doc.emit('keyup',rewatch.action,{key:'Escape'});expect(rewatch.onClose).toHaveBeenCalledOnce();rewatch.guard.dispose();
});
test('read-only original notice stays selectable and copyable without accepting edits or paste',()=>{
 const x=setup({readOnly:true});
 for(const type of ['beforeinput','paste','cut','drop','input','change'])expect(x.doc.emit(type,x.action).event.defaultPrevented).toBe(true);
 expect(x.doc.emit('keydown',x.action,{key:'c',metaKey:true}).event.defaultPrevented).toBe(false);
 expect(x.doc.emit('keydown',x.action,{key:'v',metaKey:true}).event.defaultPrevented).toBe(true);x.guard.dispose();
});
test('wheel and touch scroll only the current reading region, without scrolling elsewhere or beyond its ends',()=>{
 const x=setup();x.page.pane=true;x.page.scrollTop=100;x.page.scrollHeight=1400;x.page.clientHeight=600;x.page.bounds={top:0,bottom:600};x.reading.bounds={top:0,bottom:900};
 expect(x.doc.emit('wheel',x.background,{deltaY:150,deltaMode:0}).event.defaultPrevented).toBe(true);expect(x.page.scrollTop).toBe(100);
 x.doc.emit('wheel',x.reading,{deltaY:10000,deltaMode:0});expect(x.page.scrollTop).toBe(500);
 x.page.scrollTop=100;x.back.focus();x.doc.emit('keydown',x.back,{key:'ArrowDown'});expect(x.page.scrollTop).toBe(148);
 x.page.scrollTop=100;x.reading.bounds={top:100,bottom:250};x.doc.emit('wheel',x.reading,{deltaY:100,deltaMode:0});expect(x.page.scrollTop).toBe(100);
 x.action.tagName='TEXTAREA';x.action.scrollHeight=900;x.action.clientHeight=100;
 x.doc.emit('touchstart',x.action,{touches:[{clientY:200}]});const touch=x.doc.emit('touchmove',x.action,{touches:[{clientY:125}]});expect(touch.event.defaultPrevented).toBe(true);expect(x.action.scrollTop).toBe(75);expect(x.page.scrollTop).toBe(100);
 x.doc.emit('touchend',x.action,{touches:[]});x.doc.emit('touchstart',x.background,{touches:[{clientY:200}]});x.doc.emit('touchmove',x.background,{touches:[{clientY:50}]});expect(x.page.scrollTop).toBe(100);x.guard.dispose();
});
test('long reading limits stay in the current passage; a short passage cannot move the page away',()=>{
 expect(guideReadingScrollLimits(200,1000,{top:100,bottom:1000},{top:80,bottom:500})).toEqual({min:220,max:700});
 expect(guideReadingScrollLimits(200,1000,{top:100,bottom:250},{top:80,bottom:500})).toEqual({min:200,max:200});
});
