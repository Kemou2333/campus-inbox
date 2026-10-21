import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Box,Paper,useMediaQuery} from '@mui/material';
import {useTheme} from '@mui/material/styles';
import {followGuideRect,guideLayout,guideRectOffset,type GuideLayout,type GuideRect} from './guide-layout';

const controls='button,input,textarea,select,a[href],[role="button"],[role="checkbox"],[tabindex]';
const actionable='button,input,textarea,select,a[href],[role="button"],[role="checkbox"],.MuiCheckbox-root';
const rect=(element:Element):GuideRect=>{
 const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
};
const sameLayout=(a:GuideLayout|null,b:GuideLayout)=>JSON.stringify(a)===JSON.stringify(b);
const ease=(t:number)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

type GuideFocusProps={
 selector:string;readingSelector:string;active:boolean;children:ReactNode;onClose:()=>void;
 blockedMessage:string;targetReadOnly?:boolean;actionEnabled?:boolean;pulse?:boolean;
};
type ControlState={tabIndex:string|null;ariaDisabled:string|null};

/** The hole reveals the real page. Only the current practice action can run. */
export function GuideFocus({selector,readingSelector,active,children,onClose,blockedMessage,targetReadOnly=false,actionEnabled=true,pulse=false}:GuideFocusProps){
 const theme=useTheme(),reduced=useMediaQuery('(prefers-reduced-motion: reduce)');
 const panel=useRef<HTMLDivElement>(null),lastLayout=useRef<GuideLayout|null>(null);
 const [layout,setLayout]=useState<GuideLayout|null>(null),[arrived,setArrived]=useState(false);
 const [attempt,setAttempt]=useState(0),[hint,setHint]=useState('');
 const onCloseRef=useRef(onClose),blockedRef=useRef(blockedMessage);
 onCloseRef.current=onClose;blockedRef.current=blockedMessage;

 useEffect(()=>{
  setHint('');
  if(!active){setArrived(false);lastLayout.current=null;setLayout(null);return;}
  const timer=setTimeout(()=>setArrived(true),reduced?0:120);
  return()=>clearTimeout(timer);
 },[active,reduced]);
 useEffect(()=>setHint(''),[selector,readingSelector,blockedMessage]);

 useLayoutEffect(()=>{
  if(!active)return;
  const shell=document.querySelector<HTMLElement>('[data-guide-shell]');
  if(!shell)return;
  let frame=0,disposed=false,first=true,moveStarted=0;
  let focusOffset:GuideRect|null=null,controlOffset:GuideRect|null=null;
  let highlighted:HTMLElement|null=null,targetPulse:Animation|null=null;
  let readOnly:HTMLTextAreaElement|null=null,wasReadOnly=false;
  const locked=new Map<HTMLElement,ControlState>();
  const target=()=>shell.querySelector<HTMLElement>(selector);
  const context=()=>shell.querySelector<HTMLElement>(readingSelector)??target();
  const currentAction=()=>{const element=target();return element?.matches(actionable)?element:null;};
  const isAllowed=(node:Node)=>{
   const next=currentAction();
   return !!next&&(actionEnabled||targetReadOnly)&&(next===node||next.contains(node));
  };
  function restore(control:HTMLElement,state:ControlState){
   if(state.tabIndex===null)control.removeAttribute('tabindex');else control.setAttribute('tabindex',state.tabIndex);
   if(state.ariaDisabled===null)control.removeAttribute('aria-disabled');else control.setAttribute('aria-disabled',state.ariaDisabled);
  }
  function lock(){
   for(const control of shell!.querySelectorAll<HTMLElement>(controls)){
    if(isAllowed(control)){
     const state=locked.get(control);if(state){restore(control,state);locked.delete(control);}
    }else if(!locked.has(control)){
     // Keep pointer events so a blocked attempt can explain the current step.
     locked.set(control,{tabIndex:control.getAttribute('tabindex'),ariaDisabled:control.getAttribute('aria-disabled')});
     control.setAttribute('tabindex','-1');control.setAttribute('aria-disabled','true');
    }
   }
   const next=currentAction();
   if(highlighted!==next){
    targetPulse?.cancel();targetPulse=null;
    highlighted?.classList.remove('guide-focus-target');
    highlighted=next;next?.classList.add('guide-focus-target');
    if(next&&pulse&&!reduced&&typeof next.animate==='function'){
     targetPulse=next.animate([{scale:'1'},{scale:'1.08'},{scale:'1'}],{duration:1700,iterations:Infinity,easing:'ease-in-out'});
    }
   }
   if(targetReadOnly&&next instanceof HTMLTextAreaElement&&readOnly!==next){
    readOnly=next;wasReadOnly=next.readOnly;next.readOnly=true;
    next.focus({preventScroll:true});next.scrollTop=0;
   }
  }
  function measure(now:number){
   if(disposed)return;
   const next=target(),reading=context();
   if(reading){
    const action=currentAction(),height=window.visualViewport?.height??window.innerHeight;
    const width=window.visualViewport?.width??window.innerWidth,panelHeight=panel.current?.getBoundingClientRect().height??210;
    const measured=guideLayout({width,height},rect(reading),action?rect(action):null,panelHeight);
    if(first){
     first=false;moveStarted=now;
     const before=lastLayout.current;
     // A newly generated card fades into focus where it actually appears.
     // Do not fly the caption or stretch a hole from the bottom submit button.
     if(before&&!reduced&&selector!=='.notice-card'){
      focusOffset=guideRectOffset(before.focus,measured.focus);
      if(before.control&&measured.control)controlOffset=guideRectOffset(before.control,measured.control);
     }
    }
    const remaining=reduced?0:1-ease(Math.min(1,(now-moveStarted)/720));
    // Scroll, resize and expanding content are measured on every frame. Only the
    // one intentional focus move has a decaying offset; there is no CSS lag.
    const displayed:GuideLayout={...measured,
     focus:focusOffset?followGuideRect(measured.focus,focusOffset,remaining):measured.focus,
     control:measured.control&&controlOffset?followGuideRect(measured.control,controlOffset,remaining):measured.control,
     panel:measured.panel};
    lastLayout.current=displayed;
    setLayout(previous=>sameLayout(previous,displayed)?previous:displayed);
    const space=measured.side?'0px':`${panelHeight+44}px`;
    if(shell!.style.getPropertyValue('--guide-bottom-space')!==space)shell!.style.setProperty('--guide-bottom-space',space);
   }
   frame=requestAnimationFrame(measure);
  }
  function reveal(){
   if(disposed)return;
   const next=target(),reading=context();if(!next||!reading)return;
   const height=window.visualViewport?.height??window.innerHeight,width=window.visualViewport?.width??window.innerWidth;
   const area=guideLayout({width,height},rect(reading),rect(next),panel.current?.getBoundingClientRect().height??210);
   const bounds=next.getBoundingClientRect(),top=82,bottom=area.availableBottom-14;
   const delta=bounds.height>bottom-top?bounds.top-top:bounds.top<top?bounds.top-top:bounds.bottom>bottom?bounds.bottom-bottom:0;
   if(Math.abs(delta)>1){
    const scroll=next.closest<HTMLElement>('.workspace-pane');
    if(scroll)scroll.scrollBy({top:delta,behavior:reduced?'instant':'smooth'});
    else window.scrollBy({top:delta,behavior:reduced?'instant':'smooth'});
   }
  }
  function explain(){setHint(blockedRef.current);setAttempt(value=>value+1);}
  function guard(event:Event){
   const node=event.target;
   if(!(node instanceof Element)||!shell!.contains(node))return;
   if(targetReadOnly&&readOnly?.contains(node)&&['beforeinput','paste','drop','change'].includes(event.type)){
    event.preventDefault();event.stopPropagation();explain();return;
   }
   if(isAllowed(node))return;
   if(!node.closest(actionable)&&event.type!=='drop'&&event.type!=='beforeinput'&&event.type!=='paste')return;
   event.preventDefault();event.stopPropagation();
   if(event.type!=='pointerdown')explain();
  }
  function keyboard(event:KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();onCloseRef.current();return;}
   if(event.key==='Tab'){
    const action=currentAction(),items:HTMLElement[]=[];
    if(action&&(actionEnabled||targetReadOnly)&&!action.matches(':disabled'))items.push(action);
    if(panel.current)items.push(...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]'));
    if(!items.length)return;
    const index=items.indexOf(document.activeElement as HTMLElement);
    const next=event.shiftKey?(index<=0?items.length-1:index-1):(index+1)%items.length;
    event.preventDefault();items[next].focus({preventScroll:true});return;
   }
   if(event.key==='Enter'||event.key===' ')guard(event);
  }
  const mutation=new MutationObserver(()=>{lock();});
  mutation.observe(shell,{childList:true,subtree:true});
  const events=['pointerdown','click','change','beforeinput','paste','drop'];
  for(const name of events)document.addEventListener(name,guard,true);
  document.addEventListener('keydown',keyboard,true);
  lock();frame=requestAnimationFrame(measure);
  const fade=selector==='.notice-card'&&!reduced?panel.current?.animate([{opacity:0},{opacity:1}],{duration:320,easing:'ease-out'}):undefined;
  const firstReveal=requestAnimationFrame(reveal),settled=setTimeout(reveal,reduced?0:760);
  return()=>{
   disposed=true;cancelAnimationFrame(frame);cancelAnimationFrame(firstReveal);clearTimeout(settled);
   mutation.disconnect();fade?.cancel();targetPulse?.cancel();highlighted?.classList.remove('guide-focus-target');
   for(const name of events)document.removeEventListener(name,guard,true);
   document.removeEventListener('keydown',keyboard,true);
   for(const [control,state] of locked)restore(control,state);
   if(readOnly)readOnly.readOnly=wasReadOnly;
   shell.style.removeProperty('--guide-bottom-space');
  };
 },[active,selector,readingSelector,reduced,targetReadOnly,actionEnabled,pulse]);

 if(!active)return null;
 const focus=arrived?layout?.focus:null,control=arrived?layout?.control:null;
 return createPortal(<Box className="in-product-guide" sx={{position:'fixed',inset:0,zIndex:theme.zIndex.modal+2,pointerEvents:'none',overflow:'hidden'}}>
  <Box aria-hidden="true" className="guide-page-hole" sx={{position:'absolute',left:focus?.x??'50%',top:focus?.y??'50%',width:focus?.width??0,height:focus?.height??0,borderRadius:focus?'16px':0,boxShadow:'0 0 0 150vmax rgba(4, 9, 16, .72), 0 0 28px 6px rgba(0, 0, 0, .26)',opacity:arrived?1:0,transition:reduced?'none':'opacity 240ms ease'}}/>
  {control&&<Box aria-hidden="true" key={attempt} className="guide-action-ring" sx={{position:'absolute',left:control.x,top:control.y,width:control.width,height:control.height,border:'2px solid',borderColor:'primary.main',borderRadius:'12px',boxShadow:theme=>`0 0 0 4px ${theme.palette.background.paper}, 0 6px 24px rgba(0,0,0,.18)`,animation:!reduced&&attempt?'guide-attention 460ms ease-out':undefined,'@keyframes guide-attention':{'0%,100%':{transform:'scale(1)'},'45%':{transform:'scale(1.1)',boxShadow:'0 0 0 7px rgba(80,145,225,.24)'}}}}/>}
  <Paper ref={panel} role="region" aria-label="快速上手" elevation={16} sx={{position:'absolute',left:layout?.panel.x??12,top:layout?.panel.y??12,width:layout?.panel.width??'calc(100% - 24px)',maxWidth:320,maxHeight:'calc(100dvh - 24px)',overflowY:'auto',pointerEvents:'auto',p:2,borderRadius:'18px',border:'1px solid',borderColor:'divider',opacity:layout?1:0}}>
   {children}
   {hint&&<Box key={attempt} role="status" aria-live="polite" sx={{mt:1.5,px:1.25,py:1,borderRadius:1.5,bgcolor:'action.selected',color:'text.secondary',fontSize:14,lineHeight:1.6,animation:reduced?'none':'guide-hint 300ms ease-out','@keyframes guide-hint':{from:{opacity:.4,transform:'translateY(3px)'},to:{opacity:1,transform:'translateY(0)'}}}}>{hint}</Box>}
  </Paper>
 </Box>,document.body);
}
