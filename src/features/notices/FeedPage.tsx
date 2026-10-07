import {useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import {Box,Button,Chip,Collapse,InputAdornment,MenuItem,Paper,Stack,Tab,Tabs,TextField,Typography} from '@mui/material';
import Search from '@mui/icons-material/Search';
import Add from '@mui/icons-material/Add';
import ArrowForward from '@mui/icons-material/ArrowForward';
import Close from '@mui/icons-material/Close';
import {IconButton} from '@mui/material';
import {getNoticeStatus,pendingTasks,priority,sortNotices} from '../../domain/notice';
import type {Notice,SortOrder} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {NoticeCard,type NoticeActions} from './NoticeCard';
import {transitionRows} from './transition-rows';

export interface FeedViewState {tab:0|1|2;query:string;sort:SortOrder;expandedIDs:Set<string>}
export const createFeedViewState=():FeedViewState=>({tab:0,query:'',sort:'priority',expandedIDs:new Set()});

function AnimatedNotices({records,app,actions,now,query,expandedIDs,onExpandedChange,onEmpty}:{records:Notice[];app:CampusController;actions:NoticeActions;now:number;query:string;expandedIDs:ReadonlySet<string>;onExpandedChange:(id:string)=>void;onEmpty:(empty:boolean)=>void}){
 const [rows,setRows]=useState(()=>records.map(record=>({record,visible:true})));
 const current=useRef(records);current.current=records;
 useEffect(()=>setRows(previous=>transitionRows(previous,records)),[records]);
 useEffect(()=>onEmpty(rows.length===0),[rows.length,onEmpty]);
 return <Stack>{rows.map(row=><Collapse key={row.record.id} in={row.visible} timeout={260} onExited={()=>setRows(old=>old.filter(v=>v.record.id!==row.record.id||current.current.some(n=>n.id===v.record.id)))}>
  <Box sx={{pb:1.5}}><NoticeCard notice={row.record} app={app} actions={actions} now={now} expanded={expandedIDs.has(row.record.id)} onExpandedChange={()=>onExpandedChange(row.record.id)} searchQuery={query} disabled={!row.visible}/></Box>
 </Collapse>)}</Stack>;
}
export function FeedPage({app,actions,onCompose,focusID,onFocusHandled,embedded=false,viewState,onViewStateChange}:{app:CampusController;actions:NoticeActions;onCompose:()=>void;focusID:string|null;onFocusHandled?:(id:string)=>void;embedded?:boolean;viewState?:FeedViewState;onViewStateChange?:Dispatch<SetStateAction<FeedViewState>>}){
 const [localView,setLocalView]=useState(createFeedViewState);const [now,setNow]=useState(Date.now());
 const {tab,query,sort,expandedIDs}=viewState??localView;const setView=onViewStateChange??setLocalView;
 const setTab=(value:FeedViewState['tab'])=>setView(previous=>({...previous,tab:value}));
 const setQuery=(value:string)=>setView(previous=>({...previous,query:value}));
 const setSort=(value:SortOrder)=>setView(previous=>({...previous,sort:value}));
 const setExpandedIDs=(change:(previous:Set<string>)=>Set<string>)=>setView(previous=>{const next=change(previous.expandedIDs);return next===previous.expandedIDs?previous:{...previous,expandedIDs:next};});
 const expand=(id:string)=>setExpandedIDs(previous=>previous.has(id)?previous:new Set(previous).add(id));
 const toggleExpanded=(id:string)=>setExpandedIDs(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;});
 const handledFocus=useRef<string|null>(null);
 const focusScroll=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(focusScroll.current!==null)clearTimeout(focusScroll.current);},[]);
 const controls=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!embedded||!controls.current)return;const header=controls.current,view=header.closest<HTMLElement>('.workspace-pane');if(!view)return;const measure=()=>{view.style.scrollPaddingTop=`${Math.ceil(header.getBoundingClientRect().height)+12}px`;};const observer=new ResizeObserver(measure);observer.observe(header);measure();return()=>{observer.disconnect();view.style.scrollPaddingTop='';};},[embedded]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60_000);return()=>clearInterval(timer);},[]);
 const pending=app.notices.filter(n=>getNoticeStatus(n)==='pending');
 const reminders=app.notices.filter(n=>getNoticeStatus(n)==='reminder');
 const complete=app.notices.filter(n=>['completed','dismissed'].includes(getNoticeStatus(n)));
 const urgent=sortNotices(pending.filter(n=>priority(n,now).rank<=2),'priority',now).slice(0,4);
 const records=useMemo(()=>{
  const status=tab===0?'pending':tab===1?'reminder':'completed';const needle=query.trim().toLocaleLowerCase();
  return sortNotices(app.notices.filter(n=>(status==='completed'?['completed','dismissed'].includes(getNoticeStatus(n)):getNoticeStatus(n)===status)&&(!needle||[n.title,n.summary,n.originalText,n.note,...n.tasks.flatMap(t=>[t.text,t.note,...t.steps.flatMap(s=>[s.text,s.note])]),...n.reminders.flatMap(r=>[r.text,r.note])].join('\n').toLocaleLowerCase().includes(needle))),sort,now);
 },[app.notices,tab,query,sort,now]);
 const [animationEmpty,setAnimationEmpty]=useState(records.length===0);
 function jump(id:string){setTab(0);setQuery('');expand(id);setTimeout(()=>document.getElementById(`notice-${id}`)?.scrollIntoView({behavior:'smooth',block:'start'}),100);}
 useEffect(()=>{
  if(!focusID){handledFocus.current=null;return;}
  if(handledFocus.current===focusID)return;
  const n=app.notices.find(n=>n.id===focusID);if(!n)return;
  handledFocus.current=focusID;
  setTab(getNoticeStatus(n)==='pending'?0:getNoticeStatus(n)==='reminder'?1:2);setQuery('');setExpandedIDs(previous=>previous.has(focusID)?previous:new Set(previous).add(focusID));
  // Consume the intent before a resize or manual category change can replay it.
  onFocusHandled?.(focusID);
  if(focusScroll.current!==null)clearTimeout(focusScroll.current);
  focusScroll.current=setTimeout(()=>{focusScroll.current=null;document.getElementById(`notice-${focusID}`)?.scrollIntoView({behavior:'smooth',block:'start'});},150);
 },[focusID,app.notices,onFocusHandled]);
 return <Stack spacing={2} className="page-enter">
  <Box ref={controls} className="feed-controls" sx={{position:embedded?'sticky':'static',top:0,zIndex:3,bgcolor:'background.default',pb:embedded?1.5:0}}>
  <Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between",gap:2}}>
   <Box sx={{display:'flex',flexDirection:embedded?'row':'column',alignItems:embedded?'center':'flex-start',flexWrap:'wrap',gap:embedded?1.5:0}}><Typography variant={embedded?'h5':'h4'} component="h1">通知</Typography><Stack direction="row" sx={{flexWrap:"wrap",gap:1,mt:embedded?0:1}}><Chip label={`未完成：${pending.reduce((n,v)=>n+pendingTasks(v).length,0)}`} color="primary"/><Chip label={`提醒：${reminders.length}`} color="secondary" variant="outlined"/></Stack></Box>
   {!embedded&&<Button startIcon={<Add/>} variant="contained" onClick={onCompose} sx={{flexShrink:0}}>新增</Button>}
  </Stack>
  <Tabs value={tab} onChange={(_,value)=>setTab(value)} variant="fullWidth" aria-label="通知分类" sx={{borderBottom:'1px solid',borderColor:'divider',mt:1.5}}>
   <Tab label={`待办 ${pending.length}`}/><Tab label={`提醒 ${reminders.length}`}/><Tab label={`已完成 ${complete.length}`}/>
  </Tabs>
  <Stack direction="row" sx={{gap:1,mt:1.5}}>
   <TextField placeholder="搜索通知或笔记" value={query} onChange={e=>setQuery(e.target.value)} size="small" slotProps={{htmlInput:{'aria-label':'搜索通知'},input:{startAdornment:<InputAdornment position="start"><Search/></InputAdornment>,endAdornment:query?<InputAdornment position="end"><IconButton aria-label="清除搜索" onClick={()=>setQuery('')}><Close fontSize="small"/></IconButton></InputAdornment>:undefined}}}/>
   <TextField select value={sort} onChange={e=>setSort(e.target.value as SortOrder)} size="small" sx={{width:{xs:110,sm:140},flexShrink:0}} aria-label="通知排序"><MenuItem value="priority">优先级</MenuItem><MenuItem value="deadline">截止时间</MenuItem><MenuItem value="newest">最近添加</MenuItem></TextField>
  </Stack>
  </Box>
  {!!urgent.length&&tab===0&&!query&&<Paper sx={{p:1.5,bgcolor:'action.hover'}}><Typography variant="subtitle1" sx={{mb:.5}}>截止提醒</Typography><Box sx={{display:'grid',gridTemplateColumns:embedded?'repeat(2,minmax(0,1fr))':'1fr',gap:.5}}>{urgent.map(n=>{const p=priority(n,now);return <Button key={n.id} onClick={()=>jump(n.id)} endIcon={<ArrowForward fontSize="small"/>} sx={{justifyContent:'space-between',color:'text.primary',borderRadius:2,textAlign:'left',gap:1,px:1}}><Box component="span" sx={{flex:1,minWidth:0}}>{n.title}</Box><Chip label={p.label} size="small" color={p.level==='overdue'?'error':'warning'} variant="outlined"/></Button>;})}</Box></Paper>}
  <AnimatedNotices key={tab} records={records} app={app} actions={actions} now={now} query={query} expandedIDs={expandedIDs} onExpandedChange={toggleExpanded} onEmpty={setAnimationEmpty}/>
  {!records.length&&animationEmpty&&<Paper variant="outlined" sx={{p:4,textAlign:'center'}}><Typography variant="h6">{query?'没有找到匹配的通知':tab===0?'暂时没有待办':tab===1?'暂时没有提醒':'还没有完成的通知'}</Typography><Typography color="text.secondary" sx={{mt:1,mb:2}}>{query?'换一个关键词试试。':'添加通知，或者载入几条示例看看。'}</Typography>{!query&&<Stack direction="row" sx={{justifyContent:"center",gap:1}}><Button variant="contained" onClick={onCompose}>新增通知</Button><Button variant="outlined" onClick={()=>void app.loadExamples().catch(app.report)}>载入示例通知</Button></Stack>}</Paper>}
 </Stack>;
}
