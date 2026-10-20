import {useEffect,useRef,useState} from 'react';
import {Box,Button,Chip,Collapse,IconButton,Paper,Stack,SvgIcon,Tooltip,Typography,useMediaQuery} from '@mui/material';
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
import {alpha} from '@mui/material/styles';
import {getNoticeStatus,priority,setFavorite,setNoticeApplicable,setNoticeCompleted} from '../../domain/notice';
import type {Notice,NoteTarget,Task} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {RichText} from '../../shared/ui/RichText';
import {plainReadingText} from '../../domain/reading';
import {compactHeadlineTime,noticeOverview,summaryPreview} from './notice-overview';
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
function NoticeToolIcon({kind}:{kind:'question'|'correct'|'share'|'remind'}){
 const paths={question:['M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z','M9.5 8a2.5 2.5 0 1 1 3.4 2.3c-.9.4-1.4 1-1.4 2M11.5 15h.01'],correct:['M13 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8','m9 15 1-4L18 3a2 2 0 0 1 3 3l-8 8-4 1Zm7-10 3 3'],share:['M5 11v9h14v-9M12 3v12m-4-8 4-4 4 4'],remind:['M4 3 1 7m19-4 3 4M12 9v4l3 2']};
 return <SvgIcon viewBox="0 0 24 24" sx={{fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round'}}>{kind==='remind'&&<circle cx="12" cy="13" r="8"/>}{paths[kind].map((d,i)=><path key={i} d={d}/>)}</SvgIcon>;
}
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
 const time=compactHeadlineTime(overview.times[0]??''),deadline=!!(n.localDeadline||n.deadlineText||n.deadline),tone=done?'success':p.level==='overdue'?'error':p.label?'warning':'info';
 function favorite(){if(app.act(n.id,v=>setFavorite(v,!v.favorite),n.favorite?'已取消收藏':'已收藏'))setFavoritePulse(value=>value+1);}
 function celebrate(anchor?:HTMLElement){
  const source=anchor??completeButton.current,rect=source?.getBoundingClientRect();
  setCompletePulse(value=>value+1);
  if(rect){setCelebration({x:rect.left+rect.width/2,y:rect.top+rect.height/2,key:Date.now()});if(feedbackTimer.current!==null)clearTimeout(feedbackTimer.current);feedbackTimer.current=setTimeout(()=>{feedbackTimer.current=null;setCelebration(null);},reducedMotion?750:1500);}
  actions.completionChanged?.(n.id,source??undefined);
 }
 function complete(){const result=app.act(n.id,v=>setNoticeCompleted(v,!done),done?'已恢复':'已完成');if(isNewCompletion(result))celebrate(completeButton.current??undefined);else if(result)setCompletePulse(value=>value+1);}
 return <CorrectionProvider value={{editing:editing&&!readOnly,onEdit:path=>actions.correct(n,path)}}><Paper component="article" variant="outlined" id={`notice-${n.id}`} className="notice-card" inert={disabled||undefined} aria-labelledby={`notice-heading-${n.id}`} sx={{p:{xs:'18px',sm:'21px'},borderRadius:'17px',borderWidth:1,borderColor:'divider',boxShadow:theme=>theme.palette.mode==='dark'?'0 6px 18px #0002':'0 4px 10px #13332503',transition:reducedMotion?'none':`border-color ${noticeMotion.transition}, box-shadow ${noticeMotion.transition}, background-color ${noticeMotion.transition}`,pointerEvents:disabled?'none':undefined}}>
  {editing&&<Stack direction="row" sx={{alignItems:'center',gap:1,mb:1.5,p:1,borderRadius:1,bgcolor:theme=>alpha(theme.palette.primary.main,.09)}}><Typography sx={{flex:1,fontSize:14,fontWeight:600,color:'primary.main'}}>点文字修改</Typography>{!!n.corrections?.values.length&&<Button size="small" color="warning" onClick={()=>app.act(n.id,current=>{if(current.updatedAt!==n.updatedAt)throw new Error('通知已更新，请重新进入修正。');return restoreAIContent(current);},'已恢复初稿')}>恢复初稿</Button>}<Button size="small" variant="contained" onClick={onEditingClose}>完成</Button></Stack>}
  <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:1,mb:'11px'}}>
   <Stack direction="row" sx={{alignItems:'center',gap:1}}>{unread&&!readOnly&&<Box component="span" role="img" aria-label="未读通知" title="未读" sx={{width:9,height:9,borderRadius:'50%',bgcolor:'info.main',flexShrink:0}}/>}<Chip size="small" icon={status==='completed'?<CheckCircle/>:n.kind!=='task'?<NotificationsNone/>:undefined} label={p.label&&!done?p.label:done?(status==='dismissed'?'与我无关':'已完成'):n.kind==='task'?'待办':'提醒'} color={status==='completed'?'success':done?'default':p.label?(p.level==='overdue'?'error':'warning'):n.kind==='task'?'primary':'secondary'} variant={status==='completed'||n.kind!=='task'&&!done||p.label&&!done?'filled':'outlined'}/></Stack>
   <Stack direction="row" sx={{alignItems:'center',gap:.5}}>{readOnly?n.favorite&&<Star aria-label="已收藏" sx={{color:'warning.main',fontSize:25}}/>:<Tooltip title={n.favorite?'取消收藏':'收藏通知'}><IconButton className="notice-favorite" aria-label={n.favorite?'取消收藏通知':'收藏通知'} aria-pressed={!!n.favorite} disabled={disabled||editing} onClick={favorite} sx={{color:n.favorite?'warning.main':'text.secondary','& .MuiSvgIcon-root':{fontSize:27},bgcolor:n.favorite?theme=>alpha(theme.palette.warning.main,.1):'transparent',transition:reducedMotion?'none':`color ${noticeMotion.transition}, background-color ${noticeMotion.transition}`,'&.Mui-focusVisible':{outline:'2px solid',outlineColor:'warning.main',outlineOffset:2}}}><Box component="span" key={favoritePulse} sx={{display:'flex',animation:favoritePulse&&!reducedMotion?`${favoriteFeedback} 620ms ${noticeMotion.easing.enter}`:'none'}}>{n.favorite?<Star/>:<StarBorder/>}</Box></IconButton></Tooltip>}{overview.notes&&<Tooltip title="已有笔记"><EditNote aria-label="已有笔记" sx={{fontSize:20,color:'primary.main'}}/></Tooltip>}{overview.total>0&&<Typography variant="body2" color={overview.completed?'success.main':'text.secondary'} sx={{fontVariantNumeric:'tabular-nums',fontWeight:overview.completed?700:400}} aria-label={`已完成${overview.completed}项任务，共${overview.total}项任务`}>{overview.completed}/{overview.total}</Typography>}</Stack>
  </Stack>
  <Typography component="h2" className="notice-heading" id={`notice-heading-${n.id}`} sx={{m:0,p:0,textIndent:0,mb:'10px',fontSize:{xs:28,sm:32},fontWeight:790,lineHeight:1.38,letterSpacing:'-.6px',textWrap:'pretty',overflowWrap:'anywhere'}}><CorrectionTarget inline path="title" label="标题"><HighlightedText text={n.title}/></CorrectionTarget></Typography>
  {(showSummary||editing)&&<Typography component="div" className="notice-summary" color="text.secondary" sx={{mt:0,mb:'15px',mx:0,p:0,textIndent:0,fontSize:16,lineHeight:1.7,'& > .rich-text':{m:0,p:0},'& .rich-text > p':{ml:0,textIndent:0}}}><CorrectionTarget path="summary" label="简介"><RichText text={editing?n.summary:preview.text}/></CorrectionTarget></Typography>}
  {editing&&<Box sx={{mt:1.25,fontSize:15,color:'info.main'}}><CorrectionTarget path="deadlineText" label="截止描述">{n.deadlineText||'添加截止描述'}</CorrectionTarget></Box>}
  {!editing&&<Stack direction="row" className="notice-meta" sx={{mt:0,gap:'8px',flexWrap:'wrap',alignItems:'flex-start'}}>
   {!!overview.audiences.length&&<Chip className="notice-audience-preview" icon={<PeopleOutlined/>} size="small" label={<HighlightedText text={audience}/>} title={overview.audiences.length===1?overview.audiences[0]:`${overview.audiences.length}类适用对象`} variant="filled" sx={{maxWidth:'100%',minWidth:0,height:'auto',minHeight:28,border:0,borderRadius:'7px',bgcolor:theme=>theme.palette.mode==='dark'?'#3a3327':'#fff5df',color:theme=>theme.palette.mode==='dark'?'#efc982':'#98600b','& .MuiChip-label':{fontSize:{xs:12,sm:13},fontWeight:650,lineHeight:1.5,whiteSpace:'normal',overflowWrap:'anywhere',px:'8px',py:'5px'},'& .MuiChip-icon':{fontSize:17,color:'inherit',alignSelf:'flex-start',ml:'7px',mt:'5px'}}}/>}
   {!!time&&<Chip className="notice-time-preview" icon={<Schedule/>} size="small" label={<HighlightedText text={`${deadline?'截止 ':''}${time}`}/>} title={time} variant="filled" sx={{maxWidth:'100%',minWidth:0,height:'auto',minHeight:28,border:0,borderRadius:'7px',fontVariantNumeric:'tabular-nums',bgcolor:theme=>tone==='error'?(theme.palette.mode==='dark'?'#402f33':'#fff0eb'):(theme.palette.mode==='dark'?'#28374c':'#eef5fc'),color:theme=>tone==='error'?(theme.palette.mode==='dark'?'#f2b0a5':'#b45645'):(theme.palette.mode==='dark'?'#adcbf4':'#376b9c'),'& .MuiChip-label':{fontSize:{xs:12,sm:13},fontWeight:650,lineHeight:1.5,whiteSpace:'normal',overflowWrap:'anywhere',px:'8px',py:'5px'},'& .MuiChip-icon':{fontSize:17,color:'inherit',alignSelf:'flex-start',ml:'7px',mt:'5px'}}}/>}
   {time&&overview.times.length>1&&<Typography aria-label={`另有${overview.times.length-1}个时间`} sx={{fontSize:13,color:'text.secondary',alignSelf:'center'}}>+{overview.times.length-1}</Typography>}
  </Stack>}
  {!editing&&overview.locations.length===1&&<Stack direction="row" sx={{mt:.75,gap:.5,alignItems:'flex-start'}}><PlaceOutlined sx={{fontSize:18,mt:.2,color:'text.secondary'}}/><Typography sx={{fontSize:14,lineHeight:1.6,color:'text.secondary',overflowWrap:'anywhere',flex:1,minWidth:0}}><HighlightedText text={overview.locations[0]}/></Typography></Stack>}
  {!editing&&<Stack direction="row" className="notice-actions" sx={{alignItems:'center',gap:{xs:'7px',sm:'9px'},mt:'18px',pt:'14px',borderTop:'1px solid',borderColor:'divider',flexWrap:'wrap',rowGap:1}}>
   <Tooltip title={expanded?'收起详情':'查看详情'}><IconButton ref={expandButton} className="notice-expand" aria-expanded={expanded} aria-controls={bodyID} aria-label={`${expanded?'收起详情':'展开详情'}：${n.title}`} onClick={onExpandedChange} disabled={disabled} sx={{width:48,height:44,borderRadius:'10px',color:'primary.main',bgcolor:theme=>alpha(theme.palette.primary.main,.06),'&:hover':{bgcolor:'action.selected'},'& .MuiSvgIcon-root':{fontSize:27,transform:expanded?'rotate(180deg)':'none',transition:reducedMotion?'none':`transform ${noticeMotion.transition}`}}}><ExpandMore/></IconButton></Tooltip>
   <Box sx={{flex:1}}/>
   {!readOnly&&<><Button className="notice-dismiss" size="small" variant="outlined" color="inherit" startIcon={n.dismissed?<Undo/>:<Block/>} aria-label={n.dismissed?'恢复通知':'与我无关'} disabled={disabled||editing} onClick={()=>app.act(n.id,v=>setNoticeApplicable(v,v.dismissed),n.dismissed?'已恢复通知':'已设为与我无关，可撤销')} sx={{fontSize:13,fontWeight:500,borderRadius:'10px',minWidth:0,minHeight:36,px:.75,whiteSpace:'nowrap',color:n.dismissed?'primary.main':'text.secondary',borderColor:theme=>alpha(n.dismissed?theme.palette.primary.main:theme.palette.text.secondary,.3),bgcolor:theme=>alpha(theme.palette.text.primary,.025),transition:reducedMotion?'none':`border-color ${noticeMotion.transition}, background-color ${noticeMotion.transition}, color ${noticeMotion.transition}`,'& .MuiButton-startIcon':{ml:0,mr:.5,'& .MuiSvgIcon-root':{fontSize:16}},'&:hover':{borderColor:'text.secondary',bgcolor:'action.hover'}}}>{n.dismissed?'恢复':'与我无关'}</Button><Tooltip title={n.dismissed?'先恢复通知':done?'恢复':n.kind==='task'?'完成':'知悉'}><span><IconButton ref={completeButton} className="notice-complete" aria-label={n.dismissed?'完成':done?'恢复':n.kind==='task'?'完成':'知悉'} onClick={complete} disabled={disabled||n.dismissed} sx={{width:56,height:56,color:done?'success.main':'success.contrastText',bgcolor:done?theme=>alpha(theme.palette.success.main,.13):'success.main',border:'1px solid',borderColor:theme=>alpha(theme.palette.success.main,done?.4:.75),boxShadow:done?'none':theme=>`0 3px 8px ${alpha(theme.palette.success.main,.16)}`,transition:reducedMotion?'none':`background-color ${noticeMotion.transition}, color ${noticeMotion.transition}, box-shadow ${noticeMotion.transition}, transform ${noticeMotion.transition}`,'&:hover':{bgcolor:done?theme=>alpha(theme.palette.success.main,.2):'success.dark',transform:reducedMotion?'none':'translateY(-1px)'},'&.Mui-focusVisible':{outline:'2px solid',outlineColor:'success.main',outlineOffset:3},'&.Mui-disabled':{color:'text.disabled',bgcolor:'action.disabledBackground',borderColor:'divider',boxShadow:'none'},'& .MuiSvgIcon-root':{fontSize:32}}}><Box component="span" key={completePulse} sx={{display:'flex',animation:completePulse&&!reducedMotion?`${completeFeedback} 740ms ${noticeMotion.easing.enter}`:'none'}}>{done&&!n.dismissed&&!celebration?<Undo/>:<Check/>}</Box></IconButton></span></Tooltip>
   </>}
  </Stack>}
  <Box id={bodyID} className="notice-body" aria-hidden={!expanded}>
   <Collapse in={expanded} timeout={reducedMotion?0:noticeMotion.duration} easing={noticeMotion.easing} unmountOnExit><Box sx={{mt:'20px'}}>
    {!readOnly&&!editing&&<Stack className="notice-tools" direction="row" role="toolbar" aria-label="通知工具" sx={{alignItems:'center',justifyContent:'space-between',gap:'7px',mb:'16px',pt:'3px',pb:'14px',borderBottom:'1px solid',borderColor:'divider',flexWrap:'wrap'}}>
     <Stack className="notice-main-tools" direction="row" sx={{gap:'7px',flexShrink:0}}>
      {actions.question&&<Tooltip title="问这条通知"><Button className="notice-question-tool" startIcon={<NoticeToolIcon kind="question"/>} aria-label={`提问：${n.title}`} onClick={()=>actions.question?.(n)} sx={{width:76,minWidth:76,height:44,minHeight:44,p:'0 11px',gap:'4px',border:0,borderRadius:'11px',fontSize:13,fontWeight:650,color:theme=>theme.palette.mode==='dark'?'#adcbf4':'#376b9c',bgcolor:theme=>theme.palette.mode==='dark'?'#28374c':'#eef5fc','&:hover':{bgcolor:theme=>theme.palette.mode==='dark'?'#30415b':'#e3eefb'},'& .MuiButton-startIcon':{m:0},'& .MuiSvgIcon-root':{fontSize:24}}}>提问</Button></Tooltip>}
      {actions.share&&<Tooltip title="导出分享图"><Button className="notice-share-tool" startIcon={<NoticeToolIcon kind="share"/>} aria-label={`分享图：${n.title}`} onClick={()=>actions.share?.(n)} sx={{width:76,minWidth:76,height:44,minHeight:44,p:'0 11px',gap:'4px',border:0,borderRadius:'11px',fontSize:13,fontWeight:650,color:'primary.main',bgcolor:theme=>alpha(theme.palette.primary.main,.09),'&:hover':{bgcolor:theme=>alpha(theme.palette.primary.main,.15)},'& .MuiButton-startIcon':{m:0},'& .MuiSvgIcon-root':{fontSize:24}}}>导出</Button></Tooltip>}
     </Stack>
     <Stack className="notice-secondary-tools" direction="row" sx={{gap:'7px',ml:'auto',flexShrink:0,'& .MuiIconButton-root':{width:44,minWidth:44,maxWidth:44,height:44,minHeight:44,maxHeight:44,aspectRatio:'1 / 1',flex:'0 0 44px',p:'9px',border:'1px solid',borderColor:'divider',borderRadius:'11px',bgcolor:'background.paper',color:'text.secondary','&:hover':{borderColor:'text.secondary',bgcolor:'action.hover'},'& .MuiSvgIcon-root':{fontSize:24}}}}>
      <Tooltip title={n.note?'编辑笔记':'写笔记'}><IconButton className="notice-note-tool" aria-label={`笔记：${n.title}`} onClick={()=>actions.note(n,{type:'notice'},n.title,n.note)} sx={n.note?{'&&':{color:'primary.main',bgcolor:theme=>alpha(theme.palette.primary.main,.1),borderColor:theme=>alpha(theme.palette.primary.main,.3)}}:undefined}><EditNote/></IconButton></Tooltip>
      <Tooltip title="修正整理内容"><IconButton className="notice-correct-tool" aria-label={`修正：${n.title}`} onClick={()=>actions.correct(n)} sx={{'&&':{color:theme=>theme.palette.mode==='dark'?'#cbbbef':'#7663a0',bgcolor:theme=>theme.palette.mode==='dark'?'#373146':'#f3effb',borderColor:theme=>alpha(theme.palette.mode==='dark'?'#cbbbef':'#7663a0',.2),'&:hover':{bgcolor:theme=>theme.palette.mode==='dark'?'#443b56':'#eae3f8'}}}}><NoticeToolIcon kind="correct"/></IconButton></Tooltip>
      {n.kind==='task'&&<Tooltip title="创建提醒"><span style={{display:'inline-flex'}}><IconButton aria-label={`创建提醒：${n.title}`} disabled={done} onClick={()=>actions.calendar(n)}><NoticeToolIcon kind="remind"/></IconButton></span></Tooltip>}
     </Stack>
    </Stack>}
    <NoticeDetailContent notice={n} app={app} actions={actions} expandedTaskIDs={expandedTaskIDs} onTaskExpandedChange={onTaskExpandedChange} onNoticeCompleted={celebrate} onDelete={()=>app.remove(n.id)} readOnly={readOnly} editing={editing}/>
    {editing&&<Box sx={{display:'flex',justifyContent:'flex-end',mt:1.5}}><Button variant="contained" onClick={onEditingClose}>完成</Button></Box>}
   </Box></Collapse>
  </Box>
 </Paper>{celebration&&status==='completed'&&<CompletionCelebration point={celebration} reducedMotion={reducedMotion}/>}</CorrectionProvider>;
}
