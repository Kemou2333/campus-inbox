import type {ReactNode} from 'react';
import {Accordion,AccordionDetails,AccordionSummary,Box,Button,Checkbox,Chip,Collapse,IconButton,Stack,Tooltip,Typography,useMediaQuery} from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import NotificationsNone from '@mui/icons-material/NotificationsNone';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import {alpha} from '@mui/material/styles';
import {taskAudience,toggleStep,toggleTask} from '../../domain/notice';
import {plainReadingText} from '../../domain/reading';
import type {Notice} from '../../domain/types';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Schedule from '@mui/icons-material/Schedule';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import {RichText} from '../../shared/ui/RichText';
import type {NoticeActions,NoticeCardController} from './NoticeCard';
import {displayTime,extraTimeline,formatDate,noticeOverview,sameHeadlineTime,summaryPreview,taskTime} from './notice-overview';
import {reminderReadingTitle} from './reminder-reading';
import {CorrectionTarget} from './CorrectionTarget';
import {HighlightedText} from '../../shared/ui/SearchHighlight';
import {noticeMotion} from './notice-motion';
import {compactDateLabel} from '../../domain/notice-priority';
import {isNewCompletion} from './completion-feedback';

function DetailSection({title,id,children,warning=false,reminder=false,titleEvidence,tone,icon,editing=false}:{title:ReactNode;id:string;children:ReactNode;warning?:boolean;reminder?:boolean;titleEvidence?:ReactNode;tone?:'info'|'primary';icon?:ReactNode;editing?:boolean}){
 const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const color=warning?'warning':reminder?'secondary':tone;
 if(editing)return <Box sx={{border:'1px solid',borderColor:color?`${color}.main`:'divider',borderLeftWidth:color?3:1,borderRadius:1,p:1.5}}><Typography component="h3" sx={{fontSize:18,fontWeight:700,mb:1.5,color:color?`${color}.main`:'text.primary'}}>{title}</Typography>{children}</Box>;
 return <Box sx={{position:'relative'}}><Accordion defaultExpanded={false} disableGutters elevation={0} slotProps={{transition:{unmountOnExit:true,timeout:reducedMotion?0:noticeMotion.duration,easing:noticeMotion.easing}}} sx={{border:'1px solid',borderColor:color?theme=>alpha(theme.palette[color].main,.28):'divider',borderLeftWidth:color?3:1,borderLeftColor:color?`${color}.main`:'divider',bgcolor:color?theme=>alpha(theme.palette[color].main,.04):undefined,borderRadius:'12px!important',transition:reducedMotion?'none':`border-color ${noticeMotion.transition}, background-color ${noticeMotion.transition}`,'&.Mui-expanded':{borderColor:color?theme=>alpha(theme.palette[color].main,.48):'divider',bgcolor:color?theme=>alpha(theme.palette[color].main,.065):'action.hover'},'&:before':{display:'none'},overflow:'hidden'}}>
  <AccordionSummary expandIcon={<ExpandMore/>} id={`${id}-heading`} aria-controls={`${id}-content`} sx={{minHeight:48,flexDirection:'row-reverse','& .MuiAccordionSummary-expandIconWrapper':{mr:1,ml:0,transition:reducedMotion?'none':`transform ${noticeMotion.transition}`},'& .MuiAccordionSummary-content':{my:1,pr:titleEvidence?4.5:0,alignItems:'center',gap:1}}}>{(warning||reminder||icon)&&<Box sx={{display:'flex',flexShrink:0,color:color?`${color}.main`:'text.secondary','& .MuiSvgIcon-root':{fontSize:20}}}>{warning?<WarningAmberOutlined/>:reminder?<NotificationsNone/>:icon}</Box>}<Typography component="h3" sx={{fontSize:reminder?17:16,fontWeight:700,lineHeight:1.55,color:color?`${color}.main`:'text.primary'}}>{title}</Typography></AccordionSummary>
  <AccordionDetails sx={{pt:.5,minWidth:0}}>{children}</AccordionDetails>
 </Accordion>{titleEvidence&&<Box sx={{position:'absolute',right:42,top:8}}>{titleEvidence}</Box>}</Box>;
}

