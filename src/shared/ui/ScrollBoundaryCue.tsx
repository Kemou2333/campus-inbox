import {useEffect,useRef,useState,type RefObject} from 'react';
import {Box,useMediaQuery} from '@mui/material';
/** A small edge response. The page itself never stretches or follows the finger late. */
export function ScrollBoundaryCue({anchor}:{anchor:RefObject<HTMLElement|null>}){
 const [edge,setEdge]=useState<'top'|'bottom'|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),last=useRef(0),reduced=useMediaQuery('(prefers-reduced-motion: reduce)');
 useEffect(()=>{const element=anchor.current,scroll=element?.closest<HTMLElement>('.workspace-pane'),target=scroll??document;let start:number|null=null;
  const show=(delta:number)=>{const now=performance.now();if(now-last.current<650)return;const top=scroll?.scrollTop??window.scrollY,height=scroll?.clientHeight??innerHeight,total=scroll?.scrollHeight??document.documentElement.scrollHeight;const at=delta>0&&top+height>=total-3?'bottom':delta<0&&top<=1?'top':null;if(!at)return;last.current=now;setEdge(at);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setEdge(null),650);};
  const touchStart=(e:Event)=>{start=(e as TouchEvent).touches[0]?.clientY??null;};const touchMove=(e:Event)=>{const y=(e as TouchEvent).touches[0]?.clientY;if(start!==null&&y!==undefined&&Math.abs(start-y)>18){show(start-y);start=y;}};
  target.addEventListener('touchstart',touchStart,{passive:true});target.addEventListener('touchmove',touchMove,{passive:true});return()=>{target.removeEventListener('touchstart',touchStart);target.removeEventListener('touchmove',touchMove);if(timer.current)clearTimeout(timer.current);};
 },[anchor]);
 return edge?<Box aria-hidden="true" sx={{position:'fixed',pointerEvents:'none',zIndex:11,left:'30%',right:'30%',height:4,borderRadius:4,bgcolor:'primary.main',opacity:.5,[edge]:edge==='bottom'?'calc(74px + var(--safe-bottom))':64,animation:reduced?'none':'boundary-breathe 650ms cubic-bezier(.22,1,.36,1)'}}/>:null;
}
