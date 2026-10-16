import {useEffect,useId,useState,type CSSProperties,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {useTheme} from '@mui/material/styles';

type Rect={x:number;y:number;width:number;height:number};
type FocusFrame={width:number;height:number;target:Rect|null;windows:Rect[]};
const rect=(r:DOMRect,pad=0):Rect=>({x:r.left-pad,y:r.top-pad,width:r.width+pad*2,height:r.height+pad*2});
const geometry=(r:Rect)=>({x:r.x,y:r.y,width:r.width,height:r.height}) as CSSProperties;
const path=(r:Rect)=>`M${r.x},${r.y}h${r.width}v${r.height}h${-r.width}Z`;
/** Union the clear windows first, so overlapping navigation/target holes never block clicks. */
function blockingPath(width:number,height:number,holes:Rect[]){
 const edges=[...new Set([0,width,...holes.flatMap(hole=>[Math.max(0,Math.min(width,hole.x)),Math.max(0,Math.min(width,hole.x+hole.width))])])].sort((a,b)=>a-b),blocked:Rect[]=[];
 for(let i=1;i<edges.length;i++){
  const left=edges[i-1],right=edges[i];if(right<=left)continue;
  const ranges=holes.filter(hole=>hole.x<right&&hole.x+hole.width>left).map(hole=>[Math.max(0,hole.y),Math.min(height,hole.y+hole.height)]).filter(([top,bottom])=>bottom>top).sort((a,b)=>a[0]-b[0]);
  let bottom=0;for(const [top,nextBottom] of ranges){if(top>bottom)blocked.push({x:left,y:bottom,width:right-left,height:top-bottom});bottom=Math.max(bottom,nextBottom);}
  if(bottom<height)blocked.push({x:left,y:bottom,width:right-left,height:height-bottom});
 }
 return blocked.map(path).join('');
}
/** The visual cut-out moves independently; clicks always reach the actual target. */
export function GuideFocus({panel,caption,selector,readingSelector,active}:{panel:RefObject<HTMLDivElement|null>;caption:RefObject<HTMLDivElement|null>;selector:string|null;readingSelector?:string|null;active:boolean}){
 const theme=useTheme(),mask=useId().replace(/:/g,''),[frame,setFrame]=useState<FocusFrame|null>(null),[entered,setEntered]=useState(false);
 useEffect(()=>{
  if(!active){setEntered(false);return;}
  let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>setEntered(true));});
  return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
 },[active]);
 useEffect(()=>{
  const container=panel.current,instruction=caption.current,dialog=container?.closest<HTMLElement>('[role="dialog"]');
  if(!active||!container||!instruction||!dialog){setFrame(null);return;}
  let scheduled=0,highlighted:HTMLElement|null=null;
  const locked=new Map<HTMLElement,boolean>(),target=()=>selector?dialog.querySelector<HTMLElement>(selector):null,reading=()=>readingSelector?container.querySelector<HTMLElement>(readingSelector):null;
  const clearRegions=()=>[dialog.querySelector<HTMLElement>('[data-guide-header]'),instruction,dialog.querySelector<HTMLElement>('[data-guide-navigation]')].filter((value):value is HTMLElement=>!!value);
  function lockControls(element:HTMLElement|null){
   const regions=clearRegions();
   dialog!.querySelectorAll<HTMLElement>('button,input,textarea,a[href],[role="button"],[tabindex]').forEach(control=>{
    const allowed=control===element||!!element?.contains(control)||regions.some(region=>region.contains(control));
    if(allowed){if(locked.has(control)){control.inert=locked.get(control)!;locked.delete(control);}return;}
    if(!locked.has(control)){locked.set(control,control.inert);control.inert=true;}
   });
   if(highlighted!==element){highlighted?.classList.remove('guide-focus-target');element?.classList.add('guide-focus-target');highlighted=element;}
  }
  function measure(){
   scheduled=0;const element=target(),t=element?.getBoundingClientRect();
   lockControls(element);
   const windows=clearRegions().map(region=>rect(region.getBoundingClientRect(),2)),read=reading()?.getBoundingClientRect();
   if(read){const p=container!.getBoundingClientRect(),top=Math.max(read.top,p.top,instruction!.getBoundingClientRect().bottom+6),bottom=Math.min(read.bottom,p.bottom);if(bottom>top)windows.push({x:read.left-2,y:top,width:read.width+4,height:bottom-top});}
   setFrame({width:window.innerWidth,height:window.innerHeight,target:t&&t.width>0&&t.height>0?rect(t,7):null,windows});
  }
  function queue(){if(!scheduled)scheduled=requestAnimationFrame(measure);}
  function reveal(){
   const element=reading()??target();if(!element)return queue();
   if(container!.contains(element)){
    const p=container!.getBoundingClientRect(),c=instruction!.getBoundingClientRect(),t=element.getBoundingClientRect();
    const top=Math.max(p.top+8,c.bottom+12),bottom=p.bottom-10;
    if(t.height>bottom-top)container!.scrollTop+=t.top-top;
    else if(t.bottom>bottom)container!.scrollTop+=t.bottom-bottom;
    else if(t.top<top)container!.scrollTop-=top-t.top;
   }
   queue();
  }
  const observer=new ResizeObserver(queue);observer.observe(dialog);observer.observe(container);observer.observe(instruction);
  const mutations=new MutationObserver(()=>{reveal();});mutations.observe(container,{childList:true,subtree:true});
  container.addEventListener('scroll',queue,{passive:true});window.addEventListener('resize',reveal);window.visualViewport?.addEventListener('resize',reveal);
  const first=requestAnimationFrame(reveal),settled=setTimeout(reveal,320);queue();
  return()=>{observer.disconnect();mutations.disconnect();container.removeEventListener('scroll',queue);window.removeEventListener('resize',reveal);window.visualViewport?.removeEventListener('resize',reveal);cancelAnimationFrame(first);cancelAnimationFrame(scheduled);clearTimeout(settled);highlighted?.classList.remove('guide-focus-target');locked.forEach((original,element)=>{element.inert=original;});};
 },[active,selector,readingSelector,panel,caption]);
 if(!active||!frame)return null;
 const {width,height,target,windows}=frame;
 const animatedTarget=entered?target:{x:0,y:0,width,height};
 const holes=[...windows,...(target?[target]:[])];
 return createPortal(<svg className={`guide-spotlight${entered?' guide-spotlight-entered':''}`} aria-hidden="true" data-target={selector??''} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position:'fixed',inset:0,width:'100vw',height:'100dvh',zIndex:theme.zIndex.modal+1,pointerEvents:'none',overflow:'hidden'}}>
  <defs><mask id={mask} maskUnits="userSpaceOnUse"><rect width={width} height={height} fill="white"/>{windows.map((window,index)=><rect key={index} {...window} rx="8" fill="black"/>)}{animatedTarget&&<rect className="guide-target-hole" style={geometry(animatedTarget)} rx="12" fill="black"/>}</mask></defs>
  <rect width={width} height={height} fill="black" opacity={theme.palette.mode==='dark'?.68:.52} mask={`url(#${mask})`}/>
  {animatedTarget&&<rect className="guide-target-ring" style={geometry(animatedTarget)} rx="12" fill="none" stroke={theme.palette.primary.main} strokeWidth="3"/>}
  <path d={blockingPath(width,height,holes)} fill="transparent" style={{pointerEvents:'fill'}} onPointerDown={event=>{event.preventDefault();event.stopPropagation();}} onClick={event=>{event.preventDefault();event.stopPropagation();}}/>
 </svg>,document.body);
}
