import {useEffect,useState,type CSSProperties,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {useTheme} from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

type Rect={x:number;y:number;width:number;height:number};
/** The dialog supplies the sole backdrop. Its practice stays fully readable. */
export function GuideFocus({panel,caption,selector,readingSelector,active}:{panel:RefObject<HTMLDivElement|null>;caption:RefObject<HTMLDivElement|null>;selector:string|null;readingSelector?:string|null;active:boolean}){
 const theme=useTheme(),reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const [focusSelector,setFocusSelector]=useState<string|null>(null),[frame,setFrame]=useState<Rect|null>(null);
 useEffect(()=>{
  if(!active){setFocusSelector(null);return;}
  if(reducedMotion){setFocusSelector(selector);return;}
  // Let the new result be read before drawing attention to its next action.
  const timer=setTimeout(()=>setFocusSelector(selector),850);
  return()=>clearTimeout(timer);
 },[active,selector,reducedMotion]);
 useEffect(()=>{
  const container=panel.current,instruction=caption.current,dialog=container?.closest<HTMLElement>('[role="dialog"]');
  if(!active||!container||!instruction||!dialog){setFrame(null);return;}
  let scheduled=0,highlighted:HTMLElement|null=null;
  const locked=new Map<HTMLElement,boolean>();
  const target=()=>selector?dialog.querySelector<HTMLElement>(selector):null;
  const focused=()=>focusSelector?dialog.querySelector<HTMLElement>(focusSelector):null;
  const reading=()=>readingSelector?container.querySelector<HTMLElement>(readingSelector):null;
  function lockControls(){
   const next=target();
   const navigation=[instruction,dialog!.querySelector('[data-guide-header]'),dialog!.querySelector('[data-guide-navigation]')];
   dialog!.querySelectorAll<HTMLElement>('button,input,textarea,a[href],[role="button"],[tabindex]').forEach(control=>{
    const allowed=control===next||!!next?.contains(control)||navigation.some(region=>region?.contains(control))||(control instanceof HTMLTextAreaElement&&control.readOnly);
    if(allowed){if(locked.has(control)){control.inert=locked.get(control)!;locked.delete(control);}return;}
    if(!locked.has(control)){locked.set(control,control.inert);control.inert=true;}
   });
  }
  function measure(){
   scheduled=0;lockControls();
   const control=focused();
   if(highlighted!==control){highlighted?.classList.remove('guide-focus-target');control?.classList.add('guide-focus-target');highlighted=control;}
   if(!control){setFrame(null);return;}
   const rect=control.getBoundingClientRect();
   const viewport=container!.contains(control)?container!.getBoundingClientRect():dialog!.getBoundingClientRect();
   const left=Math.max(rect.left-5,viewport.left),top=Math.max(rect.top-5,viewport.top);
   const right=Math.min(rect.right+5,viewport.right),bottom=Math.min(rect.bottom+5,viewport.bottom);
   setFrame(rect.width>0&&rect.height>0&&right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:null);
  }
  function queue(){if(!scheduled)scheduled=requestAnimationFrame(measure);}
  function reveal(){
   const element=reading()??target();
   if(element&&container!.contains(element)){
    const p=container!.getBoundingClientRect(),r=element.getBoundingClientRect();
    const top=p.top+12,bottom=p.bottom-12;
    if(r.height>bottom-top)container!.scrollTop+=r.top-top;
    else if(r.bottom>bottom)container!.scrollTop+=r.bottom-bottom;
    else if(r.top<top)container!.scrollTop+=r.top-top;
   }
   queue();
  }
  const observer=new ResizeObserver(reveal);observer.observe(dialog);observer.observe(container);
  const mutation=new MutationObserver(reveal);mutation.observe(container,{childList:true,subtree:true});
  container.addEventListener('scroll',queue,{passive:true});window.addEventListener('resize',reveal);
  window.visualViewport?.addEventListener('resize',reveal);
  const first=requestAnimationFrame(reveal),settled=setTimeout(reveal,700);
  return()=>{observer.disconnect();mutation.disconnect();container.removeEventListener('scroll',queue);window.removeEventListener('resize',reveal);window.visualViewport?.removeEventListener('resize',reveal);cancelAnimationFrame(first);cancelAnimationFrame(scheduled);clearTimeout(settled);highlighted?.classList.remove('guide-focus-target');locked.forEach((value,control)=>{control.inert=value;});};
 },[active,selector,focusSelector,readingSelector,panel,caption]);
 if(!active||!frame)return null;
 return createPortal(<svg className="guide-focus-overlay" aria-hidden="true" data-target={focusSelector??''} data-pending-target={selector??''} data-focus-ready={focusSelector===selector} style={{position:'fixed',inset:0,width:'100vw',height:'100dvh',zIndex:theme.zIndex.modal+1,pointerEvents:'none',overflow:'hidden',animation:reducedMotion?'none':'guide-focus-arrive 600ms ease-out'}}>
  <rect className="guide-target-ring" style={{...frame,transition:reducedMotion?'none':'x 900ms cubic-bezier(.22,1,.36,1),y 900ms cubic-bezier(.22,1,.36,1),width 900ms cubic-bezier(.22,1,.36,1),height 900ms cubic-bezier(.22,1,.36,1)'} as CSSProperties} rx="12" fill="none" stroke={theme.palette.primary.main} strokeWidth="3"/>
 </svg>,document.body);
}
