import type {ReactNode} from 'react';
import {alpha,Accordion,AccordionDetails,AccordionSummary,Box,Button,Checkbox,IconButton,Stack,Tooltip,Typography} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import ExpandMore from '@mui/icons-material/ExpandMore';
import {setTaskApplicable,taskAudience,toggleStep,toggleTask} from '../../domain/notice';
import type {Notice,NoteTarget} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {RichText} from '../../shared/ui/RichText';
import type {NoticeActions} from './NoticeCard';
import {displayTime,extraTimeline,formatDate,noticeOverview,sameHeadlineTime,summaryPreview,taskTime} from './notice-overview';

function Note({text,onClick}:{text:string;onClick:()=>void}){
 return text?<Box component="button" onClick={onClick} sx={{display:'block',border:'1px solid',borderColor:'divider',textAlign:'left',width:'100%',p:1.25,mt:1,borderRadius:'12px',bgcolor:'background.paper',color:'text.secondary',cursor:'pointer',fontSize:14,lineHeight:1.6,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</Box>:null;
}
function DetailSection({title,id,children,tone='primary'}:{title:string;id:string;children:ReactNode;tone?:'primary'|'warning'|'secondary'}){
 return <Accordion defaultExpanded={false} disableGutters elevation={0} slotProps={{transition:{unmountOnExit:true}}} sx={{border:'1px solid',borderColor:theme=>alpha(theme.palette[tone].main,.45),borderLeft:'3px solid',borderLeftColor:`${tone}.main`,bgcolor:theme=>alpha(theme.palette[tone].main,.045),borderRadius:'12px!important','&:before':{display:'none'},overflow:'hidden'}}>
  <AccordionSummary expandIcon={<ExpandMore/>} id={`${id}-heading`} aria-controls={`${id}-content`} sx={{minHeight:48,'& .MuiAccordionSummary-content':{my:1}}}><Typography component="h3" sx={{fontSize:17,fontWeight:700,color:`${tone}.main`}}>{title}</Typography></AccordionSummary>
  <AccordionDetails sx={{pt:0,minWidth:0}}>{children}</AccordionDetails>
 </Accordion>;
}

/** Uses the same controller mutations as the old cards, without changing stored model text. */
export function NoticeDetailContent({notice:n,app,actions}:{notice:Notice;app:CampusController;actions:NoticeActions}){
 const overview=noticeOverview(n),preview=summaryPreview(n),timeline=extraTimeline(n);
 const noteButton=(target:NoteTarget,title:string,text:string)=><Tooltip title={text?'编辑笔记':'写笔记'}><IconButton aria-label={`给${title}写笔记`} onClick={()=>actions.note(n,target,title,text)} sx={{border:'1px solid',borderColor:text?'primary.main':'divider',color:text?'primary.main':'text.secondary'}}><EditNote/></IconButton></Tooltip>;
 return <Stack spacing={2}>
  {preview.more&&<DetailSection title="补充简介" id={`summary-${n.id}`}><RichText text={preview.full}/></DetailSection>}
  {!!n.tasks.length&&<Box><Typography component="h3" sx={{mb:1.25,fontSize:20,fontWeight:700,color:'primary.main'}}>需要做什么</Typography>
   <Stack spacing={2}>{n.tasks.map(t=><Box key={t.id} className="task-item" sx={{opacity:t.dismissed?.6:1,p:1.5,border:'1px solid',borderColor:theme=>alpha(theme.palette.primary.main,.3),borderLeft:'4px solid',borderLeftColor:t.completed?'success.main':'primary.main',borderRadius:'12px',bgcolor:theme=>alpha(theme.palette.primary.main,.035)}}>
    {(overview.audiences.length!==1||Array.from(overview.audiences[0]??'').length>36||t.dismissed)&&<Typography className="task-audience" sx={{mb:1.5,p:1,borderRadius:1.5,bgcolor:theme=>alpha(theme.palette.warning.main,.08),color:'text.primary',border:'1px solid',borderColor:theme=>alpha(theme.palette.warning.main,.4),fontSize:14,lineHeight:1.65,overflowWrap:'anywhere'}}>{t.scope==='role'&&t.condition?`${taskAudience(t)} · ${t.condition}`:taskAudience(t)}{t.dismissed?' · 不适用':''}</Typography>}
    <Stack direction="row" sx={{alignItems:'flex-start',gap:.5}}>
     <Checkbox checked={t.completed} disabled={t.dismissed} onChange={()=>app.act(n.id,v=>toggleTask(v,t.id),t.completed?'已恢复待办':'已完成事项')} slotProps={{input:{'aria-label':`完成：${t.text}`}}} sx={{ml:-1.25,mt:-1}}/>
     <Typography component="div" variant="subtitle1" sx={{flex:1,minWidth:0,fontSize:18,fontWeight:700,lineHeight:1.5,textDecoration:t.completed?'line-through':'none',color:t.completed?'text.secondary':'text.primary'}}><RichText text={t.text}/></Typography>
    </Stack>
    {taskTime(t)&&!sameHeadlineTime(taskTime(t),n)&&<Typography className="task-time" color="primary.main" sx={{mt:1,fontSize:16,fontWeight:700,overflowWrap:'anywhere'}}>{displayTime(taskTime(t))}</Typography>}
    {t.location&&overview.locations.length!==1&&<Typography variant="body2" color="text.secondary" sx={{mt:.5,overflowWrap:'anywhere'}}>{t.location}</Typography>}
    {!!(t.details.length||t.steps.length)&&<Box sx={{mt:1.5}}><DetailSection title={t.steps.length?`详细步骤 · ${t.steps.length}步`:'详细说明'} id={`task-detail-${t.id}`}>
     {t.details.map((detail,i)=><Typography component="div" color="text.secondary" key={i} sx={{mt:i?.75:0}}><RichText text={detail}/></Typography>)}
     {!!t.steps.length&&<Stack component="ol" className="task-steps" spacing={0} sx={{mt:t.details.length?1.5:0,mb:0,p:0,listStyle:'none'}}>{t.steps.map((step,index)=><Box component="li" key={step.id} className="task-step" sx={{py:1.5,borderTop:index?'1px solid':'none',borderColor:'divider'}}>
      <Stack direction="row" sx={{alignItems:'flex-start',gap:.5}}>
       <Checkbox disabled={t.dismissed} checked={step.completed} onChange={()=>app.act(n.id,v=>toggleStep(v,t.id,step.id),step.completed?'已恢复步骤':'已完成步骤')} slotProps={{input:{'aria-label':`完成步骤${index+1}：${step.text}`}}} sx={{ml:-1.25,mt:-1}}/>
       <Typography component="div" variant="subtitle1" sx={{flex:1,minWidth:0,textDecoration:step.completed?'line-through':'none',color:step.completed?'text.secondary':'text.primary'}}><Box component="span" sx={{color:'primary.main',mr:.75,fontVariantNumeric:'tabular-nums'}}>{index+1}.</Box><RichText text={step.text} inline/></Typography>
      </Stack>
      {step.details.map((detail,i)=><Typography component="div" key={i} color="text.secondary" sx={{mt:.5}}><RichText text={detail}/></Typography>)}
      <Note text={step.note} onClick={()=>actions.note(n,{type:'step',taskId:t.id,stepId:step.id},step.text,step.note)}/>
      <Box sx={{display:'flex',justifyContent:'flex-end',mt:1}}>{noteButton({type:'step',taskId:t.id,stepId:step.id},step.text,step.note)}</Box>
     </Box>)}</Stack>}
    </DetailSection></Box>}
    <Note text={t.note} onClick={()=>actions.note(n,{type:'task',taskId:t.id},t.text,t.note)}/>
    <Stack direction="row" sx={{gap:1,mt:1,flexWrap:'wrap',alignItems:'center'}}>
     {(t.scope!=='all'||t.dismissed)&&<Button size="small" variant="outlined" color="inherit" onClick={()=>app.act(n.id,v=>setTaskApplicable(v,t.id,t.dismissed),t.dismissed?'已恢复事项':'此项不适用')}>{t.dismissed?'恢复此项':'不适用'}</Button>}
     {noteButton({type:'task',taskId:t.id},t.text,t.note)}
    </Stack>
   </Box>)}</Stack>
  </Box>}
  {!!n.reminders.length&&<DetailSection title={`提醒 · ${n.reminders.length}项`} id={`reminders-${n.id}`} tone="secondary"><Stack spacing={1.5}>{n.reminders.map(r=><Box key={r.id} className="reminder-item">
   <Typography component="div"><RichText text={r.text}/></Typography>
   <Note text={r.note} onClick={()=>actions.note(n,{type:'reminder',reminderId:r.id},r.text,r.note)}/>
   <Box sx={{display:'flex',justifyContent:'flex-end',mt:1}}>{noteButton({type:'reminder',reminderId:r.id},r.text,r.note)}</Box>
  </Box>)}</Stack></DetailSection>}
  {!!timeline.length&&<DetailSection title={`其他时间安排 · ${timeline.length}项`} id={`timeline-${n.id}`}><Stack className="notice-timeline" spacing={1.5}>{timeline.map((item,index)=><Box key={index}>
   <Typography component="div" variant="body2" sx={{fontWeight:600}}><RichText text={item.label} inline/></Typography>
   {!!(item.timeText||item.time||item.location)&&<Typography variant="body2" color="text.secondary" sx={{mt:.25,overflowWrap:'anywhere'}}>{[displayTime(item.timeText||(item.time?formatDate(item.time):'')),item.location].filter(Boolean).join(' · ')}</Typography>}
  </Box>)}</Stack></DetailSection>}
  {!!n.materials.length&&<DetailSection title={`材料 · ${n.materials.length}项`} id={`materials-${n.id}`}><Box component="ul" className="notice-materials" sx={{my:0,pl:2.5}}>{n.materials.map((text,index)=><Box component="li" key={index} sx={{mt:index?.75:0}}><RichText text={text}/></Box>)}</Box></DetailSection>}
  {!!n.warnings.length&&<DetailSection title={`注意 · ${n.warnings.length}项`} id={`warnings-${n.id}`} tone="warning"><Box component="ul" className="notice-warnings" sx={{my:0,pl:2.5}}>{n.warnings.map((text,index)=><Box component="li" key={index} sx={{mt:index?.75:0}}><RichText text={text}/></Box>)}</Box></DetailSection>}
  <Box sx={{pt:1,borderTop:'1px solid',borderColor:'divider'}}><Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:1}}><Typography component="h3" variant="subtitle1">通知笔记</Typography>{noteButton({type:'notice'},n.title,n.note)}</Stack><Note text={n.note} onClick={()=>actions.note(n,{type:'notice'},n.title,n.note)}/></Box>
 </Stack>;
}