/** Each task has a separate button and checkbox; opening one never opens or completes its siblings. */
export function NoticeDetailContent({notice:n,app,actions,expandedTaskIDs,onTaskExpandedChange,onNoticeCompleted,readOnly=false,editing=false}:{notice:Notice;app:Pick<NoticeCardController,'act'>;actions:NoticeActions;expandedTaskIDs:Set<string>;onTaskExpandedChange:(id:string)=>void;onNoticeCompleted?:(anchor?:HTMLElement)=>void;readOnly?:boolean;editing?:boolean}){
 function changeTask(taskID:string,change:(notice:Notice)=>Notice,text:string,anchor?:HTMLElement){const result=app.act(n.id,change,text);if(result){const task=result.after.tasks.find(item=>item.id===taskID);if(task)actions.taskCompletionChanged?.(n.id,taskID,task.completed&&!task.dismissed);if(isNewCompletion(result))onNoticeCompleted?.(anchor);}}
 const overview=noticeOverview(n),preview=summaryPreview(n),timeline=extraTimeline(n),reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const evidence=(_path:string)=>undefined;
 const sourcedWarning=(text:string,index:number)=><Box className="sourced-reading" sx={{display:'flex',alignItems:'flex-start',gap:.25,minWidth:0}}><Box sx={{flex:1,minWidth:0}}><CorrectionTarget path={`warnings.${index}`} label={`注意 ${index+1}`}><RichText text={text}/></CorrectionTarget></Box>{evidence(`warnings.${index}`)}</Box>;
 const reminderItem=(r:Notice['reminders'][number],index:number)=><DetailSection key={r.id} editing={editing} title={<CorrectionTarget inline path={n.reminderTitles?.[index]!==undefined?`reminderTitles.${index}`:`reminders.${index}`} label={`提醒 ${index+1}标题`}><HighlightedText text={reminderReadingTitle({...r,title:n.reminderTitles?.[index]??('title' in r?String(r.title):undefined)},index)}/></CorrectionTarget>} id={`reminder-${r.id}`} reminder titleEvidence={evidence(`reminders.${index}`)??evidence(`reminderTitles.${index}`)}><Box className="reminder-item" sx={{fontSize:15,lineHeight:1.85,color:'text.primary','& .rich-text > :first-of-type':{mt:0},'& .rich-text strong':{color:'secondary.main'},'& .rich-text p':{my:.75}}}><CorrectionTarget path={`reminders.${index}`} label={`提醒 ${index+1}`}><RichText text={r.text}/></CorrectionTarget></Box></DetailSection>;
 const savedNotes=[{label:'通知',text:n.note},...n.tasks.flatMap(t=>[{label:t.text,text:t.note},...t.steps.map(x=>({label:x.text,text:x.note}))]),...n.reminders.map(r=>({label:r.text,text:r.note}))].filter(x=>x.text.trim());
 return <Stack spacing={1.5}>
  {!!n.deadlineText&&!compactDateLabel(n.deadlineText,n.deadlineSpec,n.localDeadline||n.deadline)&&<Typography sx={{fontSize:14,color:'text.secondary'}}>时间：<HighlightedText text={n.deadlineText}/></Typography>}
  {!!n.tasks.length&&<Box>
   <Box className="task-list">{n.tasks.map((t,index)=>{
    const expanded=editing||expandedTaskIDs.has(t.id),bodyID=`task-body-${t.id}`,audience=t.scope==='role'&&t.condition?`${taskAudience(t)} · ${t.condition}`:taskAudience(t);
        const showAudience=t.scope==='all'||!!(t.scope==='role'&&t.assignee?.trim())||!!(t.scope==='conditional'&&t.condition.trim());
    const ownTime=compactDateLabel(t.localDeadline?'':t.timeText,t.localDeadline?undefined:t.timeSpec,t.localDeadline||t.time),showTime=!!ownTime&&ownTime!==compactDateLabel(overview.times[0]??'',n.localDeadline?undefined:n.deadlineSpec,n.localDeadline||n.deadline),showMeta=showTime||t.steps.length>0;
    const taskEvidence=evidence(`tasks.${index}.text`);
    return <Box key={t.id} className="task-item" sx={{opacity:t.dismissed?.6:1,border:'1px solid',borderColor:'divider',mt:index?'10px':0,py:'6px',px:'10px',borderRadius:'11px',bgcolor:theme=>theme.palette.mode==='dark'?'#181f2b':'#f6f8f7',transition:reducedMotion?'none':`border-color ${noticeMotion.transition}, background-color ${noticeMotion.transition}, opacity ${noticeMotion.transition}`}}>
     <Stack direction="row" sx={{alignItems:'flex-start',gap:.25}}>
      <Checkbox color="success" checked={t.completed} disabled={readOnly||editing||t.dismissed} onChange={event=>changeTask(t.id,v=>toggleTask(v,t.id),t.completed?'已恢复待办':'已完成事项',event.currentTarget)} slotProps={{input:{'aria-label':`完成：${t.text}`}}} sx={{width:34,height:44,p:'6px',ml:0,mt:.1,'& .MuiSvgIcon-root':{fontSize:23,transition:reducedMotion?'none':`color ${noticeMotion.transition}`},'&.Mui-disabled.Mui-checked':{color:'success.main'}}}/>
      <Box sx={{flex:1,minWidth:0}}>
       <Stack direction="row" sx={{alignItems:'flex-start',gap:.25}}>{editing?<Box sx={{flex:1,minWidth:0,px:.25,py:1}}><CorrectionTarget path={`tasks.${index}.text`} label={`待办 ${index+1}标题`}><Typography component="span" sx={{fontSize:17,fontWeight:750,lineHeight:1.5,overflowWrap:'anywhere'}}><HighlightedText text={plainReadingText(t.text)}/></Typography></CorrectionTarget></Box>:<Button className="task-expand" aria-expanded={expanded} aria-controls={bodyID} aria-label={`${expanded?'收起事项':'展开事项'}：${plainReadingText(t.text)}`} onClick={()=>onTaskExpandedChange(t.id)} startIcon={<ExpandMore sx={{transform:expanded?'rotate(180deg)':'none',transition:reducedMotion?'none':`transform ${noticeMotion.transition}`}}/>} sx={{flex:1,minWidth:0,justifyContent:'flex-start',textAlign:'left',borderRadius:'8px',px:.25,py:1,gap:1,color:'text.primary','& .MuiButton-startIcon':{ml:0,mr:0,color:'text.secondary'}}}>
        <Typography component="span" sx={{fontSize:17,fontWeight:750,lineHeight:1.5,overflowWrap:'anywhere',textDecoration:t.completed?'line-through':'none',color:t.completed?'success.main':'text.primary'}}><HighlightedText text={plainReadingText(t.text)}/></Typography>
       </Button>}{taskEvidence&&<Box sx={{mt:.75}}>{taskEvidence}</Box>}</Stack>
       {!editing&&showMeta&&<Stack direction="row" className="task-meta" sx={{gap:.75,px:.25,mt:.25,mb:.5,flexWrap:'wrap',alignItems:'center'}}>
        {showTime&&<Typography component="div" className="task-time" title={ownTime} sx={{fontSize:14,fontWeight:600,color:'info.main',overflowWrap:'anywhere'}}><HighlightedText text={displayTime(ownTime)}/></Typography>}
        {t.steps.length>0&&<Typography aria-label={`已完成${t.steps.filter(step=>step.completed).length}步，共${t.steps.length}步`} sx={{fontSize:12,color:'text.secondary'}}>{t.steps.filter(step=>step.completed).length}/{t.steps.length}</Typography>}
       </Stack>}
      </Box>
     </Stack>
     <Collapse in={expanded} timeout={reducedMotion?0:noticeMotion.duration} easing={noticeMotion.easing} unmountOnExit><Box id={bodyID} className="task-content" sx={{m:0,mt:.75,pt:1.25,px:.5,pb:.5,borderTop:'1px solid',borderColor:theme=>alpha(theme.palette[t.completed?'success':'primary'].main,.16),minWidth:0}}>
      {editing&&<Stack spacing={1.25} sx={{mb:1.5}}><CorrectionTarget path={`tasks.${index}.scope`} label={`待办 ${index+1}适用范围`}>{t.scope==='all'?'全体同学':t.scope==='conditional'?'符合条件的同学':t.scope==='role'?'指定对象':'对象待确认'}</CorrectionTarget><CorrectionTarget path={`tasks.${index}.assignee`} label={`待办 ${index+1}对象`}>{t.assignee||'添加对象'}</CorrectionTarget><CorrectionTarget path={`tasks.${index}.condition`} label={`待办 ${index+1}条件`}>{t.condition||'添加条件'}</CorrectionTarget><CorrectionTarget path={`tasks.${index}.timeText`} label={`待办 ${index+1}时间`}>{t.timeText||'添加时间'}</CorrectionTarget></Stack>}
      {!editing&&!ownTime&&t.timeText&&<Typography sx={{mb:1.25,fontSize:14,color:'text.secondary'}}>时间：<HighlightedText text={t.timeText}/></Typography>}
      {!editing&&showAudience&&<Box className="task-audience" sx={{mb:1.5,pl:1,borderLeft:'2px solid',borderColor:'warning.main'}}><Typography sx={{fontSize:13,fontWeight:700,color:'warning.main'}}>适用条件</Typography><Typography component="div" sx={{fontSize:15,lineHeight:1.65,overflowWrap:'anywhere'}}><HighlightedText text={audience}/></Typography></Box>}
      {(editing||t.location&&overview.locations.length!==1)&&<Typography component="div" sx={{mb:1,fontSize:14,color:'text.secondary',overflowWrap:'anywhere'}}><CorrectionTarget path={`tasks.${index}.location`} label={`待办 ${index+1}地点`}><RichText text={t.location||'添加地点'}/></CorrectionTarget></Typography>}
      {t.details.map((detail,i)=><Typography component="div" key={i} sx={{mt:i?.75:0,fontSize:15,lineHeight:1.9,color:'text.secondary'}}><CorrectionTarget path={`tasks.${index}.details.${i}`} label={`待办 ${index+1}说明 ${i+1}`}><RichText text={detail}/></CorrectionTarget></Typography>)}
      {!!t.steps.length&&<Stack component="ol" className="task-steps" sx={{mt:t.details.length?1.5:0,mb:0,p:0,listStyle:'none'}}>{t.steps.map((step,stepIndex)=><Box component="li" key={step.id} className="task-step" sx={{py:1,borderTop:stepIndex?'1px solid':'none',borderColor:'divider'}}>
       <Stack direction="row" sx={{alignItems:'flex-start',gap:.25}}>
        <Checkbox color="success" disabled={readOnly||editing||t.dismissed} checked={step.completed} onChange={event=>changeTask(t.id,v=>toggleStep(v,t.id,step.id),step.completed?'已恢复步骤':'已完成步骤',event.currentTarget)} slotProps={{input:{'aria-label':`完成步骤${stepIndex+1}：${step.text}`}}} sx={{ml:-1.5,mt:-1.25,'&.Mui-disabled.Mui-checked':{color:'success.main'}}}/>
        <Typography component="div" sx={{flex:1,minWidth:0,fontSize:16,fontWeight:600,lineHeight:1.6,textDecoration:step.completed?'line-through':'none',color:step.completed?'success.main':'text.primary'}}><Box component="span" sx={{color:'primary.main',mr:.5}}>{stepIndex+1}.</Box><CorrectionTarget inline path={`tasks.${index}.steps.${stepIndex}.text`} label={`步骤 ${stepIndex+1}`}><RichText text={step.text} inline/></CorrectionTarget></Typography>
       </Stack>
       {step.details.map((detail,i)=><Typography component="div" key={i} sx={{mt:.5,fontSize:15,color:'text.secondary'}}><CorrectionTarget path={`tasks.${index}.steps.${stepIndex}.details.${i}`} label={`步骤 ${stepIndex+1}说明 ${i+1}`}><RichText text={detail}/></CorrectionTarget></Typography>)}
      </Box>)}</Stack>}
     </Box></Collapse>
    </Box>;
   })}</Box>
  </Box>}
  {!editing&&preview.more&&<DetailSection title="补充简介" id={`summary-${n.id}`}><CorrectionTarget path="summary" label="简介"><RichText text={preview.full}/></CorrectionTarget></DetailSection>}
  {!!n.reminders.length&&<Box className="reminder-list"><Stack direction="row" sx={{alignItems:'center',gap:.75,mb:1,color:'secondary.main'}}><NotificationsNone fontSize="small"/><Typography component="h3" sx={{fontSize:14,fontWeight:700,letterSpacing:'.04em'}}>提醒</Typography><Typography sx={{fontSize:13,color:'text.secondary'}}>{n.reminders.length}</Typography></Stack><Stack spacing={1}>{n.reminders.slice(0,3).map(reminderItem)}{n.reminders.length>3&&<DetailSection editing={editing} title={`更多 ${n.reminders.length-3}`} id={`more-reminders-${n.id}`}><Stack spacing={1}>{n.reminders.slice(3).map((r,index)=>reminderItem(r,index+3))}</Stack></DetailSection>}</Stack></Box>}
  {!!(editing?n.timeline:timeline).length&&<DetailSection editing={editing} title={`时间 ${(editing?n.timeline:timeline).length}`} id={`timeline-${n.id}`} tone="info" icon={<Schedule/>}><Stack className="notice-timeline" spacing={1.5}>{(editing?n.timeline:timeline).map((item,index)=><Box key={index}><Typography component="div" sx={{fontSize:15,fontWeight:600}}><CorrectionTarget path={`timeline.${n.timeline.indexOf(item)}.label`} label={`时间 ${index+1}标题`}><RichText text={item.label}/></CorrectionTarget></Typography>{(editing||item.timeText||item.time)&&<Typography component="div" sx={{mt:.25,fontSize:14,color:'text.secondary',overflowWrap:'anywhere'}}><CorrectionTarget path={`timeline.${n.timeline.indexOf(item)}.timeText`} label={`时间 ${index+1}日期`}><HighlightedText text={displayTime(item.timeText||(item.time?formatDate(item.time):'添加时间'))}/></CorrectionTarget></Typography>}{(editing||item.location)&&<Typography component="div" sx={{fontSize:14,color:'text.secondary'}}><CorrectionTarget path={`timeline.${n.timeline.indexOf(item)}.location`} label={`时间 ${index+1}地点`}><RichText text={item.location||'添加地点'}/></CorrectionTarget></Typography>}</Box>)}</Stack></DetailSection>}
  {!!n.materials.length&&<DetailSection editing={editing} title={`材料 ${n.materials.length}`} id={`materials-${n.id}`} tone="primary" icon={<Inventory2Outlined/>}><Box component="ul" className="notice-materials" sx={{my:0,pl:2.5}}>{n.materials.map((text,index)=><Box component="li" key={index} sx={{mt:index?.75:0}}><CorrectionTarget path={`materials.${index}`} label={`材料 ${index+1}`}><RichText text={text}/></CorrectionTarget></Box>)}</Box></DetailSection>}
  {!!n.warnings.length&&<DetailSection editing={editing} title={`注意 ${n.warnings.length}`} id={`warnings-${n.id}`} warning><Box component="ul" className="notice-warnings" sx={{my:0,pl:2.5}}>{n.warnings.map((text,index)=><Box component="li" key={index} sx={{mt:index?.75:0}}>{sourcedWarning(text,index)}</Box>)}</Box></DetailSection>}
  {!!savedNotes.length&&<DetailSection title="笔记" id={`notes-${n.id}`}><Stack spacing={1.5}>{savedNotes.map((note,index)=><Box key={index}><Typography sx={{fontSize:13,color:'text.secondary',mb:.5}}>{note.label}</Typography><Typography sx={{fontSize:15,whiteSpace:'pre-wrap'}}><HighlightedText text={note.text}/></Typography></Box>)}</Stack></DetailSection>}
  {!editing&&<Box sx={{pt:.75,borderTop:'1px solid',borderColor:'divider'}}>
   <Stack className="notice-bottom-actions" direction="row" sx={{alignItems:'center',gap:.5,mt:n.note?1:0}}>
    <Tooltip title="原文与附件"><Button size="small" startIcon={<MenuBookOutlined/>} aria-label={`原文与附件：${n.title}`} onClick={()=>actions.details(n)} sx={{minHeight:44,px:1}}>原文</Button></Tooltip>
    <Box sx={{flex:1}}/>
   </Stack>
  </Box>}
 </Stack>;
}
