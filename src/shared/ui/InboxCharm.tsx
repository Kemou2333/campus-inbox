import {useEffect,useRef,useState} from 'react';
import {Box,IconButton,Typography,useMediaQuery} from '@mui/material';
import {alpha} from '@mui/material/styles';

/** A small local-only hello, kept outside the notice content. */
export function InboxCharm({size=56,message='今天少翻一点群。',showMessage=true,onPress}:{size?:number;message?:string;showMessage?:boolean;onPress?:()=>void}){
 const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const [greeting,setGreeting]=useState(false),[wink,setWink]=useState(0);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(timer.current!==null)clearTimeout(timer.current);},[]);
 const sayHello=()=>{onPress?.();setWink(previous=>previous+1);if(!showMessage)return;setGreeting(true);if(timer.current!==null)clearTimeout(timer.current);timer.current=setTimeout(()=>setGreeting(false),4500);};
 return <Box className="inbox-charm" sx={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:1,minHeight:Math.max(44,size*.82),flexWrap:'wrap'}}>
  <IconButton aria-label="一封小信" title="点一下小信封" onClick={sayHello} sx={{p:.5,width:Math.max(44,size+8),height:Math.max(44,size*.82+8),color:'primary.main',borderRadius:2,'&:hover':{bgcolor:theme=>alpha(theme.palette.warning.main,.08)},'&:active':{transform:reducedMotion?'none':'rotate(-4deg)'},transition:reducedMotion?'none':'background-color 300ms ease, transform 420ms cubic-bezier(.22,1,.36,1)'}}>
   <Box component="svg" viewBox="0 0 64 52" fill="none" aria-hidden="true" sx={{width:size,height:size*.82,overflow:'visible','& .charm-warm':{fill:theme=>alpha(theme.palette.warning.main,theme.palette.mode==='dark'?.17:.14),stroke:theme=>theme.palette.warning.main},'& .charm-paper':{fill:theme=>theme.palette.background.paper,stroke:theme=>theme.palette.divider},'& .charm-line':{stroke:theme=>theme.palette.primary.main},'& .charm-fold':{stroke:theme=>theme.palette.warning.main},'& .charm-eye':{fill:theme=>theme.palette.primary.main},'& .charm-right-eye':{transformOrigin:'center',transformBox:'fill-box',animation:wink&&!reducedMotion?'inbox-charm-wink 720ms cubic-bezier(.22,1,.36,1)':'none'},'@keyframes inbox-charm-wink':{'0%,28%,100%':{transform:'scaleY(1)'},'45%,65%':{transform:'scaleY(.12)'}}}}>
    <path className="charm-warm" d="M7 17 30 3a4 4 0 0 1 4 0l23 14" strokeWidth="1.7"/>
    <rect className="charm-paper" x="16" y="7" width="32" height="28" rx="4" strokeWidth="1.7"/>
    <path className="charm-line" d="M23 14h18m-18 6h12" strokeWidth="2" strokeLinecap="round"/>
    <path className="charm-warm" d="M6 18h52v27a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V18Z" strokeWidth="1.7"/>
    <path className="charm-fold" d="m7 19 23 16a4 4 0 0 0 4 0l23-16M7 47l16-15m34 15L41 32" strokeWidth="1.5"/>
    <circle className="charm-eye" cx="27" cy="41" r="1.3"/>
    <circle key={wink} className="charm-eye charm-right-eye" cx="37" cy="41" r="1.3"/>
   </Box>
  </IconButton>
  {showMessage&&<Typography className="inbox-charm-greeting" role="status" aria-live="polite" sx={{fontSize:13,color:'text.secondary',display:greeting?'block':'none',lineHeight:1.6}}>{greeting?message:''}</Typography>}
 </Box>;
}
