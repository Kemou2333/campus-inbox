import {Fragment,useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction,type ReactNode} from 'react';
import {Box,Button,Checkbox,Chip,Collapse,Dialog,DialogActions,DialogContent,DialogTitle,Divider,FormControlLabel,InputAdornment,MenuItem,Paper,Stack,Tab,Tabs,TextField,Tooltip,Typography,useMediaQuery} from '@mui/material';
import PersonOutline from '@mui/icons-material/PersonOutlineOutlined';
import FilterAltOutlined from '@mui/icons-material/FilterAltOutlined';
import {hasProfile,matchNoticeProfile} from '../../domain/campus-preferences';
import {withTeachingCalendar} from '../../domain/teaching-calendar';
import Close from '@mui/icons-material/Close';
import NavigateBefore from '@mui/icons-material/NavigateBefore';
import NavigateNext from '@mui/icons-material/NavigateNext';
import Add from '@mui/icons-material/Add';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {IconButton} from '@mui/material';
import {getNoticeStatus,sortNotices} from '../../domain/notice';
import type {Notice,SortOrder,ManualPriority} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {NoticeCard,type NoticeActions} from './NoticeCard';
import {inPastSevenDays,manualPriorities as priorityOptions} from '../../domain/notice-priority';
import {transitionRows} from './transition-rows';
import {isLocalDemoNotice} from '../../domain/local-demo';
import {visibleModelLibrary} from '../../domain/model-tests';
import {effectiveNotice} from '../../domain/corrections';
import {SearchQueryContext,HighlightedText} from '../../shared/ui/SearchHighlight';
import {noticeSearchMatches} from './search-matches';
import {useSearchNavigation} from './useSearchNavigation';
import {groupExampleNotices,isExampleNotice,readExamplesHidden,writeExamplesHidden,sortExampleNotices} from '../../domain/examples';
import {InboxCharm} from '../../shared/ui/InboxCharm';
import GitHub from '@mui/icons-material/GitHub';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import {ScrollBoundaryCue} from '../../shared/ui/ScrollBoundaryCue';
import {useUiPreferences,type UiPreferences} from '../../shared/ui-preferences';
import {BackToTop} from '../../shared/ui/BackToTop';

export interface FeedViewState {tab:0|1|2;query:string;sort:SortOrder;expandedIDs:Set<string>;expandedTaskIDs:Set<string>;favoritesOnly?:boolean;relevantOnly?:boolean;manualPriorities?:ManualPriority[];pastSevenDaysOnly?:boolean}
export const createFeedViewState=():FeedViewState=>({tab:0,query:'',sort:'priority',expandedIDs:new Set(),expandedTaskIDs:new Set(),favoritesOnly:false,relevantOnly:false,manualPriorities:[],pastSevenDaysOnly:false});

/** Leave sideways first; only then close the gap for the following card. */
function NoticeRowTransition({visible,departure,reduced,onExited,children}:{visible:boolean;departure:'complete'|'delete'|'filter';reduced:boolean;onExited:()=>void;children:ReactNode}){
 const [open,setOpen]=useState(visible);
 useEffect(()=>{
  if(visible){setOpen(true);return;}
  if(reduced){setOpen(false);return;}
  const timer=setTimeout(()=>setOpen(false),departure==='filter'?180:440);
  return()=>clearTimeout(timer);
 },[visible,departure,reduced]);
 const transform=visible?'none':departure==='complete'?'translateX(110%) rotate(1.5deg)':departure==='delete'?'translateX(-55px) rotate(-3deg) skewY(-2deg)':'translateY(-5px)';
 return <Collapse in={open} timeout={reduced?0:{enter:440,exit:360}} easing="cubic-bezier(.22,1,.36,1)" onExited={onExited}>
  <Box className="notice-row-motion" data-departure={visible?undefined:departure} sx={{opacity:visible?1:0,transform,transformOrigin:'top right',clipPath:!visible&&departure==='delete'?'inset(0 25% 0 0 round 17px)':'none',pointerEvents:visible?undefined:'none',transition:reduced?'none':`transform 440ms cubic-bezier(.45,0,.85,.45), opacity ${departure==='complete'?120:departure==='filter'?180:280}ms ease ${visible?0:departure==='complete'?320:120}ms, clip-path 440ms cubic-bezier(.4,0,.3,1)`}}>{children}</Box>
 </Collapse>;
}

