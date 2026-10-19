import type {CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {Box,Typography} from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import {keyframes} from '@emotion/react';
import {completionParticles} from './completion-feedback';

const particleFlight=keyframes`
 0%{transform:translate(-50%,-50%) scale(.25);opacity:0}
 14%{opacity:1}
 64%{transform:translate(calc(-50% + var(--peak-x)),calc(-50% + var(--peak-y))) rotate(var(--turn));opacity:1}
 100%{transform:translate(calc(-50% + var(--end-x)),calc(-50% + var(--end-y))) rotate(calc(var(--turn) + 70deg)) scale(.4);opacity:0}
`;
const greeting=keyframes`
 0%{opacity:.6;transform:translate(-50%,5px) scale(.96)}
 38%,100%{opacity:1;transform:translate(-50%,0) scale(1)}
`;

/** Portalled to the viewport so cards, accordions and scroll panes cannot clip it. */
export function CompletionCelebration({point,reducedMotion=false}:{point:{x:number;y:number;key:number};reducedMotion?:boolean}){
 if(typeof document==='undefined')return null;
 const messageX=Math.min(Math.max(point.x,68),Math.max(68,window.innerWidth-68)),messageY=Math.min(Math.max(point.y-54,12),Math.max(12,window.innerHeight-48));
 return createPortal(<Box key={point.key} className="completion-celebration" sx={{position:'fixed',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:theme=>theme.zIndex.snackbar+1}}>
  {!reducedMotion&&completionParticles.map((p,index)=><Box key={index} component="i" aria-hidden="true" className="completion-particle" style={{'--peak-x':`${p.x}px`,'--peak-y':`${p.y}px`,'--end-x':`${p.endX}px`,'--end-y':`${p.endY}px`,'--turn':`${p.rotate}deg`} as CSSProperties} sx={{position:'absolute',left:point.x,top:point.y,width:p.round?7:5,height:p.round?7:11,borderRadius:p.round?'50%':'2px',bgcolor:['success.light','warning.light','secondary.light','info.light','error.light'][index%5],animation:`${particleFlight} 1320ms cubic-bezier(.18,.75,.3,1) ${p.delay}ms both`}}/>)}
  <Typography role="status" aria-live="polite" className="notice-completion-message" sx={{position:'absolute',left:messageX,top:messageY,display:'flex',alignItems:'center',gap:.6,fontSize:15,fontWeight:700,lineHeight:1.5,whiteSpace:'nowrap',color:'success.main',bgcolor:'background.paper',px:1.25,py:.6,border:'1px solid',borderColor:'divider',borderRadius:2,boxShadow:1,transform:'translateX(-50%)',animation:reducedMotion?'none':`${greeting} 680ms cubic-bezier(.22,1,.36,1) both`}}><CheckCircle sx={{fontSize:19}}/>完成啦</Typography>
 </Box>,document.body);
}
