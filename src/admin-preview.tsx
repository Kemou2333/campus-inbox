import {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Alert,Box,CssBaseline,Stack,ThemeProvider,Typography,useMediaQuery} from '@mui/material';
import {makeTheme} from './app/theme';
import type {CampusController} from './app/useCampus';
import {effectiveNotice} from './domain/corrections';
import type {Notice} from './domain/types';
import {NoticeCard,type NoticeActions} from './features/notices/NoticeCard';
import {DetailDialog} from './features/notices/DetailDialog';
import {ADMIN_ORIGIN,PREVIEW_HEIGHT,PREVIEW_READY,parsePreviewData,trustedPreviewMessage} from './features/admin/preview-protocol';
import './shared/ui/global.css';

// Presentation-only entry: no useCampus, repository, auth, model, native bridge or attachment reads.
const readonlyController={act:()=>{},remove:()=>{}} as unknown as CampusController;
function Preview(){
 const dark=useMediaQuery('(prefers-color-scheme: dark)'),theme=useMemo(()=>makeTheme(dark,null),[dark]);
 const [records,setRecords]=useState<Notice[]>([]),[error,setError]=useState('');
 const [expanded,setExpanded]=useState<Set<string>>(()=>new Set()),[tasks,setTasks]=useState<Set<string>>(()=>new Set());
 const [source,setSource]=useState<{notice:Notice;path?:string}|null>(null),[received,setReceived]=useState(false);
 useEffect(()=>{
  function receive(event:MessageEvent){
   if(window.parent===window||!trustedPreviewMessage(event,window.parent))return;
   try{
    const next=parsePreviewData(event.data);if(next===null)return;
    setRecords(next);setError('');setReceived(true);setSource(null);setExpanded(new Set());setTasks(new Set());
   }catch{setRecords([]);setSource(null);setExpanded(new Set());setTasks(new Set());setReceived(true);setError('这条通知无法预览，请重新选择。');}
  }
  window.addEventListener('message',receive);
  if(window.parent!==window)window.parent.postMessage({type:PREVIEW_READY},ADMIN_ORIGIN);
  return()=>window.removeEventListener('message',receive);
 },[]);
 useEffect(()=>{
  let frame=0;
  const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   // Measure content, not the iframe viewport; otherwise a previously expanded frame cannot shrink.
   const height=Math.min(20000,Math.max(240,Math.ceil(document.querySelector('main')?.getBoundingClientRect().height??240)));
   if(window.parent!==window)window.parent.postMessage({type:PREVIEW_HEIGHT,height},ADMIN_ORIGIN);
  });};
  const observer=new ResizeObserver(resize);observer.observe(document.querySelector('main')!);resize();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();};
 },[]);
 function toggle(setter:typeof setExpanded,id:string){setter(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;});}
 function original(notice:Notice,path?:string){const raw=records.find(n=>n.id===notice.id);if(raw)setSource({notice:raw,path});}
 const actions:NoticeActions={note:()=>{},calendar:()=>{},correct:()=>{},details:n=>original(n),evidence:original};
 return <ThemeProvider theme={theme}><CssBaseline/><Box component="main" sx={{maxWidth:760,mx:'auto',p:{xs:1,sm:2},minWidth:0}}>
  <Typography sx={{mb:1,color:'text.secondary',fontSize:13}}>通知预览 · 只读</Typography>
  {error?<Alert severity="warning">{error}</Alert>:<Stack spacing={2}>{records.map(raw=><NoticeCard key={raw.id} notice={effectiveNotice(raw)} app={readonlyController} actions={actions} now={Date.now()} expanded={expanded.has(raw.id)} onExpandedChange={()=>toggle(setExpanded,raw.id)} expandedTaskIDs={tasks} onTaskExpandedChange={id=>toggle(setTasks,id)} readOnly/>)}
   {!records.length&&<Typography sx={{p:2,color:'text.secondary',fontSize:14}}>{received?'没有可预览的通知。':'请在后台选择一条通知。'}</Typography>}
  </Stack>}
  <DetailDialog notice={source?.notice??null} path={source?.path} app={readonlyController} onClose={()=>setSource(null)} readOnly/>
 </Box></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
