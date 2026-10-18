import {useEffect,useRef,useState,type RefObject} from 'react';
import {collectSearchLocations,resolveSearchLocation,type SearchLocation} from './search-navigation';

export function useSearchNavigation(root:RefObject<HTMLElement|null>,query:string,scopeKey:string,onReveal:(noticeID:string,taskID?:string)=>void){
 const [position,setPosition]=useState({current:0,total:0});
 const selected=useRef<SearchLocation|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),reveal=useRef(onReveal);reveal.current=onReveal;
 const marked=useRef<HTMLElement|null>(null);
 function mark(location:SearchLocation|null){if(marked.current!==location?.element){marked.current?.removeAttribute('data-search-current');marked.current=location?.element??null;marked.current?.setAttribute('data-search-current','true');}}
 function refresh(){const locations=query.trim()&&root.current?collectSearchLocations(root.current):[];const current=resolveSearchLocation(locations,selected.current);selected.current=current??null;mark(current??null);const next={current:current?locations.indexOf(current)+1:0,total:locations.length};setPosition(old=>old.current===next.current&&old.total===next.total?old:next);return locations;}
 const refreshRef=useRef(refresh);refreshRef.current=refresh;
 useEffect(()=>{
  if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}selected.current=null;mark(null);refreshRef.current();
  const node=root.current;if(!node||!query.trim())return;
  let frame:number|null=null;
  const observer=new MutationObserver(()=>{if(frame===null&&timer.current===null)frame=requestAnimationFrame(()=>{frame=null;refreshRef.current();});});
  observer.observe(node,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','inert','aria-hidden','data-search-editing','data-search-active']});
  return()=>{observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}mark(null);};
 },[query,scopeKey,root]);
 function go(direction:1|-1){
  const locations=refresh();if(!locations.length)return;
  const found=resolveSearchLocation(locations,selected.current),index=found?locations.indexOf(found):-1;
  const next=index<0?(direction===1?0:locations.length-1):(index+direction+locations.length)%locations.length,target=locations[next];
  selected.current=target;mark(target);setPosition({current:next+1,total:locations.length});reveal.current(target.noticeID,target.taskID);
  if(timer.current!==null)clearTimeout(timer.current);
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  timer.current=setTimeout(()=>{timer.current=null;refreshRef.current();selected.current?.element.scrollIntoView({block:'center',behavior:reduced?'auto':'smooth'});},reduced?0:390);
 }
 return {...position,previous:()=>go(-1),next:()=>go(1)};
}
