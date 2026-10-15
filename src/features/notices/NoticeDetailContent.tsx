import type {ReactNode} from 'react';
import {Accordion,AccordionDetails,AccordionSummary,Box,Button,Checkbox,Chip,Collapse,IconButton,Stack,Tooltip,Typography,useMediaQuery} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import ExpandMore from '@mui/icons-material/ExpandMore';
import NotificationsNone from '@mui/icons-material/NotificationsNone';
import {alpha} from '@mui/material/styles';
import {setTaskApplicable,taskAudience,toggleStep,toggleTask} from '../../domain/notice';
import {plainReadingText} from '../../domain/reading';
import type {Notice,NoteTarget} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {RichText} from '../../shared/ui/RichText';
import type {NoticeActions} from './NoticeCard';
import {displayTime,extraTimeline,formatDate,noticeOverview,sameHeadlineTime,summaryPreview,taskTime} from './notice-overview';
import {reminderReadingTitle} from './reminder-reading';
import {EvidenceLink} from './EvidenceLink';
import {evidenceFor} from '../../domain/source-evidence';

function Note({text,onClick,readOnly=false}:{text:string;onClick:()=>void;readOnly?:boolean}){
 return text?<Box component={readOnly?'div':'button'} onClick={readOnly?undefined:onClick} sx={{display:'block',border:'1px solid',borderColor:'divider',textAlign:'left',width:'100%',p:1.25,mt:1,borderRadius:'8px',bgcolor:'background.paper',color:'text.secondary',cursor:readOnly?'default':'pointer',fontSize:14,lineHeight:1.6,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</Box>:null;
}
function DetailSection({title,id,children,warning=false,reminder=false,titleEvidence}:{title:string;id:string;children:ReactNode;warning?:boolean;reminder?:boolean;titleEvidence?:ReactNode}){
 const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 return <Box sx={{position:'relative'}}><Accordion defaultExpanded={false} disableGutters elevation={0} slotProps={{transition:{unmountOnExit:true,timeout:reducedMotion?0:180}}} sx={{border:'1px solid',borderColor:'divider',borderLeftWidth:reminder?3:1,borderLeftColor:reminder?'secondary.main':'divider',bgcolor:reminder?theme=>alpha(theme.palette.secondary.main,.04):undefined,borderRadius:'8px!important','&:before':{display:'none'},overflow:'hidden'}}>
  <AccordionSummary expandIcon={<ExpandMore/>} id={`${id}-heading`} aria-controls={`${id}-content`} sx={{minHeight:48,'& .MuiAccordionSummary-content':{my:1,pr:titleEvidence?4.5:0}}}><Typography component="h3" sx={{fontSize:18,fontWeight:700,color:warning?'warning.main':reminder?'secondary.main':'text.primary'}}>{title}</Typography></AccordionSummary>
  <AccordionDetails sx={{pt:.5,minWidth:0}}>{children}</AccordionDetails>
 </Accordion>{titleEvidence&&<Box sx={{position:'absolute',right:42,top:8}}>{titleEvidence}</Box>}</Box>;
}

/** Each task has a separate button and checkbox; opening one never opens or completes its siblings. */
export function NoticeDetailContent({notice:n,app,actions,expandedTaskIDs,onTaskExpandedChange,onCollapse,readOnly=false}:{notice:Notice;app:CampusController;actions:NoticeActions;expandedTaskIDs:Set<string>;onTaskExpandedChange:(id:string)=>void;onCollapse:()=>void;readOnly?:boolean}){
 const overview=noticeOverview(n),preview=summaryPreview(n),timeline=extraTimeline(n),reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const noteButton=(target:NoteTarget,title:string,text:string)=>readOnly?null:<Tooltip title={text?'编辑笔记':'写笔记'}><IconButton aria-label={`给${title}写笔记`} onClick={()=>actions.note(n,target,title,text)} sx={{color:text?'primary.main':'text.secondary'}}><EditNote/></IconButton></Tooltip>;
 const evidence=(path:string)=>evidenceFor(n,path).segments.length?<EvidenceLink notice={n} path={path} onOpen={actions.evidence}/>:undefined;
 const sourcedWarning=(text:string,index:number)=><Box className="sourced-reading" sx={{display:'flex',alignItems:'flex-start',gap:.25,minWidth:0}}><Box sx={{flex:1,minWidth:0}}><RichText text={text}/></Box>{evidence(`warnings.${index}`)}</Box>;
 const reminderItem=(r:Notice['reminders'][number],index:number)=><DetailSection key={r.id} title={reminderReadingTitle({...r,title:n.reminderTitles?.[index]??('title' in r?String(r.title):undefined)},index)} id={`reminder-${r.id}`} reminder titleEvidence={evidence(`reminders.${index}`)??evidence(`reminderTitles.${index}`)}><Box className="reminder-item"><RichText text={r.text}/><Note readOnly={readOnly} text={r.note} onClick={()=>actions.note(n,{type:'reminder',reminderId:r.id},r.text,r.note)}/><Box sx={{display:'flex',justifyContent:'flex-end'}}>{noteButton({type:'reminder',reminderId:r.id},r.text,r.note)}</Box></Box></DetailSection>;
 return <Stack spacing={1.5}>
  {!!n.tasks.length&&<Box><Typography component="h3" sx={{mb:1,fontSize:18,fontWeight:700}}>待办</Typography>
   <Box className="task-list">{n.tasks.map((t,index)=>{
    const expanded=expandedTaskIDs.has(t.id),bodyID=`task-body-${t.id}`,audience=t.scope==='role'&&t.condition?`${taskAudience(t)} · ${t.condition}`:taskAudience(t);
    const audienceHint=t.dismissed?'不适用':t.scope==='role'?t.assignee&&Array.from(t.assignee).length<=22?t.assignee:'指定执行者':t.scope==='all'?'全体同学':t.condition&&Array.from(t.condition).length<=22?t.condition:t.scope==='conditional'?'条件适用':'对象待确认';
    const showAudience=audience!==audienceHint&&(overview.audiences.length!==1||Array.from(overview.audiences[0]??'').length>28);
    const showAudienceHint=t.dismissed||overview.audiences.length!==1||overview.audiences[0]!==audience||Array.from(audience).length>28;
    const ownTime=taskTime(t),showTime=!!ownTime&&!sameHeadlineTime(ownTime,n),showMeta=showAudienceHint||showTime||t.steps.length>0;
    const taskEvidence=evidence(`tasks.${index}.text`);
    return <Box key={t.id} className="task-item" sx={{opacity:t.dismissed?.6:1,borderTop:index?'1px solid':'none',borderColor:'divider',py:.75}}>
     <Stack direction="row" sx={{alignItems:'flex-start',gap:.25}}>
      <Checkbox checked={t.completed} disabled={readOnly||t.dismissed} onChange={()=>app.act(n.id,v=>toggleTask(v,t.id),t.completed?'已恢复待办':'已完成事项')} slotProps={{input:{'aria-label':`完成：${t.text}`}}} sx={{ml:-1,mt:.1}}/>
      <Box sx={{flex:1,minWidth:0}}>
       <Stack direction="row" sx={{alignItems:'flex-start',gap:.25}}><Button className="task-expand" aria-expanded={expanded} aria-controls={bodyID} aria-label={`${expanded?'收起事项':'展开事项'}：${plainReadingText(t.text)}`} onClick={()=>onTaskExpandedChange(t.id)} endIcon={<ExpandMore sx={{transform:expanded?'rotate(180deg)':'none'}}/>} sx={{flex:1,minWidth:0,justifyContent:'space-between',textAlign:'left',borderRadius:'8px',px:.75,py:1,gap:1,color:'text.primary','& .MuiButton-endIcon':{ml:0,color:'text.secondary'}}}>
        <Typography component="span" sx={{fontSize:{xs:18,sm:20},fontWeight:700,lineHeight:1.5,overflowWrap:'anywhere',textDecoration:t.completed?'line-through':'none',color:t.completed?'text.secondary':'text.primary'}}>{plainReadingText(t.text)}</Typography>
       </Button>{taskEvidence&&<Box sx={{mt:.75}}>{taskEvidence}</Box>}</Stack>
       {showMeta&&<Stack direction="row" className="task-meta" sx={{gap:.75,px:.75,mt:.25,mb:.5,flexWrap:'wrap',alignItems:'center'}}>
        {showAudienceHint&&<Chip size="small" label={audienceHint} color={t.scope==='all'?'primary':'warning'} variant="outlined" sx={{maxWidth:'100%',height:'auto',minHeight:24,'& .MuiChip-label':{fontSize:12,lineHeight:1.5,whiteSpace:'normal',overflowWrap:'anywhere',py:.25}}}/>}
        {showTime&&<Typography component="div" className="task-time" title={ownTime} sx={{fontSize:14,fontWeight:600,color:'primary.main',overflowWrap:'anywhere'}}>{displayTime(ownTime)}</Typography>}
        {t.steps.length>0&&<Typography aria-label={`已完成${t.steps.filter(step=>step.completed).length}步，共${t.steps.length}步`} sx={{fontSize:12,color:'text.secondary'}}>{t.steps.filter(step=>step.completed).length}/{t.steps.length}</Typography>}
       </Stack>}
      </Box>
     </Stack>
     <Collapse in={expanded} timeout={reducedMotion?0:180} unmountOnExit><Box id={bodyID} className="task-content" sx={{ml:{xs:0,sm:5.5},mt:1,p:1.5,borderLeft:'2px solid',borderColor:'primary.main',bgcolor:'action.hover',borderRadius:'0 8px 8px 0'}}>
      {showAudience&&<Box className="task-audience" sx={{mb:1.5,pl:1,borderLeft:'2px solid',borderColor:'warning.main'}}><Typography sx={{fontSize:13,fontWeight:700,color:'warning.main'}}>适用条件</Typography><Typography component="div" sx={{fontSize:15,lineHeight:1.65,overflowWrap:'anywhere'}}>{audience}</Typography></Box>}
      {t.location&&overview.locations.length!==1&&<Typography component="div" sx={{mb:1,fontSize:14,color:'text.secondary',overflowWrap:'anywhere'}}><RichText text={t.location}/></Typography>}
      {t.details.map((detail,i)=><Typography component="div" key={i} sx={{mt:i?.75:0,fontSize:16,color:'text.secondary'}}><RichText text={detail}/></Typography>)}
      {!!t.steps.length&&<Stack component="ol" className="task-steps" sx={{mt:t.details.length?1.5:0,mb:0,p:0,listStyle:'none'}}>{t.steps.map((step,stepIndex)=><Box component="li" key={step.id} className="task-step" sx={{py:1,borderTop:stepIndex?'1px solid':'none',borderColor:'divider'}}>
       <Stack direction="row" sx={{alignItems:'flex-start',gap:.25}}>
        <Checkbox disabled={readOnly||t.dismissed} checked={step.completed} onChange={()=>app.act(n.id,v=>toggleStep(v,t.id,step.id),step.completed?'已恢复步骤':'已完成步骤')} slotProps={{input:{'aria-label':`完成步骤${stepIndex+1}：${step.text}`}}} sx={{ml:-1.5,mt:-1.25}}/>
        <Typography component="div" sx={{flex:1,minWidth:0,fontSize:16,fontWeight:600,lineHeight:1.6,textDecoration:step.completed?'line-through':'none',color:step.completed?'text.secondary':'text.primary'}}><Box component="span" sx={{color:'primary.main',mr:.5}}>{stepIndex+1}.</Box><RichText text={step.text} inline/></Typography>
       </Stack>
       {step.details.map((detail,i)=><Typography component="div" key={i} sx={{mt:.5,fontSize:15,color:'text.secondary'}}><RichText text={detail}/></Typography>)}
       <Note readOnly={readOnly} text={step.note} onClick={()=>actions.note(n,{type:'step',taskId:t.id,stepId:step.id},step.text,step.note)}/>
       <Box sx={{display:'flex',justifyContent:'flex-end'}}>{noteButton({type:'step',taskId:t.id,stepId:step.id},step.text,step.note)}</Box>
      </Box>)}</Stack>}
      <Note readOnly={readOnly} text={t.note} onClick={()=>actions.note(n,{type:'task',taskId:t.id},t.text,t.note)}/>
      {!readOnly&&<Stack direction="row" sx={{mt:1,gap:1,alignItems:'center',justifyContent:'flex-end',flexWrap:'wrap'}}>
       {(t.scope!=='all'||t.dismissed)&&<Button size="small" variant="text" color="inherit" onClick={()=>app.act(n.id,v=>setTaskApplicable(v,t.id,t.dismissed),t.dismissed?'已恢复事项':'此项不适用')} sx={{fontSize:13,borderRadius:'8px'}}>{t.dismissed?'恢复此项':'不适用'}</Button>}
       <Tooltip title="创建提醒"><span><IconButton aria-label={`创建提醒：${plainReadingText(t.text)}`} disabled={t.completed||t.dismissed} onClick={()=>actions.calendar(n,t)}><NotificationsNone fontSize="small"/></IconButton></span></Tooltip>
       {noteButton({type:'task',taskId:t.id},t.text,t.note)}
      </Stack>}
     </Box></Collapse>
    </Box>;
   })}</Box>
  </Box>}
  {preview.more&&<DetailSection title="补充简介" id={`summary-${n.id}`}><RichText text={preview.full}/></DetailSection>}
  {!!n.reminders.length&&<Box className="reminder-list"><Stack direction="row" sx={{alignItems:'center',gap:.75,mb:1,color:'secondary.main'}}><NotificationsNone fontSize="small"/><Typography component="h3" sx={{fontSize:18,fontWeight:700}}>提醒</Typography><Typography sx={{fontSize:13,color:'text.secondary'}}>{n.reminders.length}</Typography></Stack><Stack spacing={1}>{n.reminders.slice(0,3).map(reminderItem)}{n.reminders.length>3&&<DetailSection title={`更多 ${n.reminders.length-3}`} id={`more-reminders-${n.id}`}><Stack spacing={1}>{n.reminders.slice(3).map((r,index)=>reminderItem(r,index+3))}</Stack></DetailSection>}</Stack></Box>}
  {!!timeline.length&&<DetailSection title={`时间 ${timeline.length}`} id={`timeline-${n.id}`}><Stack className="notice-timeline" spacing={1.5}>{timeline.map((item,index)=><Box key={index}><Typography component="div" sx={{fontSize:15,fontWeight:600}}><RichText text={item.label}/></Typography>{!!(item.timeText||item.time)&&<Typography component="div" sx={{mt:.25,fontSize:14,color:'text.secondary',overflowWrap:'anywhere'}}>{displayTime(item.timeText||(item.time?formatDate(item.time):''))}</Typography>}{item.location&&<Typography component="div" sx={{fontSize:14,color:'text.secondary'}}><RichText text={item.location}/></Typography>}</Box>)}</Stack></DetailSection>}
  {!!n.materials.length&&<DetailSection title={`材料 ${n.materials.length}`} id={`materials-${n.id}`}><Box component="ul" className="notice-materials" sx={{my:0,pl:2.5}}>{n.materials.map((text,index)=><Box component="li" key={index} sx={{mt:index?.75:0}}><RichText text={text}/></Box>)}</Box></DetailSection>}
  {!!n.warnings.length&&<DetailSection title={`注意 ${n.warnings.length}`} id={`warnings-${n.id}`} warning><Box component="ul" className="notice-warnings" sx={{my:0,pl:2.5}}>{n.warnings.map((text,index)=><Box component="li" key={index} sx={{mt:index?.75:0}}>{sourcedWarning(text,index)}</Box>)}</Box></DetailSection>}
  <Box sx={{pt:.75,borderTop:'1px solid',borderColor:'divider'}}><Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between'}}><Button onClick={onCollapse} aria-label="收起并返回标题" sx={{borderRadius:'8px'}}>收起</Button>{noteButton({type:'notice'},n.title,n.note)}</Stack><Note readOnly={readOnly} text={n.note} onClick={()=>actions.note(n,{type:'notice'},n.title,n.note)}/></Box>
 </Stack>;
}
