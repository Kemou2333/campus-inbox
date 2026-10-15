import {Fragment,useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import {Badge,Box,Button,Collapse,Divider,InputAdornment,MenuItem,Paper,Stack,Tab,Tabs,TextField,Tooltip,Typography,useMediaQuery} from '@mui/material';
import PersonOutline from '@mui/icons-material/PersonOutlineOutlined';
import {hasProfile,matchNoticeProfile} from '../../domain/campus-preferences';
import {withTeachingCalendar} from '../../domain/teaching-calendar';
import Star from '@mui/icons-material/Star';
import StarBorder from '@mui/icons-material/StarBorder';
import {alpha} from '@mui/material/styles';
import Close from '@mui/icons-material/Close';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {IconButton} from '@mui/material';
import {getNoticeStatus,sortNotices} from '../../domain/notice';
import type {Notice,SortOrder} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {NoticeCard,type NoticeActions} from './NoticeCard';
import {transitionRows} from './transition-rows';
import {effectiveNotice} from '../../domain/corrections';
import {groupExampleNotices,isExampleNotice,readExamplesHidden,writeExamplesHidden} from '../../domain/examples';

export interface FeedViewState {tab:0|1|2;query:string;sort:SortOrder;expandedIDs:Set<string>;expandedTaskIDs:Set<string>;favoritesOnly?:boolean;relevantOnly?:boolean}
export const createFeedViewState=():FeedViewState=>({tab:0,query:'',sort:'priority',expandedIDs:new Set(),expandedTaskIDs:new Set(),favoritesOnly:false,relevantOnly:false});

function AnimatedNotices({records,exampleDivider=false,app,actions,now,expandedIDs,onExpandedChange,expandedTaskIDs,onTaskExpandedChange,onEmpty}:{records:Notice[];exampleDivider?:boolean;app:CampusController;actions:NoticeActions;now:number;expandedIDs:Set<string>;onExpandedChange:(id:string)=>void;expandedTaskIDs:Set<string>;onTaskExpandedChange:(id:string)=>void;onEmpty:(empty:boolean)=>void}){
 const [rows,setRows]=useState(()=>records.map(record=>({record,visible:true})));
 const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const current=useRef(records);current.current=records;
 const exampleStart=rows.findIndex(row=>row.visible&&isExampleNotice(row.record)),exampleCount=records.filter(isExampleNotice).length;
 useEffect(()=>setRows(previous=>transitionRows(previous,records)),[records]);
 useEffect(()=>onEmpty(rows.length===0),[rows.length,onEmpty]);
 return <Stack>{rows.map((row,index)=><Fragment key={row.record.id}>{exampleDivider&&index===exampleStart&&<Divider className="example-group-divider" sx={{mt:1,mb:2,color:'text.secondary',fontSize:'.875rem'}}>示例通知 {exampleCount}</Divider>}<Collapse in={row.visible} timeout={reducedMotion?0:260} onExited={()=>setRows(old=>old.filter(v=>v.record.id!==row.record.id||current.current.some(n=>n.id===v.record.id)))}>
  <Box sx={{pb:1.5,opacity:row.visible?1:0,transform:row.visible?'none':'translateX(8px)',transition:reducedMotion?'none':'opacity 160ms ease-out, transform 200ms cubic-bezier(.2,0,0,1)'}}><NoticeCard notice={row.record} app={app} actions={actions} now={now} expanded={expandedIDs.has(row.record.id)} onExpandedChange={()=>onExpandedChange(row.record.id)} expandedTaskIDs={expandedTaskIDs} onTaskExpandedChange={onTaskExpandedChange} disabled={!row.visible}/></Box>
 </Collapse></Fragment>)}</Stack>;
}
export function FeedPage({app,actions,onCompose,onSettings,focusID,onFocusHandled,embedded=false,viewState,onViewStateChange}:{app:CampusController;actions:NoticeActions;onCompose:()=>void;onSettings?:()=>void;focusID:string|null;onFocusHandled?:(id:string)=>void;embedded?:boolean;viewState?:FeedViewState;onViewStateChange?:Dispatch<SetStateAction<FeedViewState>>}){
 const [localView,setLocalView]=useState(createFeedViewState);const [now,setNow]=useState(Date.now());
 const [examplesHidden,setExamplesHidden]=useState(()=>readExamplesHidden(localStorage));
 const readingNotices=useMemo(()=>app.notices.map(n=>withTeachingCalendar(effectiveNotice(n),app.preferences.weekOneMonday)),[app.notices,app.preferences.weekOneMonday]);
 const allGroups=useMemo(()=>groupExampleNotices(readingNotices),[readingNotices]);
 function changeExamplesHidden(hidden:boolean){setExamplesHidden(hidden);try{writeExamplesHidden(localStorage,hidden);}catch{app.report(new Error('示例显示偏好未能保存。'));}}
 const {tab,query,sort,expandedIDs,expandedTaskIDs,favoritesOnly=false,relevantOnly=false}=viewState??localView;const setView=onViewStateChange??setLocalView;
 const setTab=(value:FeedViewState['tab'])=>setView(previous=>({...previous,tab:value}));
 const setQuery=(value:string)=>setView(previous=>({...previous,query:value}));
 const setSort=(value:SortOrder)=>setView(previous=>({...previous,sort:value}));
 const toggleExpanded=(id:string)=>setView(previous=>{const ids=new Set(previous.expandedIDs);if(ids.has(id))ids.delete(id);else ids.add(id);return {...previous,expandedIDs:ids};});
 const toggleTaskExpanded=(id:string)=>setView(previous=>{const ids=new Set(previous.expandedTaskIDs);if(ids.has(id))ids.delete(id);else ids.add(id);return {...previous,expandedTaskIDs:ids};});
 const handledFocus=useRef<string|null>(null);
 const focusScroll=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(focusScroll.current!==null)clearTimeout(focusScroll.current);},[]);
 const controls=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!embedded||!controls.current)return;const header=controls.current,view=header.closest<HTMLElement>('.workspace-pane');if(!view)return;const measure=()=>{view.style.scrollPaddingTop=`${Math.ceil(header.getBoundingClientRect().height)+12}px`;};const observer=new ResizeObserver(measure);observer.observe(header);measure();return()=>{observer.disconnect();view.style.scrollPaddingTop='';};},[embedded]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60_000);return()=>clearInterval(timer);},[]);
 // A mixed library keeps its real counts, even when search or a tab currently
 // matches only examples. The example group has a separate visible count.
 const configured=hasProfile(app.preferences.profile),relevant=!!(relevantOnly&&configured);
 const scoped=readingNotices.filter(n=>!relevant||matchNoticeProfile(n,app.preferences.profile)!=='unmatched');
 const displayed=examplesHidden?scoped.filter(n=>!isExampleNotice(n)):scoped;
 const counted=allGroups.personal.length?scoped.filter(n=>!isExampleNotice(n)):displayed;
 const favorites=counted.filter(n=>n.favorite),population=favoritesOnly?favorites:counted;
 const pending=population.filter(n=>getNoticeStatus(n)==='pending');
 const reminders=population.filter(n=>getNoticeStatus(n)==='reminder');
 const complete=population.filter(n=>['completed','dismissed'].includes(getNoticeStatus(n)));
 const records=useMemo(()=>{
  const status=tab===0?'pending':tab===1?'reminder':'completed';const needle=query.trim().toLocaleLowerCase();
  const matching=readingNotices.filter(n=>(!relevant||matchNoticeProfile(n,app.preferences.profile)!=='unmatched')&&(!examplesHidden||!isExampleNotice(n))&&(!favoritesOnly||n.favorite)&&(status==='completed'?['completed','dismissed'].includes(getNoticeStatus(n)):getNoticeStatus(n)===status)&&(!needle||[n.title,n.summary,n.originalText,n.note,n.deadlineText,...n.materials,...n.warnings,...n.timeline.flatMap(t=>[t.label,t.timeText,t.location]),...n.tasks.flatMap(t=>[t.text,t.assignee,t.condition,t.timeText,t.location,t.note,...t.details,...t.steps.flatMap(s=>[s.text,s.note,...s.details])]),...n.reminders.flatMap(r=>[r.text,r.note])].join('\n').toLocaleLowerCase().includes(needle)));
  const groups=groupExampleNotices(matching);
  return [...sortNotices(groups.personal,sort,now),...sortNotices(groups.examples,sort,now)];
 },[readingNotices,app.preferences.profile,relevant,tab,query,sort,now,favoritesOnly,examplesHidden]);
 const [animationEmpty,setAnimationEmpty]=useState(records.length===0);
 useEffect(()=>{
  if(!focusID){handledFocus.current=null;return;}
  if(handledFocus.current===focusID)return;
  const n=app.notices.find(n=>n.id===focusID);if(!n)return;
  // Opening a real reminder must not silently change an explicit hide choice.
  if(examplesHidden&&isExampleNotice(n)){handledFocus.current=focusID;onFocusHandled?.(focusID);return;}
  handledFocus.current=focusID;
  setTab(getNoticeStatus(n)==='pending'?0:getNoticeStatus(n)==='reminder'?1:2);setQuery('');
  setView(previous=>({...previous,favoritesOnly:false,relevantOnly:false,expandedIDs:new Set([...previous.expandedIDs,focusID])}));
  // Consume the intent before a resize or manual category change can replay it.
  onFocusHandled?.(focusID);
  if(focusScroll.current!==null)clearTimeout(focusScroll.current);
  focusScroll.current=setTimeout(()=>{focusScroll.current=null;document.getElementById(`notice-${focusID}`)?.scrollIntoView({behavior:'smooth',block:'start'});},150);
 },[focusID,app.notices,onFocusHandled,examplesHidden]);
 return <Stack spacing={2} className="page-enter notice-feed" sx={{maxWidth:760,width:'100%',mx:'auto'}}>
  <Box ref={controls} className="feed-controls" sx={{position:embedded?'sticky':'static',top:0,zIndex:3,bgcolor:'background.default',pb:embedded?1.5:0}}>
  {!embedded&&<Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:2}}>
   <Typography variant="h4" component="h1">通知</Typography>
   <Button variant="contained" onClick={onCompose} sx={{flexShrink:0}}>新增</Button>
  </Stack>}
  <Tabs value={tab} onChange={(_,value)=>setTab(value)} variant="fullWidth" aria-label="通知分类" sx={{borderBottom:'1px solid',borderColor:'divider',mt:embedded?0:1.5,'& .MuiTabs-indicator':{bgcolor:tab===1?'secondary.main':tab===2?'success.main':'primary.main'}}}>
   <Tab label={`待办 ${pending.length}`}/><Tab label={`提醒 ${reminders.length}`} sx={{'&.Mui-selected':{color:'secondary.main'}}}/><Tab label={`已完成 ${complete.length}`} sx={{'&.Mui-selected':{color:'success.main'}}}/>
  </Tabs>
  <Stack direction="row" sx={{gap:1,mt:1.5}}>
   <TextField placeholder="搜索" value={query} onChange={e=>setQuery(e.target.value)} size="small" slotProps={{htmlInput:{'aria-label':'搜索通知'},input:{endAdornment:query?<InputAdornment position="end"><IconButton aria-label="清除搜索" onClick={()=>setQuery('')}><Close fontSize="small"/></IconButton></InputAdornment>:undefined}}}/>
   <Tooltip title={favoritesOnly?'显示全部通知':'只看收藏'}><IconButton aria-label="只看收藏" aria-pressed={favoritesOnly} onClick={()=>setView(previous=>({...previous,favoritesOnly:!previous.favoritesOnly}))} sx={{color:favoritesOnly?'warning.main':'text.secondary',bgcolor:favoritesOnly?theme=>alpha(theme.palette.warning.main,.1):undefined}}><Badge color="warning" badgeContent={favorites.length} max={99}>{favoritesOnly?<Star/>:<StarBorder/>}</Badge></IconButton></Tooltip>
   <TextField select value={sort} onChange={e=>setSort(e.target.value as SortOrder)} size="small" sx={{width:{xs:110,sm:140},flexShrink:0}} aria-label="通知排序"><MenuItem value="priority">优先级</MenuItem><MenuItem value="deadline">截止时间</MenuItem><MenuItem value="newest">最近添加</MenuItem></TextField>
  </Stack>
  <Stack className="profile-filter-controls" direction="row" sx={{alignItems:'center',gap:1,mt:.5}}>
   <Tooltip title={configured?'只隐藏明确不符合条件的通知':'填写年级、专业和身份'}><span><Button size="small" startIcon={<PersonOutline/>} aria-pressed={relevant} disabled={!configured&&!onSettings} variant={relevant?'contained':'text'} onClick={()=>configured?setView(previous=>({...previous,relevantOnly:!previous.relevantOnly})):onSettings?.()} sx={{fontSize:13,px:1}}>{configured?'与我相关':'设置条件'}</Button></span></Tooltip>
   {relevant&&<Typography variant="caption" color="text.secondary">未确定的仍保留</Typography>}
  </Stack>
  {!!allGroups.examples.length&&<Stack className="example-visibility-controls" direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:1,mt:.5}}>
   <Typography className="example-privacy-note" variant="body2" color="text.secondary" sx={{lineHeight:1.6}}>{examplesHidden?`已隐藏 ${allGroups.examples.length} 条示例`:'示例通知已隐藏个人信息'}</Typography>
   <Tooltip title={examplesHidden?'显示全部示例':'隐藏全部示例'}><IconButton aria-label={examplesHidden?'显示全部示例':'隐藏全部示例'} aria-pressed={examplesHidden} onClick={()=>changeExamplesHidden(!examplesHidden)}>{examplesHidden?<Visibility/>:<VisibilityOff/>}</IconButton></Tooltip>
  </Stack>}
  </Box>
  <AnimatedNotices key={tab} records={records} exampleDivider={!!allGroups.personal.length} app={app} actions={actions} now={now} expandedIDs={expandedIDs} onExpandedChange={toggleExpanded} expandedTaskIDs={expandedTaskIDs} onTaskExpandedChange={toggleTaskExpanded} onEmpty={setAnimationEmpty}/>
  {!records.length&&animationEmpty&&<Paper variant="outlined" sx={{p:4,textAlign:'center'}}><Typography variant="h6">{query?'没有找到匹配的通知':favoritesOnly?'此分类还没有收藏':tab===0?'暂时没有待办':tab===1?'暂时没有提醒':'还没有完成的通知'}</Typography><Typography color="text.secondary" sx={{mt:1,mb:2}}>{query?'换一个关键词试试。':favoritesOnly?'点通知右上角的星星即可收藏。':'添加通知，或者看看示例。'}</Typography>{favoritesOnly&&<Button onClick={()=>setView(previous=>({...previous,favoritesOnly:false}))}>显示全部通知</Button>}{!query&&!favoritesOnly&&<Stack direction="row" sx={{justifyContent:"center",flexWrap:'wrap',gap:1}}><Button variant="contained" onClick={onCompose}>新增通知</Button>{examplesHidden&&allGroups.examples.length?<Button variant="outlined" onClick={()=>changeExamplesHidden(false)}>显示示例</Button>:<Button variant="outlined" onClick={()=>void app.loadExamples().catch(app.report)}>载入示例</Button>}</Stack>}</Paper>}
  <Box component="footer" className="product-footer" sx={{py:2,borderTop:'1px solid',borderColor:'divider'}}>
   <Typography variant="body2" color="text.secondary">内容由 AI 生成，请注意甄别。</Typography>
   <Typography variant="body2" color="text.secondary" sx={{mt:.5}}>Kemou 制作</Typography>
  </Box>
 </Stack>;
}
