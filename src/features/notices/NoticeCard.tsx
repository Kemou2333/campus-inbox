import {useEffect,useRef,useState} from 'react';
import {Box,Button,Chip,Collapse,Dialog,DialogTitle,DialogContent,IconButton,ListItemIcon,ListItemText,Menu,MenuItem,MenuList,Paper,Stack,SvgIcon,Tooltip,Typography,useMediaQuery} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import Check from '@mui/icons-material/Check';
import Undo from '@mui/icons-material/Undo';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Schedule from '@mui/icons-material/Schedule';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import Add from '@mui/icons-material/Add';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import Star from '@mui/icons-material/Star';
import StarBorder from '@mui/icons-material/StarBorder';
import CheckCircle from '@mui/icons-material/CheckCircle';
import NotificationsNone from '@mui/icons-material/NotificationsNone';
import {alpha} from '@mui/material/styles';
import {getNoticeStatus,priority,setFavorite,setNoticeApplicable,setNoticeCompleted} from '../../domain/notice';
import type {Notice,NoteTarget,Task} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {RichText} from '../../shared/ui/RichText';
import {plainReadingText} from '../../domain/reading';
import {noticeOverview,summaryPreview} from './notice-overview';
import {NoticeDetailContent} from './NoticeDetailContent';
import {CorrectionProvider,CorrectionTarget} from './CorrectionTarget';
import {restoreAIContent} from '../../domain/corrections';
import {HighlightedText} from '../../shared/ui/SearchHighlight';
import {completeFeedback,favoriteFeedback,noticeMotion} from './notice-motion';
import {isNewCompletion} from './completion-feedback';
import {SwipeSurface} from './SwipeSurface';
import {defaultUiPreferences,type UiPreferences} from '../../shared/ui-preferences';
import type {PlatformAPI} from '../../platform';
import {compactDateLabel,manualPriorities,setManualPriority} from '../../domain/notice-priority';

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
export type NoticeCardController={act:(...args:Parameters<CampusController['act']>)=>ReturnType<CampusController['act']>|void;remove:CampusController['remove'];platform?:PlatformAPI};
function NoticeToolIcon({kind}:{kind:'question'|'correct'|'share'|'remind'}){
 const paths={question:['M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z','M9.5 8a2.5 2.5 0 1 1 3.4 2.3c-.9.4-1.4 1-1.4 2M11.5 15h.01'],correct:['M13 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8','m9 15 1-4L18 3a2 2 0 0 1 3 3l-8 8-4 1Zm7-10 3 3'],share:['M5 11v9h14v-9M12 3v12m-4-8 4-4 4 4'],remind:['M4 3 1 7m19-4 3 4M12 9v4l3 2']};
 return <SvgIcon viewBox="0 0 24 24" sx={{fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round'}}>{kind==='remind'&&<circle cx="12" cy="13" r="8"/>}{paths[kind].map((d,i)=><path key={i} d={d}/>)}</SvgIcon>;
}
export function NoticeCard({notice:n,app,actions,now,expanded:providedExpanded,onExpandedChange,expandedTaskIDs,onTaskExpandedChange,disabled=false,readOnly=false,editing=false,onEditingClose,unread=false,uiPreferences=defaultUiPreferences}:{notice:Notice;app:NoticeCardController;actions:NoticeActions;now:number;expanded:boolean;onExpandedChange:()=>void;expandedTaskIDs:Set<string>;onTaskExpandedChange:(id:string)=>void;disabled?:boolean;readOnly?:boolean;editing?:boolean;onEditingClose?:()=>void;unread?:boolean;uiPreferences?:UiPreferences}){
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
 const time=compactDateLabel(n.localDeadline?'':overview.times[0]??'',n.localDeadline?undefined:n.deadlineSpec,n.localDeadline||n.deadline),deadline=!!(n.localDeadline||n.deadlineText||n.deadline),tone=done?'success':p.level==='overdue'?'error':p.label?'warning':'info';
 const [toolAnchor,setToolAnchor]=useState<HTMLElement|null>(null),[priorityAnchor,setPriorityAnchor]=useState<HTMLElement|null>(null);
 const manual=manualPriorities.find(p=>p.value===n.manualPriority);
 function favorite(){if(app.act(n.id,v=>setFavorite(v,!v.favorite),n.favorite?'已取消收藏':'已收藏'))setFavoritePulse(value=>value+1);}
 function celebrate(anchor?:HTMLElement){
  const source=anchor??completeButton.current,rect=source?.getBoundingClientRect();
  setCompletePulse(value=>value+1);
  if(rect){setCelebration({x:rect.left+rect.width/2,y:rect.top+rect.height/2,key:Date.now()});if(feedbackTimer.current!==null)clearTimeout(feedbackTimer.current);feedbackTimer.current=setTimeout(()=>{feedbackTimer.current=null;setCelebration(null);},reducedMotion?750:1500);}
  actions.completionChanged?.(n.id,source??undefined);
 }
 function complete(){if(n.dismissed){app.act(n.id,v=>setNoticeApplicable(v,true),'已恢复');return;}const result=app.act(n.id,v=>setNoticeCompleted(v,!done),done?'已恢复':'已完成');if(isNewCompletion(result))celebrate(completeButton.current??undefined);else if(result)setCompletePulse(value=>value+1);}
 return <CorrectionProvider value={{editing:editing&&!readOnly,onEdit:path=>actions.correct(n,path)}}><SwipeSurface enabled={!!(app.platform?.kind==='android'&&uiPreferences.swipeActions&&!readOnly&&!editing&&!disabled)} done={done} onComplete={complete} onDelete={()=>app.remove(n.id)}><Paper component="article" variant="outlined" id={`notice-${n.id}`} className="notice-card" inert={disabled||undefined} aria-labelledby={`notice-heading-${n.id}`} sx={{position:'relative',p:{xs:'18px',sm:'21px'},borderRadius:'17px',borderWidth:1,borderColor:'divider',boxShadow:theme=>theme.palette.mode==='dark'?'0 6px 18px #0002':'0 4px 10px #13332503',transition:reducedMotion?'none':`border-color ${noticeMotion.transition}, box-shadow ${noticeMotion.transition}, background-color ${noticeMotion.transition}`,pointerEvents:disabled?'none':undefined}}>
  {unread&&!readOnly&&<Box component="span" aria-label="未读通知" sx={{position:'absolute',top:9,right:10,width:7,height:7,borderRadius:'50%',bgcolor:'info.main',pointerEvents:'none'}}/>}
  {editing&&<Stack direction="row" sx={{alignItems:'center',gap:1,mb:1.5,p:1,borderRadius:1,bgcolor:theme=>alpha(theme.palette.primary.main,.09)}}><Typography sx={{flex:1,fontSize:14,fontWeight:600,color:'primary.main'}}>点文字修改</Typography>{!!n.corrections?.values.length&&<Button size="small" color="warning" onClick={()=>app.act(n.id,current=>{if(current.updatedAt!==n.updatedAt)throw new Error('通知已更新，请重新进入修正。');return restoreAIContent(current);},'已恢复初稿')}>恢复初稿</Button>}<Button size="small" variant="contained" onClick={onEditingClose}>完成</Button></Stack>}
  <Box className="notice-overview">
  {(done||p.label)&&<Stack direction="row" sx={{alignItems:'center',gap:1,mb:1}}><Chip size="small" icon={status==='completed'?<CheckCircle/>:undefined} label={done?(status==='dismissed'?'已归档':'已完成'):p.label} color={status==='completed'?'success':done?'default':p.level==='overdue'?'error':'warning'}/></Stack>}
  <Stack direction="row" className="notice-title-row" sx={{alignItems:'flex-start',gap:.5,mb:1.2}}>
   <Box sx={{flex:1,minWidth:0,borderLeft:'4px solid',borderColor:done?'success.main':n.kind==='task'?'primary.main':'secondary.main',pl:1.25,py:.15}}>
    <Typography component="h2" className="notice-heading" id={`notice-heading-${n.id}`} sx={{m:0,p:0,fontSize:{xs:30,sm:35},fontWeight:850,lineHeight:1.28,letterSpacing:'-.7px',color:theme=>theme.palette.mode==='dark'?'#E3F0EC':'#193F38',overflowWrap:'anywhere'}}><CorrectionTarget inline path="title" label="标题"><HighlightedText text={n.title}/></CorrectionTarget></Typography>
   </Box>
   {!readOnly&&<Tooltip title={manual?`优先级：${manual.label}`:'设置优先级'}><IconButton className="notice-priority" aria-label={`优先级：${n.title}`} aria-haspopup="menu" aria-expanded={!!priorityAnchor} disabled={disabled||editing} onClick={e=>setPriorityAnchor(e.currentTarget)} sx={{width:40,height:44,borderRadius:'10px',color:manual?`${manual.color}.main`:'text.secondary',bgcolor:manual?theme=>alpha(theme.palette[manual.color].main,.08):undefined}}><Box component="span" key={n.manualPriority??'none'} sx={{display:'flex',animation:manual&&!reducedMotion?`${favoriteFeedback} 520ms ease-out`:'none'}}><FlagOutlined sx={{fontSize:24}}/></Box></IconButton></Tooltip>}
   {readOnly?n.favorite&&<Star aria-label="已收藏" sx={{color:'warning.main',fontSize:25}}/>:<Tooltip title={n.favorite?'取消收藏':'收藏通知'}><IconButton className="notice-favorite" aria-label={n.favorite?'取消收藏通知':'收藏通知'} aria-pressed={!!n.favorite} disabled={disabled||editing} onClick={favorite} sx={{width:40,height:44,borderRadius:'10px',color:n.favorite?'warning.main':'text.secondary',bgcolor:n.favorite?theme=>alpha(theme.palette.warning.main,.1):undefined}}><Box component="span" key={favoritePulse} sx={{display:'flex',animation:favoritePulse&&!reducedMotion?`${favoriteFeedback} 620ms ${noticeMotion.easing.enter}`:'none'}}>{n.favorite?<Star sx={{fontSize:27}}/>:<StarBorder sx={{fontSize:27}}/>}</Box></IconButton></Tooltip>}
  </Stack>
  {(showSummary||editing)&&<Typography component="div" className="notice-summary" color="text.secondary" sx={{mt:0,mb:'15px',mx:0,p:0,textIndent:0,fontSize:16,lineHeight:1.7,'& > .rich-text':{m:0,p:0},'& .rich-text > p':{ml:0,textIndent:0}}}><CorrectionTarget path="summary" label="简介"><RichText text={editing?n.summary:preview.text}/></CorrectionTarget></Typography>}
  {editing&&<Box sx={{mt:1.25,fontSize:15,color:'info.main'}}><CorrectionTarget path="deadlineText" label="截止描述">{n.deadlineText||'添加截止描述'}</CorrectionTarget></Box>}
  {!editing&&<Stack direction="row" className="notice-meta" sx={{mt:0,gap:'8px',flexWrap:'wrap',alignItems:'flex-start'}}>
   {!!time&&<Chip className="notice-time-preview" icon={<Schedule/>} size="small" label={<HighlightedText text={`${deadline?'截止 ':''}${time}`}/>} title={time} variant="filled" sx={{maxWidth:'100%',minWidth:0,height:'auto',minHeight:28,border:0,borderRadius:'7px',fontVariantNumeric:'tabular-nums',bgcolor:theme=>tone==='error'?(theme.palette.mode==='dark'?'#402f33':'#fff0eb'):(theme.palette.mode==='dark'?'#28374c':'#eef5fc'),color:theme=>tone==='error'?(theme.palette.mode==='dark'?'#f2b0a5':'#b45645'):(theme.palette.mode==='dark'?'#adcbf4':'#376b9c'),'& .MuiChip-label':{fontSize:{xs:12,sm:13},fontWeight:650,lineHeight:1.5,whiteSpace:'normal',overflowWrap:'anywhere',px:'8px',py:'5px'},'& .MuiChip-icon':{fontSize:17,color:'inherit',alignSelf:'flex-start',ml:'7px',mt:'5px'}}}/>}
   {time&&overview.times.length>1&&<Typography aria-label={`另有${overview.times.length-1}个时间`} sx={{fontSize:13,color:'text.secondary',alignSelf:'center'}}>+{overview.times.length-1}</Typography>}
  </Stack>}
  {!editing&&expanded&&overview.locations.length===1&&<Stack direction="row" sx={{mt:.75,gap:.5,alignItems:'flex-start'}}><PlaceOutlined sx={{fontSize:18,mt:.2,color:'text.secondary'}}/><Typography sx={{fontSize:14,lineHeight:1.6,color:'text.secondary',overflowWrap:'anywhere',flex:1,minWidth:0}}><HighlightedText text={overview.locations[0]}/></Typography></Stack>}
  </Box>
  {!editing&&<Stack direction="row" className="notice-actions" sx={{alignItems:'center',gap:{xs:'7px',sm:'9px'},mt:'18px',pt:'14px',borderTop:'1px solid',borderColor:'divider',flexWrap:'wrap',rowGap:1}}>
   <Tooltip title={expanded?'收起详情':'查看详情'}><IconButton ref={expandButton} className="notice-expand" aria-expanded={expanded} aria-controls={bodyID} aria-label={`${expanded?'收起详情':'展开详情'}：${n.title}`} onClick={onExpandedChange} disabled={disabled} sx={{width:48,height:44,borderRadius:'10px',color:'primary.main',bgcolor:theme=>alpha(theme.palette.primary.main,.06),'&:hover':{bgcolor:'action.selected'},'& .MuiSvgIcon-root':{fontSize:27,transform:expanded?'rotate(180deg)':'none',transition:reducedMotion?'none':`transform ${noticeMotion.transition}`}}}><ExpandMore/></IconButton></Tooltip>
   <Box sx={{flex:1}}/>
   {!readOnly&&<><Button className="notice-delete" size="small" variant="outlined" color="inherit" startIcon={<DeleteOutline/>} aria-label={`删除通知：${n.title}`} disabled={disabled||editing} onClick={()=>app.remove(n.id)} sx={{fontSize:13,fontWeight:500,borderRadius:'10px',minHeight:44,px:1,color:'text.secondary',borderColor:'divider','&:hover':{color:'error.main',borderColor:'error.main'}}}>删除</Button><Tooltip title={done?'恢复':n.kind==='task'?'完成':'知悉'}><span><IconButton ref={completeButton} className="notice-complete" data-guide="notice-complete" aria-label={done?'恢复':n.kind==='task'?'完成':'知悉'} onClick={complete} disabled={disabled} sx={{width:56,height:56,color:done?'success.main':'success.contrastText',bgcolor:done?theme=>alpha(theme.palette.success.main,.13):'success.main',border:'1px solid',borderColor:theme=>alpha(theme.palette.success.main,done?.4:.75),boxShadow:done?'none':theme=>`0 3px 8px ${alpha(theme.palette.success.main,.16)}`,transition:reducedMotion?'none':`background-color ${noticeMotion.transition}, color ${noticeMotion.transition}, box-shadow ${noticeMotion.transition}, transform ${noticeMotion.transition}`,'&:hover':{bgcolor:done?theme=>alpha(theme.palette.success.main,.2):'success.dark',transform:reducedMotion?'none':'translateY(-1px)'},'&.Mui-focusVisible':{outline:'2px solid',outlineColor:'success.main',outlineOffset:3},'&.Mui-disabled':{color:'text.disabled',bgcolor:'action.disabledBackground',borderColor:'divider',boxShadow:'none'},'& .MuiSvgIcon-root':{fontSize:32}}}><Box component="span" key={completePulse} sx={{display:'flex',animation:completePulse&&!reducedMotion?`${completeFeedback} 740ms ${noticeMotion.easing.enter}`:'none'}}>{done&&!n.dismissed&&!celebration?<Undo/>:<Check/>}</Box></IconButton></span></Tooltip>
   </>}
  </Stack>}
  <Menu anchorEl={toolAnchor} open={!!toolAnchor} onClose={()=>setToolAnchor(null)}>
   <MenuItem onClick={()=>{setToolAnchor(null);actions.note(n,{type:'notice'},n.title,n.note);}}><ListItemIcon><EditNote/></ListItemIcon><ListItemText>笔记</ListItemText></MenuItem>
   <MenuItem onClick={()=>{setToolAnchor(null);actions.correct(n);}}><ListItemIcon><NoticeToolIcon kind="correct"/></ListItemIcon><ListItemText>修正</ListItemText></MenuItem>
   {n.kind==='task'&&<MenuItem disabled={done} onClick={()=>{setToolAnchor(null);actions.calendar(n);}}><ListItemIcon><NoticeToolIcon kind="remind"/></ListItemIcon><ListItemText>提醒</ListItemText></MenuItem>}
  </Menu>
  <Menu anchorEl={priorityAnchor} open={!!priorityAnchor} onClose={()=>setPriorityAnchor(null)} anchorOrigin={{vertical:'bottom',horizontal:'right'}} transformOrigin={{vertical:'top',horizontal:'right'}}>
   {manualPriorities.map(item=><MenuItem key={item.value} selected={n.manualPriority===item.value} onClick={()=>{app.act(n.id,v=>setManualPriority(v,item.value),'优先级已设置');setPriorityAnchor(null);}}><ListItemIcon><FlagOutlined color={item.color}/></ListItemIcon>{item.label}</MenuItem>)}
   <MenuItem selected={!n.manualPriority} onClick={()=>{app.act(n.id,v=>setManualPriority(v,null),'优先级已清除');setPriorityAnchor(null);}}>不设置</MenuItem>
  </Menu>
  <Box id={bodyID} className="notice-body" aria-hidden={!expanded}>
   <Collapse in={expanded} timeout={reducedMotion?0:noticeMotion.duration} easing={noticeMotion.easing} unmountOnExit><Box sx={{mt:'20px'}}>
    {uiPreferences.showAddedDate&&<Typography className="notice-added-date" sx={{fontSize:12,color:'text.secondary',mb:1,fontVariantNumeric:'tabular-nums'}}>添加于 {new Date(n.createdAt).getMonth()+1}/{new Date(n.createdAt).getDate()}{overview.total>2?` · ${overview.completed}/${overview.total}`:''}</Typography>}
    {!readOnly&&!editing&&<Stack className="notice-tools" direction="row" role="toolbar" aria-label="通知工具" sx={{alignItems:'center',justifyContent:'space-between',gap:'7px',mb:'16px',pt:'3px',pb:'14px',borderBottom:'1px solid',borderColor:'divider',flexWrap:'wrap'}}>
     <Stack className="notice-main-tools" direction="row" sx={{gap:'7px',flexShrink:0}}>
      {actions.question&&<Tooltip title="问这条通知"><Button className="notice-question-tool" startIcon={<NoticeToolIcon kind="question"/>} aria-label={`提问：${n.title}`} onClick={()=>actions.question?.(n)} sx={{width:76,minWidth:76,height:44,minHeight:44,p:'0 11px',gap:'4px',border:0,borderRadius:'11px',fontSize:13,fontWeight:650,color:theme=>theme.palette.mode==='dark'?'#adcbf4':'#376b9c',bgcolor:theme=>theme.palette.mode==='dark'?'#28374c':'#eef5fc','&:hover':{bgcolor:theme=>theme.palette.mode==='dark'?'#30415b':'#e3eefb'},'& .MuiButton-startIcon':{m:0},'& .MuiSvgIcon-root':{fontSize:24}}}>提问</Button></Tooltip>}
      {actions.share&&<Tooltip title="导出分享图"><Button className="notice-share-tool" startIcon={<NoticeToolIcon kind="share"/>} aria-label={`分享图：${n.title}`} onClick={()=>actions.share?.(n)} sx={{width:76,minWidth:76,height:44,minHeight:44,p:'0 11px',gap:'4px',border:0,borderRadius:'11px',fontSize:13,fontWeight:650,color:'primary.main',bgcolor:theme=>alpha(theme.palette.primary.main,.09),'&:hover':{bgcolor:theme=>alpha(theme.palette.primary.main,.15)},'& .MuiButton-startIcon':{m:0},'& .MuiSvgIcon-root':{fontSize:24}}}>导出</Button></Tooltip>}
     </Stack>
     <Tooltip title="更多操作"><IconButton className="notice-add-tool" aria-label={`更多操作：${n.title}`} aria-haspopup="menu" aria-expanded={!!toolAnchor} onClick={event=>setToolAnchor(event.currentTarget)} sx={{width:44,height:44,ml:'auto',border:'1px solid',borderColor:'divider',borderRadius:'11px',color:'primary.main'}}><Add/></IconButton></Tooltip>
    </Stack>}
    <NoticeDetailContent notice={n} app={app} actions={actions} expandedTaskIDs={expandedTaskIDs} onTaskExpandedChange={onTaskExpandedChange} onNoticeCompleted={celebrate} readOnly={readOnly} editing={editing} autoExpandSections={uiPreferences.expandAllDetails}/>
    {editing&&<Box sx={{display:'flex',justifyContent:'flex-end',mt:1.5}}><Button variant="contained" onClick={onEditingClose}>完成</Button></Box>}
   </Box></Collapse>
  </Box>
 </Paper></SwipeSurface></CorrectionProvider>;
}
