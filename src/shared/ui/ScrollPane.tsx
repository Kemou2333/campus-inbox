import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Box} from '@mui/material';

/** A visible, draggable scrollbar even on systems with auto-hidden native bars. */
export function ScrollPane({id,label,children,onFocus}:{id:string;label:string;children:ReactNode;onFocus?:()=>void}){
 const viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
 const drag=useRef<{y:number;top:number}|null>(null);
 const [size,setSize]=useState({height:0,total:0,top:0});
 useEffect(()=>{
  const view=viewport.current!,body=content.current!;let frame=0;
  const measure=()=>{frame=0;setSize({height:view.clientHeight,total:view.scrollHeight,top:view.scrollTop});};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  const observer=new ResizeObserver(schedule);observer.observe(view);observer.observe(body);view.addEventListener('scroll',schedule,{passive:true});measure();
  return()=>{observer.disconnect();view.removeEventListener('scroll',schedule);cancelAnimationFrame(frame);};
 },[]);
 const max=Math.max(0,size.total-size.height);const thumb=max?Math.max(32,size.height*size.height/size.total):size.height;
 const travel=Math.max(0,size.height-thumb);const position=max?size.top/max*travel:0;
 const scroll=(top:number)=>{if(viewport.current)viewport.current.scrollTop=Math.min(max,Math.max(0,top));};
 return <Box component="section" aria-label={label} id={id} onFocusCapture={onFocus} sx={{position:'relative',minWidth:0,minHeight:0}}>
  <Box ref={viewport} id={`${id}-content`} className="workspace-pane" sx={{height:'100%',overflowY:'auto',overscrollBehavior:'contain',pr:2.5,scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'}}}>
   <Box ref={content}>{children}</Box>
  </Box>
  <Box role="scrollbar" aria-label={`${label}滚动条`} aria-controls={`${id}-content`} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(size.top)} tabIndex={max?0:-1}
   onKeyDown={e=>{const values:{[key:string]:number}={ArrowDown:size.top+48,ArrowUp:size.top-48,PageDown:size.top+size.height*.85,PageUp:size.top-size.height*.85,Home:0,End:max};if(e.key in values){e.preventDefault();scroll(values[e.key]);}}}
   onPointerDown={e=>{if(!max)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);if((e.target as Element).closest('[data-scroll-thumb]'))drag.current={y:e.clientY,top:size.top};else{const y=e.clientY-e.currentTarget.getBoundingClientRect().top;const top=(y-thumb/2)/travel*max;scroll(top);drag.current={y:e.clientY,top:Math.min(max,Math.max(0,top))};}}}
   onPointerMove={e=>{if(drag.current&&travel)scroll(drag.current.top+(e.clientY-drag.current.y)/travel*max);}}
   onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
   sx={{position:'absolute',top:0,right:0,bottom:0,width:12,bgcolor:'action.hover',borderRadius:2,touchAction:'none',cursor:max?'pointer':'default','&:focus-visible':{outline:'2px solid',outlineColor:'primary.main',outlineOffset:2}}}>
   <Box data-scroll-thumb sx={{position:'absolute',top:position,left:2,right:2,height:thumb,bgcolor:max?'text.secondary':'divider',opacity:max?.65:.35,borderRadius:2,'&:hover':{opacity:.9}}}/>
  </Box>
 </Box>;
}
