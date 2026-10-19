import {useEffect,useRef,useState} from 'react';
import {Box,Button,Chip,Collapse,IconButton,Paper,Stack,Tooltip,Typography,useMediaQuery} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import Check from '@mui/icons-material/Check';
import Undo from '@mui/icons-material/Undo';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Schedule from '@mui/icons-material/Schedule';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import PeopleOutlined from '@mui/icons-material/PeopleOutlined';
import Star from '@mui/icons-material/Star';
import StarBorder from '@mui/icons-material/StarBorder';
import Block from '@mui/icons-material/Block';
import CheckCircle from '@mui/icons-material/CheckCircle';
import NotificationsNone from '@mui/icons-material/NotificationsNone';
import LiveHelpOutlined from '@mui/icons-material/LiveHelpOutlined';
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
import {completeFeedback,favoriteFeedback,noticeMotion} from './notice-motion';
import {CompletionCelebration} from './CompletionCelebration';
import {isNewCompletion} from './completion-feedback';

export interface NoticeActions {
 note:(notice:Notice,target:NoteTarget,title:string,text:string)=>void;
 details:(notice:Notice)=>void;
 calendar:(notice:Notice,task?:Task)=>void;
 evidence:(notice:Notice,path:string)=>void;
 correct:(notice:Notice,path?:string)=>void;
 share?:(notice:Notice)=>void;
 question?:(notice:Notice)=>void;
 taskCompletionChanged?:(noticeID:string,taskID:string,completed:boolean)=>void;
 completionChanged?:(noticeID:string,anchor?:HTMLElement)=>void;
}
export type NoticeCardController={act:(...args:Parameters<CampusController['act']>)=>ReturnType<CampusController['act']>|void;remove:CampusController['remove']};
export function NoticeCard({notice:n,app,actions,now,expanded:providedExpanded,onExpandedChange,expandedTaskIDs,onTaskExpandedChange,disabled=false,readOnly=false,editing=false,onEditingClose,unread=false}:{notice:Notice;app:NoticeCardController;actions:NoticeActions;now:number;expanded:boolean;onExpandedChange:()=>void;expandedTaskIDs:Set<string>;onTaskExpandedChange:(id:string)=>void;disabled?:boolean;readOnly?:boolean;editing?:boolean;onEditingClose?:()=>void;unread?:boolean}){
 const expanded=editing||providedExpanded;
 const status=getNoticeStatus(n),p=priority(n,now),done=status==='completed'||status==='dismissed';
 const overview=noticeOverview(n),preview=summaryPreview(n),reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const expandButton=useRef<HTMLButtonElement>(null),bodyID=`notice-body-${n.id}`;
 const completeButton=useRef<HTMLButtonElement>(null),feedbackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [celebration,setCelebration]=useState<{x:number;y:number;key:number}|null>(null);
 useEffect(()=>()=>{if(feedbackTimer.current!==null)clearTimeout(feedbackTimer.current);},[]);
 useEffect(()=>{if(status!=='completed'){if(feedbackTimer.current!==null)clearTimeout(feedbackTimer.current);feedbackTimer.current=null;setCelebration(null);}},[status]);
 const [favoritePulse,setFavoritePulse]=useState(0),[completePulse,setCompletePulse]=useState(0);
 const summary=plainReadingText(preview.text).trim(),showSummary=!!summary&&summary!==plainReadingText(n.title).trim();
 const audience=overview.audiences.length===1&&Array.from(overview.audiences[0]).length<=28?overview.audiences[0]:overview.audiences.length>1?String(overview.audiences.length):'按条件';
 const time=overview.times[0]??'',deadline=!!(n.localDeadline||n.deadlineText||n.deadline),tone=done?'success':p.level==='overdue'?'error':p.label?'warning':'info';
 const accent=status==='completed'?'success':status==='dismissed'?null:p.level==='overdue'?'error':n.kind==='task'?'primary':'secondary';
 function closeFromBottom(){onExpandedChange();requestAnimationFrame(()=>{expandButton.current?.focus({preventScroll:true});document.getElementById(`notice-${n.id}`)?.scrollIntoView({block:'start',behavior:reducedMotion?'instant':'smooth'});});}
 function favorite(){if(app.act(n.id,v=>setFavorite(v,!v.favorite),n.favorite?'已取消收藏':'已收藏'))setFavoritePulse(value=>value+1);}
 function celebrate(anchor?:HTMLElement){
  const source=anchor??completeButton.current,rect=source?.getBoundingClientRect();
  setCompletePulse(value=>value+1);
  if(rect){setCelebration({x:rect.left+rect.width/2,y:rect.top+rect.height/2,key:Date.now()});if(feedbackTimer.current!==null)clearTimeout(feedbackTimer.current);feedbackTimer.current=setTimeout(()=>{feedbackTimer.current=null;setCelebration(null);},reducedMotion?750:1500);}
  actions.completionChanged?.(n.id,source??undefined);
 }
 function complete(){const result=app.act(n.id,v=>setNoticeCompleted(v,!done),done?'已恢复':'已完成');if(isNewCompletion(result))celebrate(completeButton.current??undefined);else if(result)setCompletePulse(value=>value+1);}
 return <CorrectionProvider value={{editing:editing&&!readOnly,onEdit:path=>actions.correct(n,path)}}><Paper component="article" variant="outlined" id={`notice-${n.id}`} className="notice-card" inert={disabled||undefined} aria-labelledby={`notice-heading-${n.id}`} sx={{p:{xs:2,sm:2.5},borderRadius:'18px',borderColor:theme=>alpha(theme.palette.text.primary,theme.palette.mode==='dark'?.15:.12),borderInlineStartWidth:3,borderInlineStartColor:accent?`${accent}.main`:'divider',boxShadow:theme=>`0 3px 14px ${alpha(theme.palette.common.black,theme.palette.mode==='dark'?.07:.025)}`,transition:reducedMotion?'none':`border-color ${noticeMotion.transition}, box-shadow ${noticeMotion.transition}, background-color ${noticeMotion.transition}`,pointerEvents:disabled?'none':undefined}}>
  {editing&&<Stack direction="row" sx={{alignItems:'center',gap:1,mb:1.5,p:1,borderRadius:1,bgcolor:theme=>alpha(theme.palette.primary.main,.09)}}><Typography sx={{flex:1,fontSize:14,fontWeight:600,color:'primary.main'}}>点文字修改</Typography>{!!n.corrections?.values.length&&<Button size="small" color="warning" onClick={()=>app.act(n.id,current=>{if(current.updatedAt!==n.updatedAt)throw new Error('通知已更新，请重新进入修正。');return restoreAIContent(current);},'已恢复初稿')}>恢复初稿</Button>}<Button size="small" variant="contained" onClick={onEditingClose}>完成</Button></Stack>}
  <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:1,mb:1}}>
   <Stack direction="row" sx={{alignItems:'center',gap:1}}>{unread&&!readOnly&&<Box component="span" role="img" aria-label="未读通知" title="未读" sx={{width:9,height:9,borderRadius:'50%',bgcolor:'info.main',flexShrink:0}}/>}<Chip size="small" icon={status==='completed'?<CheckCircle/>:n.kind!=='task'?<NotificationsNone/>:undefined} label={p.label&&!done?p.label:done?(status==='dismissed'?'不适用':'已完成'):n.kind==='task'?'待办':'提醒'} color={status==='completed'?'success':done?'default':p.label?(p.level==='overdue'?'error':'warning'):n.kind==='task'?'primary':'secondary'} variant={status==='completed'||p.label&&!done?'filled':'outlined'}/></Stack>
   <Stack direction="row" sx={{alignItems:'center',gap:.5}}>{readOnly?n.favorite&&<Star aria-label="已收藏" sx={{color:'warning.main',fontSize:25}}/>:<Tooltip title={n.favorite?'取消收藏':'收藏通知'}><IconButton className="notice-favorite" aria-label={n.favorite?'取消收藏通知':'收藏通知'} aria-pressed={!!n.favorite} disabled={disabled||editing} onClick={favorite} sx={{color:n.favorite?'warning.main':'text.secondary','& .MuiSvgIcon-root':{fontSize:27},bgcolor:n.favorite?theme=>alpha(theme.palette.warning.main,.1):'transparent',transition:reducedMotion?'none':`color ${noticeMotion.transition}, background-color ${noticeMotion.transition}`,'&.Mui-focusVisible':{outline:'2px solid',outlineColor:'warning.main',outlineOffset:2}}}><Box component="span" key={favoritePulse} sx={{display:'flex',animation:favoritePulse&&!reducedMotion?`${favoriteFeedback} 620ms ${noticeMotion.easing.enter}`:'none'}}>{n.favorite?<Star/>:<StarBorder/>}</Box></IconButton></Tooltip>}{overview.notes&&<Tooltip title="已有笔记"><EditNote aria-label="已有笔记" sx={{fontSize:20,color:'primary.main'}}/></Tooltip>}{overview.total>0&&<Typography variant="body2" color={overview.completed?'success.main':'text.secondary'} sx={{fontVariantNumeric:'tabular-nums',fontWeight:overview.completed?700:400}} aria-label={`已完成${overview.completed}项任务，共${overview.total}项任务`}>{overview.completed}/{overview.total}</Typography>}</Stack>
  </Stack>
  <Typography component="h2" className="notice-heading" id={`notice-heading-${n.id}`} sx={{m:0,p:0,textIndent:0,fontSize:{xs:28,sm:32},fontWeight:700,lineHeight:1.3,textWrap:'pretty',overflowWrap:'anywhere'}}><CorrectionTarget inline path="title" label="标题"><HighlightedText text={n.title}/></CorrectionTarget></Typography>
  {(showSummary||editing)&&<Typography component="div" className="notice-summary" color="text.secondary" sx={{mt:1,mx:0,p:0,textIndent:0,fontSize:16,lineHeight:1.65,'& > .rich-text':{m:0,p:0},'& .rich-text > p':{ml:0,textIndent:0}}}><CorrectionTarget path="summary" label="简介"><RichText text={editing?n.summary:preview.text}/></CorrectionTarget></Typography>}
  {editing&&<Box sx={{mt:1.25,fontSize:15,color:'info.main'}}><CorrectionTarget path="deadlineText" label="截止描述">{n.deadlineText||'添加截止描述'}</CorrectionTarget></Box>}
  {!editing&&<Stack direction="row" className="notice-meta" sx={{mt:1.25,gap:.75,flexWrap:'wrap',alignItems:'flex-start'}}>
   {!!overview.audiences.length&&<Chip className="notice-audience-preview" icon={<PeopleOutlined/>} size="small" label={<HighlightedText text={audience}/>} title={overview.audiences.length===1?overview.audiences[0]:`${overview.audiences.length}类适用对象`} color="warning" variant="outlined" sx={{maxWidth:'100%',minWidth:0,height:'auto',minHeight:28,fontSize:14,'& .MuiChip-label':{fontSize:14,lineHeight:1.5,whiteSpace:'normal',overflowWrap:'anywhere',py:.5},'& .MuiChip-icon':{fontSize:18,alignSelf:'flex-start',mt:.5}}}/>}
   {!!time&&<Chip className="notice-time-preview" icon={<Schedule/>} size="small" label={<HighlightedText text={`${deadline?'截止 ':''}${headlineTime(time)}`}/>} title={time} color={tone} variant="outlined" sx={{maxWidth:'100%',minWidth:0,height:'auto',minHeight:28,fontVariantNumeric:'tabular-nums','& .MuiChip-label':{fontSize:15,fontWeight:700,lineHeight:1.5,whiteSpace:'normal',overflowWrap:'anywhere',py:.5},'& .MuiChip-icon':{fontSize:18,alignSelf:'flex-start',mt:.5}}}/>}
   {overview.times.length>1&&<Typography aria-label={`另有${overview.times.length-1}个时间`} sx={{fontSize:13,color:'text.secondary',alignSelf:'center'}}>+{overview.times.length-1}</Typography>}
  </Stack>}
  {!editing&&overview.locations.length===1&&<Stack direction="row" sx={{mt:.75,gap:.5,alignItems:'flex-start'}}><PlaceOutlined sx={{fontSize:18,mt:.2,color:'text.secondary'}}/><Typography sx={{fontSize:14,lineHeight:1.6,color:'text.secondary',overflowWrap:'anywhere',flex:1,minWidth:0}}><HighlightedText text={overview.locations[0]}/></Typography></Stack>}
  {!editing&&<Stack direction="row" className="notice-actions" sx={{alignItems:'center',gap:.5,mt:1.5,pt:1.25,borderTop:'1px solid',borderColor:'divider',flexWrap:'wrap',rowGap:1}}>
   <Button ref={expandButton} className="notice-expand" variant="text" aria-expanded={expanded} aria-controls={bodyID} aria-label={`${expanded?'收起详情':'展开详情'}：${n.title}`} onClick={onExpandedChange} disabled={disabled} startIcon={<ExpandMore sx={{transform:expanded?'rotate(180deg)':'none',transition:reducedMotion?'none':`transform ${noticeMotion.transition}`}}/>} sx={{minWidth:0,borderRadius:'10px',px:.5,fontSize:15,fontWeight:600,flex:'0 0 auto'}}>{expanded?'收起':'展开'}</Button>
   <Box sx={{flex:1}}/>
   {!readOnly&&<><Button className="notice-dismiss" size="small" variant="outlined" color="inherit" startIcon={n.dismissed?<Undo/>:<Block/>} aria-label={n.dismissed?'恢复通知':'不适用'} disabled={disabled||editing} onClick={()=>app.act(n.id,v=>setNoticeApplicable(v,v.dismissed),n.dismissed?'已恢复通知':'已设为不适用，可撤销')} sx={{fontSize:13,fontWeight:500,borderRadius:'10px',minWidth:0,minHeight:36,px:.75,whiteSpace:'nowrap',color:n.dismissed?'primary.main':'text.secondary',borderColor:theme=>alpha(n.dismissed?theme.palette.primary.main:theme.palette.text.secondary,.3),bgcolor:theme=>alpha(theme.palette.text.primary,.025),transition:reducedMotion?'none':`border-color ${noticeMotion.transition}, background-color ${noticeMotion.transition}, color ${noticeMotion.transition}`,'& .MuiButton-startIcon':{ml:0,mr:.5,'& .MuiSvgIcon-root':{fontSize:16}},'&:hover':{borderColor:'text.secondary',bgcolor:'action.hover'}}}>{n.dismissed?'恢复':'不适用'}</Button><Tooltip title={n.dismissed?'先恢复通知':done?'恢复':n.kind==='task'?'完成':'知悉'}><span><IconButton ref={completeButton} className="notice-complete" aria-label={n.dismissed?'完成':done?'恢复':n.kind==='task'?'完成':'知悉'} onClick={complete} disabled={disabled||n.dismissed} sx={{width:56,height:56,color:done?'success.main':'success.contrastText',bgcolor:done?theme=>alpha(theme.palette.success.main,.13):'success.main',border:'1px solid',borderColor:theme=>alpha(theme.palette.success.main,done?.4:.75),boxShadow:done?'none':theme=>`0 3px 8px ${alpha(theme.palette.success.main,.16)}`,transition:reducedMotion?'none':`background-color ${noticeMotion.transition}, color ${noticeMotion.transition}, box-shadow ${noticeMotion.transition}, transform ${noticeMotion.transition}`,'&:hover':{bgcolor:done?theme=>alpha(theme.palette.success.main,.2):'success.dark',transform:reducedMotion?'none':'translateY(-1px)'},'&.Mui-focusVisible':{outline:'2px solid',outlineColor:'success.main',outlineOffset:3},'&.Mui-disabled':{color:'text.disabled',bgcolor:'action.disabledBackground',borderColor:'divider',boxShadow:'none'},'& .MuiSvgIcon-root':{fontSize:32}}}><Box component="span" key={completePulse} sx={{display:'flex',animation:completePulse&&!reducedMotion?`${completeFeedback} 740ms ${noticeMotion.easing.enter}`:'none'}}>{done&&!n.dismissed&&!celebration?<Undo/>:<Check/>}</Box></IconButton></span></Tooltip>
   </>}
  </Stack>}
  <Box id={bodyID} className="notice-body" aria-hidden={!expanded}>
   <Collapse in={expanded} timeout={reducedMotion?0:noticeMotion.duration} easing={noticeMotion.easing} unmountOnExit><Box sx={{mt:1.5,pt:1.5,borderTop:'1px solid',borderColor:'divider'}}>
    {!readOnly&&!editing&&<Stack className="notice-tools" direction="row" role="toolbar" aria-label="通知工具" sx={{alignItems:'center',gap:.75,mb:1.5,flexWrap:'wrap'}}>
     {actions.question&&<Tooltip title="问这条通知"><Button size="small" startIcon={<LiveHelpOutlined/>} aria-label={`提问：${n.title}`} onClick={()=>actions.question?.(n)} sx={{minHeight:44,px:1.25}}>提问</Button></Tooltip>}
     <Tooltip title="修改整理内容"><Button size="small" startIcon={<EditNote/>} aria-label={`修正：${n.title}`} onClick={()=>actions.correct(n)} sx={{minHeight:44,px:1.25}}>修正</Button></Tooltip>
     <Box sx={{flex:1}}/>
     {actions.share&&<Tooltip title="分享图"><IconButton aria-label={`分享图：${n.title}`} onClick={()=>actions.share?.(n)} sx={{height:44,width:44}}><ShareOutlined/></IconButton></Tooltip>}
     {n.kind==='task'&&<Tooltip title="创建提醒"><span><IconButton aria-label={`创建提醒：${n.title}`} disabled={done} onClick={()=>actions.calendar(n)} sx={{height:44,width:44}}><NotificationsNone/></IconButton></span></Tooltip>}
    </Stack>}
    <NoticeDetailContent notice={n} app={app} actions={actions} expandedTaskIDs={expandedTaskIDs} onTaskExpandedChange={onTaskExpandedChange} onCollapse={closeFromBottom} onNoticeCompleted={celebrate} onDelete={()=>app.remove(n.id)} readOnly={readOnly} editing={editing}/>
    {editing&&<Box sx={{display:'flex',justifyContent:'flex-end',mt:1.5}}><Button variant="contained" onClick={onEditingClose}>完成</Button></Box>}
   </Box></Collapse>
  </Box>
 </Paper>{celebration&&status==='completed'&&<CompletionCelebration point={celebration} reducedMotion={reducedMotion}/>}</CorrectionProvider>;
}
