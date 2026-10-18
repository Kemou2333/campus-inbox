import {useRef,useState} from 'react';
import {Box,Button,Chip,Collapse,IconButton,Menu,MenuItem,Paper,Stack,Tooltip,Typography,useMediaQuery} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import Check from '@mui/icons-material/Check';
import Undo from '@mui/icons-material/Undo';
import MoreHoriz from '@mui/icons-material/MoreHoriz';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Schedule from '@mui/icons-material/Schedule';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import PeopleOutlined from '@mui/icons-material/PeopleOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import Star from '@mui/icons-material/Star';
import StarBorder from '@mui/icons-material/StarBorder';
import Block from '@mui/icons-material/Block';
import CheckCircle from '@mui/icons-material/CheckCircle';
import NotificationsNone from '@mui/icons-material/NotificationsNone';
import ChatBubbleOutline from '@mui/icons-material/ChatBubbleOutlineOutlined';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import {alpha} from '@mui/material/styles';
import {getNoticeStatus,priority,setFavorite,setNoticeApplicable,setNoticeCompleted} from '../../domain/notice';
import type {Notice,NoteTarget,Task} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {RichText} from '../../shared/ui/RichText';
import {plainReadingText} from '../../domain/reading';
import {headlineTime,noticeOverview,summaryPreview} from './notice-overview';
import {NoticeDetailContent} from './NoticeDetailContent';
import {CorrectionProvider,CorrectionTarget} from './CorrectionTarget';
import {restoreAIContent} from '../../domain/corrections';
import {HighlightedText} from '../../shared/ui/SearchHighlight';

