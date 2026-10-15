import {useEffect,useId,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {useTheme} from '@mui/material/styles';

type Rect={x:number;y:number;width:number;height:number};
type FocusFrame={left:number;top:number;width:number;height:number;target:Rect;caption:Rect};
/** Decorative only: the real controls keep their normal focus and clicks. */
export function GuideFocus({panel,caption,selector,active}:{panel:RefObject<HTMLDivElement|null>;caption:RefObject<HTMLDivElement|null>;selector:string|null;active:boolean}){
 const theme=useTheme(),mask=useId().replace(/:/g,''),[frame,setFrame]=useState<FocusFrame|null>(null);
 useEffect(()=>{
  const container=panel.current,instruction=caption.current;
  if(!active||!selector||!container||!instruction){setFrame(null);return;}
  let scheduled=0;
  const target=()=>container.querySelector<HTMLElement>(selector);
  function measure(){
   scheduled=0;const element=target();if(!element||!container||!instruction){setFrame(null);return;}
   const p=container.getBoundingClientRect(),t=element.getBoundingClientRect(),c=instruction.getBoundingClientRect();
   if(p.width<=0||p.height<=0||t.width<=0||t.height<=0){setFrame(null);return;}
   const local=(r:DOMRect,pad:number):Rect=>({x:r.left-p.left-pad,y:r.top-p.top-pad,width:r.width+pad*2,height:r.height+pad*2});
   setFrame({left:p.left,top:p.top,width:p.width,height:p.height,target:local(t,6),caption:local(c,2)});
  }
  function queue(){if(!scheduled)scheduled=requestAnimationFrame(measure);}
  function reveal(){
   const element=target();if(!element||!container||!instruction)return;
   const p=container.getBoundingClientRect(),c=instruction.getBoundingClientRect(),t=element.getBoundingClientRect();
   const top=Math.max(p.top+8,c.bottom+12),bottom=p.bottom-10;
   if(t.bottom>bottom)container.scrollTop+=t.bottom-bottom;
   else if(t.top<top)container.scrollTop-=top-t.top;
   queue();
  }
  const observer=new ResizeObserver(queue);observer.observe(container);observer.observe(instruction);const element=target();if(element)observer.observe(element);
  container.addEventListener('scroll',queue,{passive:true});window.addEventListener('resize',reveal);
  const first=requestAnimationFrame(reveal),settled=setTimeout(reveal,280);queue();
  return()=>{observer.disconnect();container.removeEventListener('scroll',queue);window.removeEventListener('resize',reveal);cancelAnimationFrame(first);cancelAnimationFrame(scheduled);clearTimeout(settled);};
 },[active,selector,panel,caption]);
 if(!active||!selector||!frame)return null;
 const {left,top,width,height,target,caption:instruction}=frame;
 return createPortal(<svg className="guide-spotlight" aria-hidden="true" data-target={selector} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position:'fixed',left,top,width,height,zIndex:theme.zIndex.modal+1,pointerEvents:'none',overflow:'hidden'}}>
  <defs><mask id={mask} maskUnits="userSpaceOnUse"><rect width={width} height={height} fill="white"/><rect className="guide-target-hole" {...target} rx="12" fill="black"/><rect {...instruction} rx="10" fill="black"/></mask></defs>
  <rect width={width} height={height} fill="black" opacity={theme.palette.mode==='dark'?.52:.38} mask={`url(#${mask})`}/>
  <rect {...target} rx="12" fill="none" stroke={theme.palette.primary.main} strokeWidth="3"/>
 </svg>,document.body);
}
