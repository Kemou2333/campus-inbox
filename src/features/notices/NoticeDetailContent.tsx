import type {ReactNode} from 'react';
import {Accordion,AccordionDetails,AccordionSummary,Box,Button,Checkbox,IconButton,Stack,Tooltip,Typography} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import ExpandMore from '@mui/icons-material/ExpandMore';
import {setTaskApplicable,taskAudience,toggleStep,toggleTask} from '../../domain/notice';
import type {Notice,NoteTarget} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {RichText} from '../../shared/ui/RichText';
import type {NoticeActions} from './NoticeCard';
import {formatDate,noticeOverview} from './notice-overview';

function Note({text,onClick}:{text:string;onClick:()=>void}){
 return text?<Box component="button" onClick={onClick} sx={{display:'block',border:'1px solid',borderColor:'divider',textAlign:'left',width:'100%',p:1.25,mt:1,borderRadius:2,bgcolor:'background.paper',color:'text.secondary',cursor:'pointer',fontSize:14,lineHeight:1.6,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</Box>:null;
}
function DetailSection({title,id,children}:{title:string;id:string;children:ReactNode}){
 return <Accordion defaultExpanded={false} disableGutters elevation={0} slotProps={{transition:{unmountOnExit:true}}} sx={{border:'1px solid',borderColor:'divider',borderRadius:'12px!important','&:before':{display:'none'},overflow:'hidden'}}>
  <AccordionSummary expandIcon={<ExpandMore/>} id={`${id}-heading`} aria-controls={`${id}-content`} sx={{minHeight:48,'& .MuiAccordionSummary-content':{my:1}}}><Typography component="h3" variant="subtitle1">{title}</Typography></AccordionSummary>
  <AccordionDetails sx={{pt:0,minWidth:0}}>{children}</AccordionDetails>
 </Accordion>;
}

/** Uses the same controller mutations as the old cards, without changing stored model text. */
export function NoticeDetailContent({notice:n,app,actions}:{notice:Notice;app:CampusController;actions:NoticeActions}){
 const overview=noticeOverview(n);
 const noteButton=(target:NoteTarget,title:string,text:string)=><Tooltip title={text?'编辑笔记':'写笔记'}><IconButton aria-label={`给${title}写笔记`} onClick={()=>actions.note(n,target,title,text)} sx={{border:'1px solid',borderColor:text?'primary.main':'divider',color:text?'primary.main':'text.secondary'}}><EditNote/></IconButton></Tooltip>;
 return <Stack spacing={2}>
  {!!n.summary&&<Typography component="div" color="text.secondary" className="notice-detail-summary"><RichText text={n.summary}/></Typography>}
  {!!(overview.times.length||overview.locations.length)&&<Box className="notice-detail-facts" sx={{p:1.5,borderRadius:2,bgcolor:'action.hover'}}>
   {!!overview.times.length&&<Typography variant="body2" color="primary.main" sx={{fontWeight:600,overflowWrap:'anywhere'}}>{overview.times.join(' · ')}</Typography>}
   {!!overview.locations.length&&<Typography variant="body2" color="text.secondary" sx={{mt:.5,overflowWrap:'anywhere'}}>{overview.locations.join(' · ')}</Typography>}
  </Box>}
  {!!n.tasks.length&&<Box><Typography component="h3" variant="subtitle1" sx={{mb:1}}>执行人与待办</Typography>
   <Stack spacing={2}>{n.tasks.map((t,taskIndex)=><Box key={t.id} className="task-item" sx={{opacity:t.dismissed?.6:1,pt:taskIndex?2:0,borderTop:taskIndex?'1px solid':'none',borderColor:'divider'}}>
    <Typography variant="body2" color="text.secondary" className="task-audience" sx={{mb:1,overflowWrap:'anywhere'}}>{t.scope==='role'&&t.condition?`${taskAudience(t)} · ${t.condition}`:taskAudience(t)}{t.dismissed?' · 不适用':''}</Typography>
    <Stack direction="row" sx={{alignItems:'flex-start',gap:.5}}>
     <Checkbox checked={t.completed} disabled={t.dismissed} onChange={()=>app.act(n.id,v=>toggleTask(v,t.id),t.completed?'已恢复待办':'已完成事项')} slotProps={{input:{'aria-label':`完成：${t.text}`}}} sx={{ml:-1.25,mt:-1}}/>
     <Typography component="div" variant="subtitle1" sx={{flex:1,minWidth:0,textDecoration:t.completed?'line-through':'none',color:t.completed?'text.secondary':'text.primary'}}><RichText text={t.text}/></Typography>
    </Stack>
    {t.timeText&&t.timeText!==n.deadlineText&&<Typography variant="body2" color="primary.main" sx={{mt:.5,fontWeight:600,overflowWrap:'anywhere'}}>{t.timeText}</Typography>}
    {t.location&&<Typography variant="body2" color="text.secondary" sx={{mt:.5,overflowWrap:'anywhere'}}>{t.location}</Typography>}
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
  {!!n.reminders.length&&<Box><Typography component="h3" variant="subtitle1" sx={{mb:1}}>提醒</Typography><Stack spacing={1.5}>{n.reminders.map(r=><Box key={r.id} className="reminder-item">
   <Typography component="div"><RichText text={r.text}/></Typography>
   <Note text={r.note} onClick={()=>actions.note(n,{type:'reminder',reminderId:r.id},r.text,r.note)}/>
   <Box sx={{display:'flex',justifyContent:'flex-end',mt:1}}>{noteButton({type:'reminder',reminderId:r.id},r.text,r.note)}</Box>
  </Box>)}</Stack></Box>}
  {!!n.timeline.length&&<DetailSection title={`时间安排 · ${n.timeline.length}项`} id={`timeline-${n.id}`}><Stack className="notice-timeline" spacing={1.5}>{n.timeline.map((item,index)=><Box key={index}>
   <Typography component="div" variant="body2" sx={{fontWeight:600}}><RichText text={item.label} inline/></Typography>
   {!!(item.timeText||item.time||item.location)&&<Typography variant="body2" color="text.secondary" sx={{mt:.25,overflowWrap:'anywhere'}}>{[item.timeText||(item.time?formatDate(item.time):''),item.location].filter(Boolean).join(' · ')}</Typography>}
  </Box>)}</Stack></DetailSection>}
  {!!n.materials.length&&<DetailSection title={`材料 · ${n.materials.length}项`} id={`materials-${n.id}`}><Box component="ul" className="notice-materials" sx={{my:0,pl:2.5}}>{n.materials.map((text,index)=><Box component="li" key={index} sx={{mt:index?.75:0}}><RichText text={text}/></Box>)}</Box></DetailSection>}
  {!!n.warnings.length&&<DetailSection title={`注意 · ${n.warnings.length}项`} id={`warnings-${n.id}`}><Box component="ul" className="notice-warnings" sx={{my:0,pl:2.5}}>{n.warnings.map((text,index)=><Box component="li" key={index} sx={{mt:index?.75:0}}><RichText text={text}/></Box>)}</Box></DetailSection>}
  <Box sx={{pt:1,borderTop:'1px solid',borderColor:'divider'}}><Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:1}}><Typography component="h3" variant="subtitle1">通知笔记</Typography>{noteButton({type:'notice'},n.title,n.note)}</Stack><Note text={n.note} onClick={()=>actions.note(n,{type:'notice'},n.title,n.note)}/></Box>
 </Stack>;
}