function AnimatedNotices({query,editingID,onEditingClose,records,allRecords,viewKey,exampleDivider=false,app,actions,now,expandedIDs,onExpandedChange,expandedTaskIDs,onTaskExpandedChange,onEmpty,uiPreferences}:{query:string;editingID?:string;onEditingClose?:()=>void;records:Notice[];allRecords:Notice[];viewKey:string;exampleDivider?:boolean;app:CampusController;actions:NoticeActions;now:number;expandedIDs:Set<string>;onExpandedChange:(id:string)=>void;expandedTaskIDs:Set<string>;onTaskExpandedChange:(id:string)=>void;onEmpty:(empty:boolean)=>void;uiPreferences:UiPreferences}){
 const liveIDs=new Set(allRecords.map(n=>n.id));
 const [rows,setRows]=useState(()=>records.map(record=>({record,visible:true})));
 const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const current=useRef(records);current.current=records;
 const holds=useRef(new Map<string,ReturnType<typeof setTimeout>>()),[holdRevision,setHoldRevision]=useState(0);
 const clearHolds=()=>{for(const timer of holds.current.values())clearTimeout(timer);holds.current.clear();};
 useEffect(()=>{clearHolds();setHoldRevision(value=>value+1);},[viewKey]);
 useEffect(()=>()=>clearHolds(),[]);
 const completionChanged=(noticeID:string,anchor?:HTMLElement)=>{
  actions.completionChanged?.(noticeID,anchor);
  const old=holds.current.get(noticeID);if(old!==undefined)clearTimeout(old);
  holds.current.set(noticeID,setTimeout(()=>{holds.current.delete(noticeID);setHoldRevision(value=>value+1);},reducedMotion?750:1100));
  setHoldRevision(value=>value+1);
 };
 const cardActions:NoticeActions={...actions,completionChanged};
 const exampleStart=rows.findIndex(row=>row.visible&&isExampleNotice(row.record)),exampleCount=records.filter(isExampleNotice).length;
 useEffect(()=>{
  const latest=new Map(allRecords.map(record=>[record.id,record]));
  for(const [id,timer] of holds.current){const record=latest.get(id);if(!record||getNoticeStatus(record)!=='completed'){clearTimeout(timer);holds.current.delete(id);}}
  setRows(previous=>transitionRows(previous.map(row=>({...row,record:latest.get(row.record.id)??row.record})),records,new Set(holds.current.keys())));
 },[records,allRecords,holdRevision,viewKey]);
 useEffect(()=>onEmpty(rows.length===0),[rows.length,onEmpty]);
 return <Stack sx={{overflowX:'clip'}}>{rows.map((row,index)=><Fragment key={row.record.id}>{exampleDivider&&index===exampleStart&&<Divider className="example-group-divider" sx={{mt:1,mb:2,color:'text.secondary',fontSize:'.875rem'}}>{app.modelTestMode?'真实测试结果':'示例通知'} {exampleCount}</Divider>}<NoticeRowTransition visible={row.visible} departure={!liveIDs.has(row.record.id)?'delete':getNoticeStatus(row.record)==='completed'?'complete':'filter'} reduced={reducedMotion} onExited={()=>setRows(old=>old.filter(v=>v.record.id!==row.record.id||current.current.some(n=>n.id===v.record.id)))}>
  <Box data-search-active={row.visible?'true':'false'} data-search-editing={row.record.id===editingID?'true':undefined} sx={{pb:1.5}}><NoticeCard uiPreferences={uiPreferences} notice={row.record} unread={app.unreadNoticeIDs.includes(row.record.id)} app={app} actions={cardActions} now={now} expanded={expandedIDs.has(row.record.id)} onExpandedChange={()=>onExpandedChange(row.record.id)} expandedTaskIDs={expandedTaskIDs} onTaskExpandedChange={onTaskExpandedChange} disabled={!row.visible} editing={row.record.id===editingID} onEditingClose={onEditingClose}/>{query.trim()&&<Box className="search-results-context" data-search-notice-id={row.record.id} sx={{px:2,py:1,mt:-1.5,mb:1.5,border:'1px solid',borderColor:'divider',borderRadius:'0 0 12px 12px',bgcolor:'action.hover'}}>{noticeSearchMatches(row.record,query).map((match,i)=><Box key={i} data-search-task-id={match.path?.startsWith('tasks.')?row.record.tasks[Number(match.path.split('.')[1])]?.id:undefined} sx={{mb:.75}}><Typography component="div" sx={{fontSize:12,color:'text.secondary',fontWeight:700}}>{match.label}</Typography><Typography component="div" data-search-excerpt="true" sx={{fontSize:14,lineHeight:1.65,overflowWrap:'anywhere'}}><HighlightedText text={match.text}/></Typography>{match.label==='原文'&&<Button size="small" onClick={()=>actions.details(row.record)} sx={{p:0,minWidth:0}}>查看原文</Button>}</Box>)}</Box>}</Box>
 </NoticeRowTransition></Fragment>)}</Stack>;
}
export function FeedPage({sampleNudge=false,onSamplesOpened,app,actions,onCompose,onSettings,focusID,onFocusHandled,embedded=false,viewState,onViewStateChange,editingID,onEditingClose,onDownload}:{sampleNudge?:boolean;onSamplesOpened?:()=>void;onDownload?:()=>void;editingID?:string;onEditingClose?:()=>void;app:CampusController;actions:NoticeActions;onCompose:()=>void;onSettings?:()=>void;focusID:string|null;onFocusHandled?:(id:string)=>void;embedded?:boolean;viewState?:FeedViewState;onViewStateChange?:Dispatch<SetStateAction<FeedViewState>>}){
 const {preferences:uiPreferences}=useUiPreferences();
 const [filtersOpen,setFiltersOpen]=useState(false);
 const sampleCue=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!sampleNudge)return;const timer=setTimeout(()=>sampleCue.current?.scrollIntoView({block:'nearest',behavior:'smooth'}),350);return()=>clearTimeout(timer);},[sampleNudge]);
 const [sampleHint]=useState(()=>{try{if(localStorage.getItem('campus-inbox:sample-hint:v223'))return false;localStorage.setItem('campus-inbox:sample-hint:v223','seen');return true;}catch{return false;}});
 const [localView,setLocalView]=useState(createFeedViewState);const [now,setNow]=useState(Date.now());
 const taskCollapseTimers=useRef(new Map<string,ReturnType<typeof setTimeout>>()),latestNotices=useRef(app.notices);latestNotices.current=app.notices;
 const searchResults=useRef<HTMLDivElement>(null);
 const clearTaskCollapse=(id:string)=>{const timer=taskCollapseTimers.current.get(id);if(timer!==undefined)clearTimeout(timer);taskCollapseTimers.current.delete(id);};
 const clearTaskCollapses=()=>{for(const timer of taskCollapseTimers.current.values())clearTimeout(timer);taskCollapseTimers.current.clear();};
 useEffect(()=>{const hidden=()=>{if(document.visibilityState==='hidden')clearTaskCollapses();};window.addEventListener('pagehide',clearTaskCollapses);document.addEventListener('visibilitychange',hidden);return()=>{clearTaskCollapses();window.removeEventListener('pagehide',clearTaskCollapses);document.removeEventListener('visibilitychange',hidden);};},[]);
 const [examplesHidden,setExamplesHidden]=useState(()=>readExamplesHidden(localStorage));
 const readingNotices=useMemo(()=>visibleModelLibrary(app.notices,app.modelTestMode).map(n=>withTeachingCalendar(effectiveNotice(n),app.preferences.weekOneMonday)),[app.notices,app.preferences.weekOneMonday,app.modelTestMode]);
 const allGroups=useMemo(()=>groupExampleNotices(readingNotices),[readingNotices]);
 const catalogExamples=allGroups.examples.filter(n=>!isLocalDemoNotice(n));
 function changeExamplesHidden(hidden:boolean){setExamplesHidden(hidden);try{writeExamplesHidden(localStorage,hidden);}catch{app.report(new Error('示例显示偏好未能保存。'));}}
 async function showCatalogExamples(){setView(previous=>({...previous,tab:0}));try{if(!catalogExamples.length)await app.loadExamples();changeExamplesHidden(false);if(sampleNudge)app.tell('点开示例通知里的「提问」，可以直接看示例回答。');onSamplesOpened?.();}catch(error){app.report(error);}}
 const {tab,query,sort,expandedIDs,expandedTaskIDs,favoritesOnly=false,relevantOnly=false,manualPriorities=[],pastSevenDaysOnly=false}=viewState??localView;const setView=onViewStateChange??setLocalView;
 const setTab=(value:FeedViewState['tab'])=>setView(previous=>({...previous,tab:value}));
 const setQuery=(value:string)=>setView(previous=>({...previous,query:value}));
 const setSort=(value:SortOrder)=>setView(previous=>({...previous,sort:value}));
 const toggleExpanded=(id:string)=>{if(!expandedIDs.has(id))app.markNoticeRead(id);setView(previous=>{const ids=new Set(previous.expandedIDs),tasks=new Set(previous.expandedTaskIDs);if(ids.has(id))ids.delete(id);else{ids.add(id);if(uiPreferences.expandAllDetails&&app.localDataScope!=='guide-practice')for(const task of app.notices.find(n=>n.id===id)?.tasks??[])tasks.add(task.id);}return {...previous,expandedIDs:ids,expandedTaskIDs:tasks};});};
 const toggleTaskExpanded=(id:string)=>{clearTaskCollapse(id);setView(previous=>{const ids=new Set(previous.expandedTaskIDs);if(ids.has(id))ids.delete(id);else ids.add(id);return {...previous,expandedTaskIDs:ids};});};
 const scopeKey=JSON.stringify([app.localDataScope,app.modelTestMode,tab,favoritesOnly,relevantOnly,examplesHidden,manualPriorities.join(','),pastSevenDaysOnly,editingID??'']);
 useEffect(()=>{clearTaskCollapses();},[scopeKey,query]);
 const search=useSearchNavigation(searchResults,query,scopeKey,(noticeID,taskID)=>{app.markNoticeRead(noticeID);setView(previous=>{const expandedIDs=new Set(previous.expandedIDs);expandedIDs.add(noticeID);const expandedTaskIDs=new Set(previous.expandedTaskIDs);if(taskID)expandedTaskIDs.add(taskID);return {...previous,expandedIDs,expandedTaskIDs};});});
 const feedActions:NoticeActions={...actions,taskCompletionChanged:(noticeID,taskID,completed)=>{actions.taskCompletionChanged?.(noticeID,taskID,completed);clearTaskCollapse(taskID);if(!completed)return;taskCollapseTimers.current.set(taskID,setTimeout(()=>{taskCollapseTimers.current.delete(taskID);const currentNotice=latestNotices.current.find(n=>n.id===noticeID);const task=currentNotice?.tasks.find(t=>t.id===taskID);if(!task?.completed||task.dismissed||currentNotice&&getNoticeStatus(currentNotice)==='completed')return;setView(previous=>{if(!previous.expandedTaskIDs.has(taskID))return previous;const ids=new Set(previous.expandedTaskIDs);ids.delete(taskID);return {...previous,expandedTaskIDs:ids};});},950));}};
 const handledFocus=useRef<string|null>(null);
 const focusScroll=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(focusScroll.current!==null)clearTimeout(focusScroll.current);},[]);
 const controls=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!embedded||!controls.current)return;const header=controls.current,view=header.closest<HTMLElement>('.workspace-pane');if(!view)return;const measure=()=>{view.style.scrollPaddingTop=`${Math.ceil(header.getBoundingClientRect().height)+12}px`;};const observer=new ResizeObserver(measure);observer.observe(header);measure();return()=>{observer.disconnect();view.style.scrollPaddingTop='';};},[embedded]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60_000);return()=>clearInterval(timer);},[]);
 // A mixed library keeps its real counts, even when search or a tab currently
 // matches only examples. The example group has a separate visible count.
 const configured=hasProfile(app.preferences.profile),relevant=!!(relevantOnly&&configured);
 const matchesFilters=(n:Notice)=>(!manualPriorities.length||!!n.manualPriority&&manualPriorities.includes(n.manualPriority))&&(!pastSevenDaysOnly||inPastSevenDays(n,now));
 const scoped=readingNotices.filter(n=>(!relevant||matchNoticeProfile(n,app.preferences.profile)!=='unmatched')&&matchesFilters(n));
 const displayed=examplesHidden?scoped.filter(n=>!isExampleNotice(n)||isLocalDemoNotice(n)):scoped;
 const counted=allGroups.personal.length?scoped.filter(n=>!isExampleNotice(n)):displayed;
 const favorites=counted.filter(n=>n.favorite),population=favoritesOnly?favorites:counted;
 const pending=population.filter(n=>getNoticeStatus(n)==='pending');
 const reminders=population.filter(n=>getNoticeStatus(n)==='reminder');
 const complete=population.filter(n=>['completed','dismissed'].includes(getNoticeStatus(n)));
 const records=useMemo(()=>{
  const status=tab===0?'pending':tab===1?'reminder':'completed';const needle=query.trim().toLocaleLowerCase();
  const matching=readingNotices.filter(n=>matchesFilters(n)&&(!relevant||matchNoticeProfile(n,app.preferences.profile)!=='unmatched')&&(!examplesHidden||!isExampleNotice(n)||isLocalDemoNotice(n))&&(!favoritesOnly||n.favorite)&&(status==='completed'?['completed','dismissed'].includes(getNoticeStatus(n)):getNoticeStatus(n)===status)&&(!needle||[n.title,n.summary,n.originalText,n.note,n.deadlineText,...n.materials,...n.warnings,...n.timeline.flatMap(t=>[t.label,t.timeText,t.location]),...n.tasks.flatMap(t=>[t.text,t.assignee,t.condition,t.timeText,t.location,t.note,...t.details,...t.steps.flatMap(s=>[s.text,s.note,...s.details])]),...n.reminders.flatMap(r=>[r.text,r.note])].join('\n').toLocaleLowerCase().includes(needle)));
  const groups=groupExampleNotices(matching);
  return [...sortNotices(groups.personal,sort,now),...sortExampleNotices(groups.examples,sort,now)];
 },[readingNotices,app.preferences.profile,relevant,tab,query,sort,now,favoritesOnly,examplesHidden,manualPriorities.join(','),pastSevenDaysOnly]);
 const customFilters=!!(manualPriorities.length||pastSevenDaysOnly||relevant);
 const [animationEmpty,setAnimationEmpty]=useState(records.length===0);
 useEffect(()=>{
  if(!focusID){handledFocus.current=null;return;}
  if(handledFocus.current===focusID)return;
  const n=app.notices.find(n=>n.id===focusID);if(!n)return;
  // Opening a real reminder must not silently change an explicit hide choice.
  if(examplesHidden&&isExampleNotice(n)&&!isLocalDemoNotice(n)){handledFocus.current=focusID;onFocusHandled?.(focusID);return;}
  handledFocus.current=focusID;
  setTab(getNoticeStatus(n)==='pending'?0:getNoticeStatus(n)==='reminder'?1:2);setQuery('');
  setView(previous=>({...previous,favoritesOnly:false,relevantOnly:false,manualPriorities:[],pastSevenDaysOnly:false,expandedIDs:new Set([...previous.expandedIDs,focusID]),expandedTaskIDs:uiPreferences.expandAllDetails&&app.localDataScope!=='guide-practice'?new Set([...previous.expandedTaskIDs,...n.tasks.map(task=>task.id)]):previous.expandedTaskIDs}));
  // Consume the intent before a resize or manual category change can replay it.
  onFocusHandled?.(focusID);
  if(focusScroll.current!==null)clearTimeout(focusScroll.current);
  focusScroll.current=setTimeout(()=>{focusScroll.current=null;document.getElementById(`notice-${focusID}`)?.scrollIntoView({behavior:'smooth',block:'start'});},150);
 },[focusID,app.notices,onFocusHandled,examplesHidden,uiPreferences.expandAllDetails,app.localDataScope]);
 return <SearchQueryContext.Provider value={query}><Stack spacing={2} className={`page-enter notice-feed${sampleHint?' sample-hint-once':''}`} sx={{maxWidth:760,width:'100%',mx:'auto'}}>
  {app.modelTestMode&&<Paper variant="outlined" sx={{p:1.5,borderColor:'info.main',borderRadius:2}}><Stack direction="row" sx={{alignItems:'center',gap:1}}><Box sx={{flex:1}}><Typography sx={{fontSize:15,fontWeight:700}}>真实测试结果</Typography><Typography sx={{fontSize:13,color:'text.secondary'}}>模型原始整理，未人工润色。{app.modelTestFailureCount>0?`另有 ${app.modelTestFailureCount} 次格式未通过，未导入。`:null}</Typography></Box><Button size="small" onClick={()=>app.setModelTestMode(false)}>返回示例</Button></Stack></Paper>}
  <Box data-first-entry="feed-tools" ref={controls} className="feed-controls" sx={{position:embedded?'sticky':'static',top:0,zIndex:3,bgcolor:'background.default',pb:embedded?1.5:0}}>
  {!embedded&&<Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:2}}>
   <Typography component="h1" sx={{fontSize:30,fontWeight:780,lineHeight:1.3}}>通知</Typography>
  </Stack>}
  <Tabs value={tab} onChange={(_,value)=>setTab(value)} variant="fullWidth" aria-label="通知分类" sx={{borderBottom:'1px solid',borderColor:'divider',mt:embedded?0:1.5,'& .MuiTab-root':{fontSize:{xs:app.platform.kind==='browser'?14:16,sm:16},fontWeight:700},'& .MuiTabs-indicator':{bgcolor:tab===1?'secondary.main':tab===2?'success.main':'primary.main'}}}>
   <Tab label={`待办 ${pending.length}`}/><Tab label={`提醒 ${reminders.length}`} sx={{'&.Mui-selected':{color:'secondary.main'}}}/><Tab label={`已完成 ${complete.length}`} sx={{'&.Mui-selected':{color:'success.main'}}}/>
  </Tabs>
  </Box>
  <Box data-first-entry="feed-tools" className="feed-filters">
  <Stack direction="row" sx={{gap:1,mt:1.5,alignItems:'center'}}>
   <TextField placeholder="搜索" value={query} onChange={e=>setQuery(e.target.value)} size="small" sx={{flex:1,minWidth:0,'& .MuiOutlinedInput-root':{borderRadius:'11px',minHeight:44,fontSize:16}}} slotProps={{htmlInput:{'aria-label':'搜索通知'},input:{endAdornment:query?<InputAdornment position="end"><IconButton aria-label="清除搜索" onClick={()=>setQuery('')}><Close fontSize="small"/></IconButton></InputAdornment>:undefined}}}/>
   <Tooltip title="筛选"><IconButton aria-label="筛选通知" onClick={()=>setFiltersOpen(true)} sx={{width:44,height:44,border:'1px solid',borderColor:'divider',borderRadius:'11px',color:favoritesOnly||relevant||manualPriorities.length>0||pastSevenDaysOnly||sort!=='priority'?'primary.main':'text.secondary',bgcolor:favoritesOnly||relevant||manualPriorities.length>0||pastSevenDaysOnly||sort!=='priority'?'action.selected':undefined}}><FilterAltOutlined/></IconButton></Tooltip>
  </Stack>
  {(favoritesOnly||relevant||manualPriorities.length>0||pastSevenDaysOnly||sort!=='priority')&&<Stack className="active-feed-filters" direction="row" sx={{gap:.75,mt:1,flexWrap:'wrap'}}>
   {manualPriorities.map(value=><Chip key={value} label={priorityOptions.find(p=>p.value===value)?.label} size="small" onDelete={()=>setView(previous=>({...previous,manualPriorities:(previous.manualPriorities??[]).filter(v=>v!==value)}))}/>)}
   {pastSevenDaysOnly&&<Chip label="过去 7 天" size="small" onDelete={()=>setView(previous=>({...previous,pastSevenDaysOnly:false}))}/>}
   {favoritesOnly&&<Chip label="收藏" size="small" onDelete={()=>setView(previous=>({...previous,favoritesOnly:false}))}/>}
   {relevant&&<Chip label="与我相关" size="small" onDelete={()=>setView(previous=>({...previous,relevantOnly:false}))}/>}
   {sort!=='priority'&&<Chip label={sort==='newest'?'最近添加':'截止时间'} size="small" onDelete={()=>setSort('priority')}/>}
  </Stack>}
  {!!query.trim()&&<Stack direction="row" className="search-navigation" sx={{alignItems:'center',justifyContent:'flex-end',gap:.25,mt:.5}}><Typography role="status" aria-live="polite" aria-label={`匹配位置 ${search.current}/${search.total}`} sx={{fontSize:13,color:'text.secondary',fontVariantNumeric:'tabular-nums',minWidth:36,textAlign:'center'}}>{search.current}/{search.total}</Typography><Tooltip title="上一处"><span><IconButton aria-label="上一处匹配" disabled={!search.total||!!editingID} onClick={search.previous} sx={{width:40,height:40}}><NavigateBefore/></IconButton></span></Tooltip><Tooltip title="下一处"><span><IconButton aria-label="下一处匹配" disabled={!search.total||!!editingID} onClick={search.next} sx={{width:40,height:40}}><NavigateNext/></IconButton></span></Tooltip></Stack>}
  <Dialog open={filtersOpen} onClose={()=>setFiltersOpen(false)} fullWidth maxWidth="xs"><DialogTitle>筛选<IconButton aria-label="关闭筛选" onClick={()=>setFiltersOpen(false)} sx={{position:'absolute',right:12,top:12}}><Close/></IconButton></DialogTitle><DialogContent><Stack spacing={1}>
   <Typography sx={{fontWeight:750,fontSize:16,pt:1}}>优先级</Typography>
   <Stack direction="row" sx={{gap:1,flexWrap:'wrap'}}>{priorityOptions.map(option=><Chip key={option.value} label={option.label} color={option.color} variant={manualPriorities.includes(option.value)?'filled':'outlined'} aria-pressed={manualPriorities.includes(option.value)} onClick={()=>setView(previous=>{const selected=previous.manualPriorities??[];return {...previous,manualPriorities:selected.includes(option.value)?selected.filter(v=>v!==option.value):[...selected,option.value]};})}/>)}</Stack>
   <FormControlLabel control={<Checkbox checked={pastSevenDaysOnly} onChange={e=>setView(previous=>({...previous,pastSevenDaysOnly:e.target.checked}))}/>} label="过去 7 天（含今天）"/>
   <Divider/>
   <FormControlLabel control={<Checkbox checked={favoritesOnly} onChange={e=>setView(previous=>({...previous,favoritesOnly:e.target.checked}))}/>} label="只看收藏"/>
   <FormControlLabel control={<Checkbox checked={relevant} disabled={!configured} onChange={e=>setView(previous=>({...previous,relevantOnly:e.target.checked}))}/>} label="与我相关"/>
   {onSettings&&<Button size="small" startIcon={<PersonOutline/>} sx={{alignSelf:'flex-start'}} onClick={()=>{setFiltersOpen(false);onSettings();}}>{configured?'修改筛选条件':'设置年级、专业'}</Button>}
   <TextField select label="排序" value={sort} onChange={e=>setSort(e.target.value as SortOrder)} size="small" fullWidth><MenuItem value="priority">默认排序</MenuItem><MenuItem value="deadline">截止时间</MenuItem><MenuItem value="newest">最近添加</MenuItem></TextField>
  </Stack></DialogContent><DialogActions><Button variant="contained" onClick={()=>setFiltersOpen(false)}>完成</Button></DialogActions></Dialog>
  </Box>
  <Box data-first-entry="feed-results" ref={searchResults} className="search-result-list" sx={{'& mark[data-search-current="true"]':{bgcolor:'primary.main',color:'primary.contrastText',outline:'2px solid',outlineColor:'primary.main',outlineOffset:2,borderRadius:.5}}}><AnimatedNotices query={query} editingID={editingID} onEditingClose={onEditingClose} key={`${app.localDataScope}:${app.modelTestMode?'model-test':'normal'}:${tab}`} records={records} allRecords={readingNotices} viewKey={`${scopeKey}:${query}:${sort}`} exampleDivider={!!allGroups.personal.length} app={app} actions={feedActions} now={now} expandedIDs={expandedIDs} onExpandedChange={toggleExpanded} expandedTaskIDs={expandedTaskIDs} onTaskExpandedChange={toggleTaskExpanded} onEmpty={setAnimationEmpty} uiPreferences={uiPreferences}/></Box>
  {!records.length&&animationEmpty&&<Paper data-first-entry="feed-results" variant="outlined" sx={{p:4,textAlign:'center'}}><Box sx={{mb:1}}><InboxCharm size={64}/></Box><Typography variant="h6">{query?'没有找到匹配的通知':customFilters?'没有符合筛选的通知':favoritesOnly?'此分类还没有收藏':tab===0?'暂时没有待办':tab===1?'暂时没有提醒':'还没有完成的通知'}</Typography><Typography color="text.secondary" sx={{mt:1,mb:2}}>{query?'换一个关键词试试。':customFilters?'换个筛选条件试试。':favoritesOnly?'点通知右上角的星星即可收藏。':'添加通知，或者看看示例。'}</Typography>{customFilters&&<Button variant="contained" onClick={()=>setView(previous=>({...previous,manualPriorities:[],pastSevenDaysOnly:false,relevantOnly:false}))}>清除筛选</Button>}{favoritesOnly&&<Button onClick={()=>setView(previous=>({...previous,favoritesOnly:false}))}>显示全部通知</Button>}{!query&&!favoritesOnly&&!customFilters&&<Stack direction="row" sx={{justifyContent:"center",flexWrap:'wrap',gap:1}}><Button variant="contained" onClick={onCompose}>添加</Button>{!app.modelTestMode&&<Button variant="contained" color="secondary" className="sample-entry" onClick={()=>void showCatalogExamples()}>显示示例</Button>}</Stack>}</Paper>}
  {!app.modelTestMode&&!!records.length&&<Stack data-first-entry="feed-results" className="example-visibility-controls" sx={{alignItems:'center',gap:1,py:1}}><Button ref={sampleCue} data-practice-nudge={sampleNudge?"true":undefined} className="sample-entry" aria-label={catalogExamples.length&&!examplesHidden?'隐藏全部示例':'显示全部示例'} startIcon={catalogExamples.length&&!examplesHidden?<VisibilityOff/>:<Visibility/>} variant="contained" color="secondary" onClick={()=>catalogExamples.length&&!examplesHidden?changeExamplesHidden(true):void showCatalogExamples()}>{catalogExamples.length&&!examplesHidden?'隐藏示例':'显示示例'}</Button>{catalogExamples.length>0&&!examplesHidden&&app.remainingExamples!==0&&<Button className="load-more-examples" variant="outlined" startIcon={<Add/>} onClick={()=>void app.loadExamples().catch(app.report)} sx={{minHeight:44,px:2.5,fontWeight:700,bgcolor:'background.paper',borderWidth:1.5}}>再添加 {Math.min(7,app.remainingExamples??7)} 条示例</Button>}</Stack>}
  {!!records.length&&<Stack data-first-entry="feed-results" className="feed-end" direction="row" sx={{alignItems:'center',justifyContent:'center',gap:1,py:1,color:'text.secondary'}}><InboxCharm size={46}/><Typography sx={{fontSize:13}}>看到这里啦</Typography></Stack>}
  <Box data-first-entry="feed-results" component="footer" className="product-footer" sx={{pt:3,pb:1.5,textAlign:'center'}}>
   <Box aria-hidden sx={{width:32,borderTop:'1px solid',borderColor:'divider',mx:'auto',mb:1.5}}/>
   <Typography color="text.secondary" sx={{fontSize:12.5,lineHeight:1.8,letterSpacing:'.01em'}}>内容由 AI 生成，请注意甄别。</Typography>
   <Typography color="text.secondary" sx={{fontSize:12,fontWeight:500,lineHeight:1.8,mt:.25}}>Kemou 制作</Typography>
   <Stack direction="row" sx={{alignItems:'center',justifyContent:'center',gap:.5,mt:.5,flexWrap:'wrap'}}><Button component="a" href="https://github.com/Kemou2333/note-inbox" target="_blank" rel="noopener noreferrer" size="small" startIcon={<GitHub sx={{fontSize:15}}/>} sx={{fontSize:12.5,color:'text.secondary',minHeight:36}}>GitHub 仓库</Button>{app.platform.kind!=='android'&&onDownload&&<Button size="small" startIcon={<DownloadOutlined sx={{fontSize:15}}/>} onClick={onDownload} sx={{fontSize:12.5,minHeight:36}}>安卓版</Button>}</Stack>
  </Box>
  <ScrollBoundaryCue anchor={searchResults}/>
  <BackToTop anchorRef={searchResults} focusRef={controls} embedded={embedded} scopeKey={scopeKey}/>
 </Stack></SearchQueryContext.Provider>;
}
