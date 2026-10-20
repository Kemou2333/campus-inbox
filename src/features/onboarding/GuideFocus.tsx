import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Box,Paper,useMediaQuery} from '@mui/material';
import {useTheme} from '@mui/material/styles';
import {guideLayout,type GuideRect} from './guide-layout';

const rect=(element:Element):GuideRect=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};

/** One transparent hole reveals the actual page; no controls or notice are copied. */
export function GuideFocus({selector,readingSelector,active,children,onClose}:{selector:string;readingSelector:string;active:boolean;children:ReactNode;onClose:()=>void}){
 const theme=useTheme(),reduced=useMediaQuery('(prefers-reduced-motion: reduce)');
 const panel=useRef<HTMLDivElement>(null),[layout,setLayout]=useState<ReturnType<typeof guideLayout>|null>(null),[arrived,setArrived]=useState(false);
 const onCloseRef=useRef(onClose);onCloseRef.current=onClose;
 useEffect(()=>{if(!active){setArrived(false);return;}const timer=setTimeout(()=>setArrived(true),reduced?0:260);return()=>clearTimeout(timer);},[active,reduced]);
 useLayoutEffect(()=>{
  if(!active)return;
  const shell=document.querySelector<HTMLElement>('[data-guide-shell]');if(!shell)return;
  let frame=0,highlighted:HTMLElement|null=null,disposed=false;
  const locked=new Map<HTMLElement,boolean>();
  const target=()=>shell.querySelector<HTMLElement>(selector);
  const context=()=>shell.querySelector<HTMLElement>(readingSelector)??target();
  function lock(){
   const next=target();
   for(const control of shell!.querySelectorAll<HTMLElement>('button,input,textarea,a[href],[role="button"],[tabindex]')){
    const interactive=next?.matches('button,input,textarea,a[href],[role="button"],.MuiCheckbox-root');
    const allowed=!!interactive&&(control===next||!!next?.contains(control));
    if(allowed){if(locked.has(control)){control.inert=locked.get(control)!;locked.delete(control);}}
    else if(!locked.has(control)){locked.set(control,control.inert);control.inert=true;}
   }
  }
  function measure(){
   frame=0;if(disposed)return;lock();
   const next=target(),reading=context();
   const action=next?.matches('button,input,textarea,a[href],[role="button"],.MuiCheckbox-root')?next:null;
   if(highlighted!==action){highlighted?.classList.remove('guide-focus-target');action?.classList.add('guide-focus-target');highlighted=action;}
   if(!reading){setLayout(null);return;}
   const height=window.visualViewport?.height??window.innerHeight,width=window.visualViewport?.width??window.innerWidth;
   const panelHeight=panel.current?.getBoundingClientRect().height??210;
   const r=rect(reading),control=action?rect(action):null;
   const area=guideLayout({width,height},r,control,panelHeight);
   setLayout(previous=>JSON.stringify(previous)===JSON.stringify(area)?previous:area);
   shell!.style.setProperty('--guide-bottom-space',area.side?'0px':`${panelHeight+44}px`);
  }
  function queue(){if(!frame)frame=requestAnimationFrame(measure);}
  function reveal(){
   const next=target();if(!next)return;
   const height=window.visualViewport?.height??innerHeight;
   const panelHeight=panel.current?.getBoundingClientRect().height??210;
   const reading=context(),area=guideLayout({width:innerWidth,height},reading?rect(reading):rect(next),rect(next),panelHeight);
   const bounds=next.getBoundingClientRect(),top=82,bottom=area.availableBottom-14;
   const delta=bounds.top<top?bounds.top-top:bounds.bottom>bottom?bounds.bottom-bottom:0;
   if(delta){const scroll=next.closest<HTMLElement>('.workspace-pane');if(scroll)scroll.scrollBy({top:delta,behavior:reduced?'instant':'smooth'});else window.scrollBy({top:delta,behavior:reduced?'instant':'smooth'});}
   queue();
  }
  function guard(event:Event){const next=target(),node=event.target;if(node instanceof Node&&shell!.contains(node)&&(!next||!next.contains(node))){event.preventDefault();event.stopPropagation();}}
  function keyboard(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();onCloseRef.current();}}
  const observer=new ResizeObserver(reveal);observer.observe(shell);if(panel.current)observer.observe(panel.current);
  const mutation=new MutationObserver(reveal);mutation.observe(shell,{childList:true,subtree:true});
  document.addEventListener('click',guard,true);document.addEventListener('keydown',keyboard,true);document.addEventListener('scroll',queue,true);window.addEventListener('resize',reveal);window.visualViewport?.addEventListener('resize',reveal);
  measure();const first=requestAnimationFrame(reveal),settled=setTimeout(reveal,reduced?0:900);
  return()=>{disposed=true;cancelAnimationFrame(first);cancelAnimationFrame(frame);clearTimeout(settled);observer.disconnect();mutation.disconnect();document.removeEventListener('click',guard,true);document.removeEventListener('keydown',keyboard,true);document.removeEventListener('scroll',queue,true);window.removeEventListener('resize',reveal);window.visualViewport?.removeEventListener('resize',reveal);highlighted?.classList.remove('guide-focus-target');for(const [control,value] of locked)control.inert=value;shell.style.removeProperty('--guide-bottom-space');};
 },[active,selector,readingSelector,reduced]);
 if(!active)return null;
 const focus=arrived?layout?.focus:null,control=arrived?layout?.control:null;
 const transition=reduced?'none':'left 1100ms cubic-bezier(.4,0,.2,1), top 1100ms cubic-bezier(.4,0,.2,1), width 1100ms cubic-bezier(.4,0,.2,1), height 1100ms cubic-bezier(.4,0,.2,1), opacity 650ms ease';
 return createPortal(<Box className="in-product-guide" sx={{position:'fixed',inset:0,zIndex:theme.zIndex.modal+2,pointerEvents:'none',overflow:'hidden'}}>
  <Box aria-hidden="true" className="guide-page-hole" sx={{position:'absolute',left:focus?.x??0,top:focus?.y??0,width:focus?.width??'100%',height:focus?.height??'100%',borderRadius:focus?'16px':0,boxShadow:'0 0 0 150vmax rgba(4, 9, 16, .72), 0 0 28px 6px rgba(0, 0, 0, .26)',transition}}/>
  {control&&<Box aria-hidden="true" className="guide-action-ring" sx={{position:'absolute',left:control.x,top:control.y,width:control.width,height:control.height,border:'2px solid',borderColor:'primary.main',borderRadius:'12px',boxShadow:theme=>`0 0 0 4px ${theme.palette.background.paper}, 0 6px 24px rgba(0,0,0,.18)`,transition}}/>}
  <Paper ref={panel} role="region" aria-label="快速上手" elevation={16} sx={{position:'absolute',left:layout?.panel.x??12,top:layout?.panel.y??12,width:layout?.panel.width??'calc(100% - 24px)',maxWidth:320,maxHeight:'calc(100dvh - 24px)',overflowY:'auto',pointerEvents:'auto',p:2,borderRadius:'18px',border:'1px solid',borderColor:'divider',transition:reduced?'none':'left 850ms cubic-bezier(.4,0,.2,1), top 850ms cubic-bezier(.4,0,.2,1)',opacity:layout?1:0}}>{children}</Paper>
 </Box>,document.body);
}
