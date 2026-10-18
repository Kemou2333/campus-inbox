import {useEffect,useRef,useState,type RefObject} from 'react';
import {IconButton,Tooltip,useMediaQuery} from '@mui/material';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import {alpha} from '@mui/material/styles';

/** Follow the reading pane on desktop and the page on mobile. */
export function BackToTop({anchorRef,focusRef,embedded,scopeKey}:{anchorRef:RefObject<HTMLElement|null>;focusRef:RefObject<HTMLElement|null>;embedded:boolean;scopeKey:string}){
 const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const bottomNavigation=useMediaQuery('(max-width:959px) and (min-height:501px), (max-width:599px)');
 const [visible,setVisible]=useState(false),[left,setLeft]=useState<number|null>(null);
 const shown=useRef(false),scrollTarget=useRef<HTMLElement|Window|null>(null);
 useEffect(()=>{
  const pane=embedded?anchorRef.current?.closest<HTMLElement>('.workspace-pane'):null;
  const target=pane??window;scrollTarget.current=target;
  const updateVisibility=()=>{const top=pane?pane.scrollTop:window.scrollY,height=pane?pane.clientHeight:window.innerHeight;const next=top>height*.85;if(next!==shown.current){shown.current=next;setVisible(next);}};
  const measure=()=>{if(pane){const rect=pane.getBoundingClientRect();setLeft(Math.min(window.innerWidth-52,rect.right+8));}else setLeft(null);updateVisibility();};
  const observer=pane?new ResizeObserver(measure):null;observer?.observe(pane!);
  target.addEventListener('scroll',updateVisibility,{passive:true});window.addEventListener('resize',measure,{passive:true});measure();
  return()=>{target.removeEventListener('scroll',updateVisibility);window.removeEventListener('resize',measure);observer?.disconnect();scrollTarget.current=null;};
 },[anchorRef,embedded,scopeKey]);
 const goUp=()=>{scrollTarget.current?.scrollTo({top:0,behavior:reducedMotion?'instant':'smooth'});focusRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({preventScroll:true});};
 return <Tooltip title={visible?'回到顶部':''}><IconButton className="back-to-top" aria-label="回到顶部" aria-hidden={!visible} tabIndex={visible?0:-1} onClick={goUp} sx={{position:'fixed',left:left??'auto',right:left===null?12:'auto',bottom:bottomNavigation?'calc(84px + var(--safe-bottom))':20,width:44,height:44,zIndex:8,border:'1px solid',borderColor:theme=>alpha(theme.palette.primary.main,.3),bgcolor:'background.paper',color:'primary.main',boxShadow:theme=>`0 4px 16px ${alpha(theme.palette.common.black,.12)}`,opacity:visible?1:0,visibility:visible?'visible':'hidden',transform:visible?'translateY(0)':'translateY(10px)',pointerEvents:visible?'auto':'none',transition:reducedMotion?'none':'opacity 360ms ease, transform 520ms cubic-bezier(.22,1,.36,1), visibility 360ms','&:hover':{bgcolor:'background.paper',boxShadow:theme=>`0 5px 22px ${alpha(theme.palette.primary.main,.2)}`},'&:active':{transform:reducedMotion?'none':'translateY(-3px)'}}}><ArrowUpwardRounded sx={{fontSize:22}}/></IconButton></Tooltip>;
}