export interface NoticeActions {
 note:(notice:Notice,target:NoteTarget,title:string,text:string)=>void;
 details:(notice:Notice)=>void;
 calendar:(notice:Notice,task?:Task)=>void;
 evidence:(notice:Notice,path:string)=>void;
 correct:(notice:Notice,path?:string)=>void;
 share?:(notice:Notice)=>void;
 question?:(notice:Notice)=>void;
 taskCompletionChanged?:(noticeID:string,taskID:string,completed:boolean)=>void;
}
export type NoticeCardController={act:(...args:Parameters<CampusController['act']>)=>ReturnType<CampusController['act']>|void;remove:CampusController['remove']};
export function NoticeCard({notice:n,app,actions,now,expanded:providedExpanded,onExpandedChange,expandedTaskIDs,onTaskExpandedChange,disabled=false,readOnly=false,editing=false,onEditingClose,unread=false}:{notice:Notice;app:NoticeCardController;actions:NoticeActions;now:number;expanded:boolean;onExpandedChange:()=>void;expandedTaskIDs:Set<string>;onTaskExpandedChange:(id:string)=>void;disabled?:boolean;readOnly?:boolean;editing?:boolean;onEditingClose?:()=>void;unread?:boolean}){
 const expanded=editing||providedExpanded;
 const status=getNoticeStatus(n),p=priority(n,now),done=status==='completed'||status==='dismissed';
 const overview=noticeOverview(n),preview=summaryPreview(n),reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const expandButton=useRef<HTMLButtonElement>(null),bodyID=`notice-body-${n.id}`;
 const [menu,setMenu]=useState<HTMLElement|null>(null);
 const summary=plainReadingText(preview.text).trim(),showSummary=!!summary&&summary!==plainReadingText(n.title).trim();
 const audience=overview.audiences.length===1&&Array.from(overview.audiences[0]).length<=28?overview.audiences[0]:overview.audiences.length>1?String(overview.audiences.length):'按条件';
 const time=overview.times[0]??'',deadline=!!(n.localDeadline||n.deadlineText||n.deadline),tone=done?'success':p.level==='overdue'?'error':p.label?'warning':'info';
 const accent=status==='completed'?'success':status==='dismissed'?null:p.level==='overdue'?'error':n.kind==='task'?'primary':'secondary';
 function closeFromBottom(){onExpandedChange();requestAnimationFrame(()=>{expandButton.current?.focus({preventScroll:true});document.getElementById(`notice-${n.id}`)?.scrollIntoView({block:'start',behavior:reducedMotion?'instant':'smooth'});});}
 function secondary(action:()=>void){setMenu(null);action();}
 return <CorrectionProvider value={{editing:editing&&!readOnly,onEdit:path=>actions.correct(n,path)}}><Paper component="article" variant="outlined" id={`notice-${n.id}`} className="notice-card" inert={disabled||undefined} aria-labelledby={`notice-heading-${n.id}`} sx={{p:{xs:2,sm:2.5},borderRadius:'16px',borderColor:'divider',borderInlineStartWidth:3,borderInlineStartColor:accent?`${accent}.main`:'divider',pointerEvents:disabled?'none':undefined}}>
  {editing&&<Stack direction="row" sx={{alignItems:'center',gap:1,mb:1.5,p:1,borderRadius:1,bgcolor:theme=>alpha(theme.palette.primary.main,.09)}}><Typography sx={{flex:1,fontSize:14,fontWeight:600,color:'primary.main'}}>点文字修改</Typography>{!!n.corrections?.values.length&&<Button size="small" color="warning" onClick={()=>app.act(n.id,current=>{if(current.updatedAt!==n.updatedAt)throw new Error('通知已更新，请重新进入修正。');return restoreAIContent(current);},'已恢复初稿')}>恢复初稿</Button>}<Button size="small" variant="contained" onClick={onEditingClose}>完成</Button></Stack>}
  <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:1,mb:1}}>
   <Stack direction="row" sx={{alignItems:'center',gap:1}}>{unread&&!readOnly&&<Box component="span" role="img" aria-label="未读通知" title="未读" sx={{width:9,height:9,borderRadius:'50%',bgcolor:'info.main',flexShrink:0}}/>}<Chip size="small" icon={status==='completed'?<CheckCircle/>:n.kind!=='task'?<NotificationsNone/>:undefined} label={p.label&&!done?p.label:done?(status==='dismissed'?'不适用':'已完成'):n.kind==='task'?'待办':'提醒'} color={status==='completed'?'success':done?'default':p.label?(p.level==='overdue'?'error':'warning'):n.kind==='task'?'primary':'secondary'} variant={status==='completed'||p.label&&!done?'filled':'outlined'}/></Stack>
   <Stack direction="row" sx={{alignItems:'center',gap:.5}}>{readOnly?n.favorite&&<Star aria-label="已收藏" sx={{color:'warning.main',fontSize:25}}/>:<Tooltip title={n.favorite?'取消收藏':'收藏通知'}><IconButton className="notice-favorite" aria-label={n.favorite?'取消收藏通知':'收藏通知'} aria-pressed={!!n.favorite} disabled={disabled||editing} onClick={()=>app.act(n.id,v=>setFavorite(v,!v.favorite),n.favorite?'已取消收藏':'已收藏')} sx={{color:n.favorite?'warning.main':'text.secondary','& .MuiSvgIcon-root':{fontSize:27},bgcolor:n.favorite?theme=>alpha(theme.palette.warning.main,.09):undefined}}>{n.favorite?<Star/>:<StarBorder/>}</IconButton></Tooltip>}{overview.notes&&<Tooltip title="已有笔记"><EditNote aria-label="已有笔记" sx={{fontSize:20,color:'primary.main'}}/></Tooltip>}{overview.total>0&&<Typography variant="body2" color={overview.completed?'success.main':'text.secondary'} sx={{fontVariantNumeric:'tabular-nums',fontWeight:overview.completed?700:400}} aria-label={`已完成${overview.completed}项任务，共${overview.total}项任务`}>{overview.completed}/{overview.total}</Typography>}</Stack>
  </Stack>
  <Typography component="h2" id={`notice-heading-${n.id}`} sx={{m:0,fontSize:{xs:28,sm:32},fontWeight:700,lineHeight:1.3,textWrap:'pretty',overflowWrap:'anywhere'}}><CorrectionTarget inline path="title" label="标题"><HighlightedText text={n.title}/></CorrectionTarget></Typography>
  {(showSummary||editing)&&<Typography component="div" className="notice-summary" color="text.secondary" sx={{mt:1,fontSize:16,lineHeight:1.65}}><CorrectionTarget path="summary" label="简介"><RichText text={editing?n.summary:preview.text}/></CorrectionTarget></Typography>}
  {editing&&<Box sx={{mt:1.25,fontSize:15,color:'info.main'}}><CorrectionTarget path="deadlineText" label="截止描述">{n.deadlineText||'添加截止描述'}</CorrectionTarget></Box>}
  {!editing&&<Stack direction="row" className="notice-meta" sx={{mt:1.25,gap:.75,flexWrap:'wrap',alignItems:'flex-start'}}>
   {!!overview.audiences.length&&<Chip className="notice-audience-preview" icon={<PeopleOutlined/>} size="small" label={<HighlightedText text={audience}/>} title={overview.audiences.length===1?overview.audiences[0]:`${overview.audiences.length}类适用对象`} color="warning" variant="outlined" sx={{maxWidth:'100%',minWidth:0,height:'auto',minHeight:28,fontSize:14,'& .MuiChip-label':{fontSize:14,lineHeight:1.5,whiteSpace:'normal',overflowWrap:'anywhere',py:.5},'& .MuiChip-icon':{fontSize:18,alignSelf:'flex-start',mt:.5}}}/>}
   {!!time&&<Chip className="notice-time-preview" icon={<Schedule/>} size="small" label={<HighlightedText text={`${deadline?'截止 ':''}${headlineTime(time)}`}/>} title={time} color={tone} variant="outlined" sx={{maxWidth:'100%',minWidth:0,height:'auto',minHeight:28,fontVariantNumeric:'tabular-nums','& .MuiChip-label':{fontSize:15,fontWeight:700,lineHeight:1.5,whiteSpace:'normal',overflowWrap:'anywhere',py:.5},'& .MuiChip-icon':{fontSize:18,alignSelf:'flex-start',mt:.5}}}/>}
   {overview.times.length>1&&<Typography aria-label={`另有${overview.times.length-1}个时间`} sx={{fontSize:13,color:'text.secondary',alignSelf:'center'}}>+{overview.times.length-1}</Typography>}
  </Stack>}
  {!editing&&overview.locations.length===1&&<Stack direction="row" sx={{mt:.75,gap:.5,alignItems:'flex-start'}}><PlaceOutlined sx={{fontSize:18,mt:.2,color:'text.secondary'}}/><Typography sx={{fontSize:14,lineHeight:1.6,color:'text.secondary',overflowWrap:'anywhere',flex:1,minWidth:0}}><HighlightedText text={overview.locations[0]}/></Typography></Stack>}
  {!editing&&<Stack direction="row" className="notice-actions" sx={{alignItems:'center',gap:.75,mt:1.5,pt:1.25,borderTop:'1px solid',borderColor:'divider'}}>
   <Button ref={expandButton} className="notice-expand" variant="text" aria-expanded={expanded} aria-controls={bodyID} aria-label={`${expanded?'收起详情':'展开详情'}：${n.title}`} onClick={onExpandedChange} disabled={disabled} startIcon={<ExpandMore sx={{transform:expanded?'rotate(180deg)':'none'}}/>} sx={{minWidth:0,borderRadius:'8px',px:1,fontSize:15,flex:'0 0 auto'}}>{expanded?'收起':'展开'}</Button>
   <Box sx={{flex:1}}/>
   {readOnly?<Tooltip title="原文"><IconButton aria-label={`原文：${n.title}`} onClick={()=>actions.details(n)}><DescriptionOutlined/></IconButton></Tooltip>:<><Button className="notice-dismiss" size="small" color="inherit" startIcon={n.dismissed?<Undo/>:<Block/>} disabled={disabled||editing} onClick={()=>app.act(n.id,v=>setNoticeApplicable(v,v.dismissed),n.dismissed?'已恢复通知':'已设为不适用，可撤销')} sx={{fontSize:13,borderRadius:2,minWidth:0,px:1,whiteSpace:'nowrap',color:'text.secondary','& .MuiButton-startIcon':{display:{xs:'none',sm:'inline-flex'}}}}>{n.dismissed?'恢复':'不适用'}</Button><Tooltip title={n.dismissed?'先恢复通知':done?'恢复':n.kind==='task'?'完成':'知悉'}><span><IconButton className="notice-complete" aria-label={n.dismissed?'完成':done?'恢复':n.kind==='task'?'完成':'知悉'} onClick={()=>app.act(n.id,v=>setNoticeCompleted(v,!done),done?'已恢复':'已完成')} disabled={disabled||n.dismissed} sx={{width:56,height:56,color:'success.main',bgcolor:theme=>alpha(theme.palette.success.main,.12),border:'1px solid',borderColor:theme=>alpha(theme.palette.success.main,.4),'&:hover':{bgcolor:theme=>alpha(theme.palette.success.main,.2)},'& .MuiSvgIcon-root':{fontSize:32}}}>{done&&!n.dismissed?<Undo/>:<Check/>}</IconButton></span></Tooltip>
   <Tooltip title="更多操作"><IconButton aria-label={`更多：${n.title}`} aria-haspopup="menu" aria-expanded={menu?'true':undefined} onClick={e=>setMenu(e.currentTarget)} disabled={disabled}><MoreHoriz/></IconButton></Tooltip>
   <Menu anchorEl={menu} open={!!menu} onClose={()=>setMenu(null)}>{actions.question&&<MenuItem onClick={()=>secondary(()=>actions.question?.(n))}>问这条通知</MenuItem>}<MenuItem onClick={()=>secondary(()=>actions.details(n))}>原文与附件</MenuItem><MenuItem onClick={()=>secondary(()=>actions.correct(n))}>修正</MenuItem>{actions.share&&<MenuItem onClick={()=>secondary(()=>actions.share?.(n))}>分享图</MenuItem>}{n.kind==='task'&&!done&&<MenuItem onClick={()=>secondary(()=>actions.calendar(n))}>创建提醒</MenuItem>}<MenuItem onClick={()=>secondary(()=>app.remove(n.id))} sx={{color:'error.main'}}>删除通知</MenuItem></Menu></>}
  </Stack>}
  <Box id={bodyID} className="notice-body" aria-hidden={!expanded}>
   <Collapse in={expanded} timeout={reducedMotion?0:360} unmountOnExit><Box sx={{mt:1.5,pt:1.5,borderTop:'1px solid',borderColor:'divider'}}>
    {!readOnly&&!editing&&(actions.question||actions.share)&&<Stack className="notice-tools" direction="row" sx={{alignItems:'center',gap:1,mb:1.5}}>{actions.question&&<Button size="small" startIcon={<ChatBubbleOutline/>} onClick={()=>actions.question?.(n)} sx={{minHeight:40,px:1.25}}>问这条通知</Button>}<Box sx={{flex:1}}/>{actions.share&&<Tooltip title="分享图"><IconButton aria-label={`分享图：${n.title}`} onClick={()=>actions.share?.(n)} sx={{height:40,width:40}}><ShareOutlined/></IconButton></Tooltip>}</Stack>}
    <NoticeDetailContent notice={n} app={app} actions={actions} expandedTaskIDs={expandedTaskIDs} onTaskExpandedChange={onTaskExpandedChange} onCollapse={closeFromBottom} readOnly={readOnly} editing={editing}/>
    {editing&&<Box sx={{display:'flex',justifyContent:'flex-end',mt:1.5}}><Button variant="contained" onClick={onEditingClose}>完成</Button></Box>}
   </Box></Collapse>
  </Box>
 </Paper></CorrectionProvider>;
}
