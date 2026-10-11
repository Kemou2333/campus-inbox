import type {ReactNode} from 'react';
import {Accordion,AccordionDetails,AccordionSummary,Box,Button,Checkbox,Chip,Collapse,IconButton,Stack,Tooltip,Typography,useMediaQuery} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import ExpandMore from '@mui/icons-material/ExpandMore';
import {setTaskApplicable,taskAudience,toggleStep,toggleTask} from '../../domain/notice';
import {plainReadingText} from '../../domain/reading';
import type {Notice,NoteTarget} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {RichText} from '../../shared/ui/RichText';
import type {NoticeActions} from './NoticeCard';
import {displayTime,extraTimeline,formatDate,noticeOverview,sameHeadlineTime,summaryPreview,taskTime} from './notice-overview';

function Note({text,onClick}:{text:string;onClick:()=>void}){
 return text?<Box component="button" onClick={onClick} sx={{display:'block',border:'1px solid',borderColor:'divider',textAlign:'left',width:'100%',p:1.25,mt:1,borderRadius:'8px',bgcolor:'background.paper',color:'text.secondary',cursor:'pointer',fontSize:14,lineHeight:1.6,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</Box>:null;
}
function DetailSection({title,id,children,warning=false}:{title:string;id:string;children:ReactNode;warning?:boolean}){
 return <Accordion defaultExpanded={false} disableGutters elevation={0} slotProps={{transition:{unmountOnExit:true}}} sx={{border:'1px solid',borderColor:'divider',borderRadius:'8px!important','&:before':{display:'none'},overflow:'hidden'}}>
  <AccordionSummary expandIcon={<ExpandMore/>} id={`${id}-heading`} aria-controls={`${id}-content`} sx={{minHeight:48,'& .MuiAccordionSummary-content':{my:1}}}><Typography component="h3" sx={{fontSize:16,fontWeight:700,color:warning?'warning.main':'text.primary'}}>{title}</Typography></AccordionSummary>
  <AccordionDetails sx={{pt:.5,minWidth:0}}>{children}</AccordionDetails>
 </Accordion>;
}

/** Each task has a separate button and checkbox; opening one never opens or completes its siblings. */
export function NoticeDetailContent({notice:n,app,actions,expandedTaskIDs,onTaskExpandedChange}:{notice:Notice;app:CampusController;actions:NoticeActions;expandedTaskIDs:Set<string>;onTaskExpandedChange:(id:string)=>void}){
 const overview=noticeOverview(n),preview=summaryPreview(n),timeline=extraTimeline(n),reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const noteButton=(target:NoteTarget,title:string,text:string)=><Tooltip title={text?'编辑笔记':'写笔记'}><IconButton aria-label={`给${title}写笔记`} onClick={()=>actions.note(n,target,title,text)} sx={{color:text?'primary.main':'text.secondary'}}><EditNote/></IconButton></Tooltip>;
 return <Stack spacing={1.5}>
  {!!n.tasks.length&&<Box><Typography component="h3" sx={{mb:1,fontSize:18,fontWeight:700}}>待办事项</Typography>
   <Box className="task-list">{n.tasks.map((t,index)=>{
    const expanded=expandedTaskIDs.has(t.id),bodyID=`task-body-${t.id}`,audience=t.scope==='role'&&t.condition?`${taskAudience(t)} · ${t.condition}`:taskAudience(t);
    const audienceHint=t.dismissed?'不适用':t.scope==='role'?t.assignee||'指定执行者':t.scope==='all'?'全体同学':t.condition&&Array.from(t.condition).length<=22?t.condition:t.scope==='conditional'?'条件适用':'对象待确认';
    const showAudience=audience!==audienceHint&&(overview.audiences.length!==1||Array.from(overview.audiences[0]??'').length>28);
    return <Box key={t.id} className="task-item" sx={{opacity:t.dismissed?.6:1,borderTop:index?'1px solid':'none',borderColor:'divider',py:.75}}>
     <Stack direction="row" sx={{alignItems:'flex-start',gap:.25}}>
      <Checkbox checked={t.completed} disabled={t.dismissed} onChange={()=>app.act(n.id,v=>toggleTask(v,t.id),t.completed?'已恢复待办':'已完成事项')} slotProps={{input:{'aria-label':`完成：${t.text}`}}} sx={{ml:-1,mt:.1}}/>
      <Box sx={{flex:1,minWidth:0}}>
       <Button className="task-expand" aria-expanded={expanded} aria-controls={bodyID} aria-label={`${expanded?'收起事项':'展开事项'}：${plainReadingText(t.text)}`} onClick={()=>onTaskExpandedChange(t.id)} endIcon={<ExpandMore sx={{transform:expanded?'rotate(180deg)':'none'}}/>} sx={{width:'100%',justifyContent:'space-between',textAlign:'left',borderRadius:'8px',px:.75,py:1,gap:1,color:'text.primary','& .MuiButton-endIcon':{ml:0,color:'text.secondary'}}}>
        <Typography component="span" sx={{fontSize:17,fontWeight:700,lineHeight:1.5,overflowWrap:'anywhere',textDecoration:t.completed?'line-through':'none',color:t.completed?'text.secondary':'text.primary'}}>{plainReadingText(t.text)}</Typography>
       </Button>
       <Stack direction="row" className="task-meta" sx={{gap:.75,px:.75,mt:.25,mb:.5,flexWrap:'wrap',alignItems:'center'}}>
        <Chip size="small" label={audienceHint} color={t.scope==='all'?'primary':'warning'} variant="outlined" sx={{'& .MuiChip-label':{fontSize:12}}}/>
        {taskTime(t)&&!sameHeadlineTime(taskTime(t),n)&&<Typography className="task-time" title={taskTime(t)} sx={{fontSize:14,fontWeight:600,color:'primary.main',overflowWrap:'anywhere'}}>{displayTime(taskTime(t))}</Typography>}
        {t.steps.length>0&&<Typography sx={{fontSize:12,color:'text.secondary'}}>{t.steps.filter(step=>step.completed).length}/{t.steps.length} 步</Typography>}
       </Stack>
      </Box>
     </Stack>
     <Collapse in={expanded} timeout={reducedMotion?0:180} unmountOnExit><Box id={bodyID} className="task-content" sx={{ml:{xs:0,sm:5.5},mt:1,p:1.5,borderLeft:'2px solid',borderColor:'primary.main',bgcolor:'action.hover',borderRadius:'0 8px 8px 0'}}>
      {showAudience&&<Box className="task-audience" sx={{mb:1.5,pl:1,borderLeft:'2px solid',borderColor:'warning.main'}}><Typography sx={{fontSize:13,fontWeight:700,color:'warning.main'}}>适用条件</Typography><Typography sx={{fontSize:15,lineHeight:1.65,overflowWrap:'anywhere'}}>{audience}</Typography></Box>}
      {t.location&&overview.locations.length!==1&&<Typography sx={{mb:1,fontSize:14,color:'text.secondary',overflowWrap:'anywhere'}}>{t.location}</Typography>}
      {t.details.map((detail,i)=><Typography component="div" key={i} sx={{mt:i?.75:0,fontSize:16,color:'text.secondary'}}><RichText text={detail}/></Typography>)}
      {!!t.steps.length&&<Stack component="ol" className="task-steps" sx={{mt:t.details.length?1.5:0,mb:0,p:0,listStyle:'none'}}>{t.steps.map((step,stepIndex)=><Box component="li" key={step.id} className="task-step" sx={{py:1,borderTop:stepIndex?'1px solid':'none',borderColor:'divider'}}>
       <Stack direction="row" sx={{alignItems:'flex-start',gap:.25}}>
        <Checkbox disabled={t.dismissed} checked={step.completed} onChange={()=>app.act(n.id,v=>toggleStep(v,t.id,step.id),step.completed?'已恢复步骤':'已完成步骤')} slotProps={{input:{'aria-label':`完成步骤${stepIndex+1}：${step.text}`}}} sx={{ml:-1.5,mt:-1.25}}/>
        <Typography component="div" sx={{flex:1,minWidth:0,fontSize:16,fontWeight:600,lineHeight:1.6,textDecoration:step.completed?'line-through':'none',color:step.completed?'text.secondary':'text.primary'}}><Box component="span" sx={{color:'primary.main',mr:.5}}>{stepIndex+1}.</Box><RichText text={step.text} inline/></Typography>
       </Stack>
       {step.details.map((detail,i)=><Typography component="div" key={i} sx={{mt:.5,fontSize:15,color:'text.secondary'}}><RichText text={detail}/></Typography>)}
       <Note text={step.note} onClick={()=>actions.note(n,{type:'step',taskId:t.id,stepId:step.id},step.text,step.note)}/>
       <Box sx={{display:'flex',justifyContent:'flex-end'}}>{noteButton({type:'step',taskId:t.id,stepId:step.id},step.text,step.note)}</Box>
      </Box>)}</Stack>}
      <Note text={t.note} onClick={()=>actions.note(n,{type:'task',taskId:t.id},t.text,t.note)}/>
      <Stack direction="row" sx={{mt:1,gap:1,alignItems:'center',justifyContent:'flex-end',flexWrap:'wrap'}}>
       {(t.scope!=='all'||t.dismissed)&&<Button size="small" variant="text" color="inherit" onClick={()=>app.act(n.id,v=>setTaskApplicable(v,t.id,t.dismissed),t.dismissed?'已恢复事项':'此项不适用')} sx={{fontSize:13,borderRadius:'8px'}}>{t.dismissed?'恢复此项':'不适用'}</Button>}
       {noteButton({type:'task',taskId:t.id},t.text,t.note)}
      </Stack>
     </Box></Collapse>
    </Box>;
   })}</Box>
  </Box>}
  {preview.more&&<DetailSection title="补充简介" id={`summary-${n.id}`}><RichText text={preview.full}/></DetailSection>}
  {!!n.reminders.length&&<Box><Typography component="h3" sx={{mb:1,fontSize:18,fontWeight:700}}>提醒</Typography><Stack spacing={1}>{n.reminders.map((r,index)=>{
   const first=plainReadingText(r.text).split(/[，；。！？\n]/)[0];const title=Array.from(first).length<=48?first:`提醒${index+1} · 查看完整内容`;
   return <DetailSection key={r.id} title={title||`提醒${index+1}`} id={`reminder-${r.id}`}><Box className="reminder-item"><RichText text={r.text}/><Note text={r.note} onClick={()=>actions.note(n,{type:'reminder',reminderId:r.id},r.text,r.note)}/><Box sx={{display:'flex',justifyContent:'flex-end'}}>{noteButton({type:'reminder',reminderId:r.id},r.text,r.note)}</Box></Box></DetailSection>;
  })}</Stack></Box>}
  {!!timeline.length&&<DetailSection title={`其他时间 · ${timeline.length}项`} id={`timeline-${n.id}`}><Stack className="notice-timeline" spacing={1.5}>{timeline.map((item,index)=><Box key={index}><Typography component="div" sx={{fontSize:15,fontWeight:600}}><RichText text={item.label} inline/></Typography>{!!(item.timeText||item.time||item.location)&&<Typography sx={{mt:.25,fontSize:14,color:'text.secondary',overflowWrap:'anywhere'}}>{[displayTime(item.timeText||(item.time?formatDate(item.time):'')),item.location].filter(Boolean).join(' · ')}</Typography>}</Box>)}</Stack></DetailSection>}
  {!!n.materials.length&&<DetailSection title={`材料 · ${n.materials.length}项`} id={`materials-${n.id}`}><Box component="ul" className="notice-materials" sx={{my:0,pl:2.5}}>{n.materials.map((text,index)=><Box component="li" key={index} sx={{mt:index?.75:0}}><RichText text={text}/></Box>)}</Box></DetailSection>}
  {!!n.warnings.length&&<DetailSection title={`注意 · ${n.warnings.length}项`} id={`warnings-${n.id}`} warning><Box component="ul" className="notice-warnings" sx={{my:0,pl:2.5}}>{n.warnings.map((text,index)=><Box component="li" key={index} sx={{mt:index?.75:0}}><RichText text={text}/></Box>)}</Box></DetailSection>}
  <Box sx={{pt:.75,borderTop:'1px solid',borderColor:'divider'}}><Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between'}}><Typography component="h3" sx={{fontSize:16,fontWeight:600}}>通知笔记</Typography>{noteButton({type:'notice'},n.title,n.note)}</Stack><Note text={n.note} onClick={()=>actions.note(n,{type:'notice'},n.title,n.note)}/></Box>
 </Stack>;
}
