import {useRef,useState,type ReactNode} from 'react';
import {Box,Typography} from '@mui/material';
import Check from '@mui/icons-material/Check';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import {noticeSwipeAction} from './swipe-action';
export function SwipeSurface({enabled,done,children,onComplete,onDelete}:{enabled:boolean;done:boolean;children:ReactNode;onComplete:()=>void;onDelete:()=>void}){
 const drag=useRef<{x:number;y:number;dx:number;dy:number;horizontal:boolean;id:number}|null>(null),[direction,setDirection]=useState(0),suppressClick=useRef(0);
 if(!enabled)return children;
 return <Box sx={{position:'relative',borderRadius:'17px',touchAction:'pan-y'}} onClickCapture={e=>{if(performance.now()<suppressClick.current){e.preventDefault();e.stopPropagation();}}}>
  {!!direction&&<Box aria-hidden="true" sx={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:direction>0?'flex-start':'flex-end',px:2,gap:1,borderRadius:'17px',bgcolor:direction>0?'success.main':'error.main',color:'#fff',overflow:'hidden'}}>{direction>0?<Check/>:<DeleteOutlined/>}<Typography sx={{fontSize:14,fontWeight:700}}>{direction>0?done?'已完成':'完成':'删除'}</Typography></Box>}
  <Box onPointerDown={e=>{if(e.pointerType!=='touch'||(e.target as Element).closest('button,a,input,textarea,[role="button"],[data-correction-path]'))return;drag.current={x:e.clientX,y:e.clientY,dx:0,dy:0,horizontal:false,id:e.pointerId};}}
   onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;d.dx=e.clientX-d.x;d.dy=e.clientY-d.y;if(!d.horizontal&&Math.abs(d.dy)>16&&Math.abs(d.dy)>Math.abs(d.dx)){drag.current=null;return;}if(Math.abs(d.dx)>14&&Math.abs(d.dx)>Math.abs(d.dy)*1.6)d.horizontal=true;if(!d.horizontal)return;e.currentTarget.setPointerCapture(e.pointerId);setDirection(d.dx>0?1:-1);e.currentTarget.style.setProperty('--notice-swipe-x',`${Math.max(-155,Math.min(155,d.dx))}px`);e.currentTarget.style.transition='none';}}
   onPointerUp={e=>{const d=drag.current;drag.current=null;e.currentTarget.style.transition='transform 320ms cubic-bezier(.22,1,.36,1)';e.currentTarget.style.setProperty('--notice-swipe-x','0px');setDirection(0);if(!d?.horizontal)return;suppressClick.current=performance.now()+350;const action=noticeSwipeAction(d.dx,d.dy,e.currentTarget.clientWidth);if(action==='delete')onDelete();else if(action==='complete'&&!done)onComplete();}}
   onPointerCancel={e=>{drag.current=null;setDirection(0);e.currentTarget.style.setProperty('--notice-swipe-x','0px');}}
   sx={{transform:'translateX(var(--notice-swipe-x,0px))',touchAction:'pan-y',position:'relative'}}>{children}</Box>
 </Box>;
}
