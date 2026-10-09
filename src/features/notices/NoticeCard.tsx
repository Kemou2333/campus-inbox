import {Box,Button,Checkbox,Chip,Collapse,IconButton,Paper,Stack,Tooltip,Typography,useMediaQuery} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import Check from '@mui/icons-material/Check';
import Undo from '@mui/icons-material/Undo';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Schedule from '@mui/icons-material/Schedule';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import {getNoticeStatus,priority,setNoticeCompleted,setTaskApplicable,taskAudience,toggleStep,toggleTask} from '../../domain/notice';
import type {Notice,NoteTarget,Task} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {RichText} from '../../shared/ui/RichText';
import {plainReadingText} from '../../domain/reading';
import {formatDate,matchesHiddenDetail,noticeOverview} from './notice-overview';

export interface NoticeActions {
 note:(notice:Notice,target:NoteTarget,title:string,text:string)=>void;
 details:(notice:Notice)=>void;
 calendar:(notice:Notice,task?:Task)=>void;
}
function Note({text,onClick}:{text:string;onClick:()=>void}){
 return text?<Box component="button" onClick={onClick} className="item-note" sx={{display:'block',border:'1px solid',borderColor:'divider',textAlign:'left',width:'100%',p:1.25,mt:1,borderRadius:2,bgcolor:'background.paper',color:'text.secondary',cursor:'pointer',fontSize:14,lineHeight:1.6,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</Box>:null;
}
export function NoticeCard({notice:n,app,actions,now,expanded,onExpandedChange,searchQuery='',disabled=false}:{notice:Notice;app:CampusController;actions:NoticeActions;now:number;expanded:boolean;onExpandedChange:()=>void;searchQuery?:string;disabled?:boolean}){
 const status=getNoticeStatus(n);const p=priority(n,now);const done=status==='completed'||status==='dismissed';
 const overview=noticeOverview(n);const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const bodyID=`notice-body-${n.id}`;
 const hasTasks=n.tasks.length>0;
 const expandLabel=expanded?'收起步骤':matchesHiddenDetail(n,searchQuery)?'查看匹配':'查看步骤';
 const summary=plainReadingText(n.summary).trim();
 const reminderTexts=new Set(n.reminders.map(r=>plainReadingText(r.text).trim()));
 const showSummary=!!summary&&summary!==plainReadingText(n.title).trim()&&!reminderTexts.has(summary);
 const timeKey=(value:string)=>plainReadingText(value).replace(/[\s：:]/g,'').replace(/^截止/,'');
 const timelineTimes=new Set(n.timeline.flatMap(item=>{const time=item.timeText||(item.time?formatDate(item.time):'');return time?[timeKey(time),timeKey(item.label+'：'+time)]:[];}));
 const timelineLocations=new Set(n.timeline.map(item=>item.location).filter(Boolean));
 const headlineTimes=overview.times.filter(time=>!timelineTimes.has(timeKey(time)));
 const headlineLocations=overview.locations.filter(location=>!timelineLocations.has(location));
 const noteButton=(target:NoteTarget,title:string,text:string)=><Tooltip title={text?'编辑笔记':'写笔记'}><span><IconButton aria-label={`给${title}写笔记`} disabled={disabled} onClick={()=>actions.note(n,target,title,text)} sx={{border:'1px solid',borderColor:text?'primary.main':'divider',color:text?'primary.main':'text.secondary'}}><EditNote/></IconButton></span></Tooltip>;
 return <Paper component="article" variant="outlined" id={`notice-${n.id}`} className="notice-card" inert={disabled||undefined} aria-labelledby={`notice-heading-${n.id}`} sx={{p:{xs:1.5,sm:2.5},borderColor:'divider',pointerEvents:disabled?'none':undefined,opacity:done?.88:1}}>
  <Stack direction="row" sx={{alignItems:'flex-start',justifyContent:'space-between',gap:1,mb:1}}>
   <Stack direction="row" sx={{flexWrap:'wrap',gap:1,minWidth:0}}>
    {p.label&&!done?<Chip size="small" label={p.label} color={p.level==='overdue'?'error':'warning'}/>:<Chip size="small" label={done?(status==='dismissed'?'不适用':'已完成'):n.kind==='task'?'待办':'提醒'} color={done?'default':n.kind==='task'?'primary':'secondary'} variant="outlined"/>}
   </Stack>
   <Stack direction="row" sx={{alignItems:'center',gap:1,flexShrink:0,minHeight:28}}>
    {overview.notes&&<Tooltip title="已有笔记"><Box component="span" aria-label="已有笔记" sx={{display:'flex',color:'text.secondary'}}><EditNote fontSize="small"/></Box></Tooltip>}
    {overview.total>0&&<Typography variant="body2" color="text.secondary" sx={{fontVariantNumeric:'tabular-nums',fontWeight:600}} aria-label={`已完成${overview.completed}项任务，共${overview.total}项任务`}>{overview.completed}/{overview.total}</Typography>}
   </Stack>
  </Stack>
  <Typography variant="h5" component="h2" id={`notice-heading-${n.id}`} sx={{overflowWrap:'anywhere',fontSize:{xs:'1.5rem',sm:'1.75rem'},fontWeight:700,lineHeight:1.35}}>{n.title}</Typography>
  {!!overview.audiences.length&&<Stack direction="row" className="notice-audiences" sx={{flexWrap:'wrap',gap:.75,mt:1}}>{overview.audiences.map(label=><Chip key={label} size="small" label={label} color={label==='全体同学'?'primary':'warning'} variant="outlined"/>)}</Stack>}
  {!!(headlineTimes.length||headlineLocations.length)&&<Stack className="notice-overview" spacing={.5} sx={{mt:1}}>
   {!!headlineTimes.length&&<Stack direction="row" sx={{alignItems:'flex-start',gap:.75}}><Schedule sx={{fontSize:18,mt:.3,color:p.level==='overdue'&&!done?'error.main':'primary.main'}}/><Typography variant="body2" color={p.level==='overdue'&&!done?'error.main':'primary.main'} sx={{fontWeight:600,fontVariantNumeric:'tabular-nums',overflowWrap:'anywhere'}}>{headlineTimes.join(' · ')}</Typography></Stack>}
   {!!headlineLocations.length&&<Stack direction="row" sx={{alignItems:'flex-start',gap:.75}}><PlaceOutlined sx={{fontSize:18,mt:.3,color:'text.secondary'}}/><Typography variant="body2" color="text.secondary" sx={{overflowWrap:'anywhere'}}>{headlineLocations.join(' · ')}</Typography></Stack>}
  </Stack>}
  <Stack className="notice-details" spacing={1.5} sx={{mt:showSummary||n.timeline.length||n.materials.length||n.warnings.length||n.reminders.length?1.5:0}}>
   {showSummary&&<Typography component="div" color="text.secondary" className="notice-summary"><RichText text={n.summary}/></Typography>}
   {!!n.timeline.length&&<Stack className="notice-timeline" spacing={1} sx={{pl:1.5,borderLeft:'2px solid',borderColor:'divider'}}>{n.timeline.map((item,index)=><Box key={index}>
    <Typography component="div" variant="body2" sx={{fontWeight:600}}><RichText text={item.label} inline/></Typography>
    {!!(item.timeText||item.time||item.location)&&<Typography variant="body2" color="text.secondary" sx={{mt:.25,overflowWrap:'anywhere'}}>{[item.timeText||(item.time?formatDate(item.time):''),item.location].filter(Boolean).join(' · ')}</Typography>}
   </Box>)}</Stack>}
   {!!n.materials.length&&<Box className="notice-materials"><Typography component="h3" variant="subtitle1" sx={{mb:.5}}>准备</Typography><Box component="ul" sx={{my:0,pl:2.5}}>{n.materials.map((text,index)=><Box component="li" key={index} sx={{color:'text.secondary',mt:index?.5:0}}><RichText text={text}/></Box>)}</Box></Box>}
   {!!n.warnings.length&&<Box className="notice-warnings" sx={{p:1.5,borderRadius:2,bgcolor:'action.hover'}}><Typography component="h3" variant="subtitle1" sx={{mb:.5,color:'warning.main'}}>注意</Typography><Box component="ul" sx={{my:0,pl:2.5}}>{n.warnings.map((text,index)=><Box component="li" key={index} sx={{mt:index?.5:0}}><RichText text={text}/></Box>)}</Box></Box>}
   {n.reminders.map((r,index)=><Box key={r.id} className="reminder-item" sx={{pt:index?1.5:0,borderTop:index?'1px solid':'none',borderColor:'divider'}}>
    <Typography component="div"><RichText text={r.text}/></Typography>
    <Note text={r.note} onClick={()=>actions.note(n,{type:'reminder',reminderId:r.id},r.text,r.note)}/>
    <Box sx={{display:'flex',justifyContent:'flex-end',mt:.5}}>{noteButton({type:'reminder',reminderId:r.id},r.text,r.note)}</Box>
   </Box>)}
   {!!n.note&&<Note text={n.note} onClick={()=>actions.note(n,{type:'notice'},n.title,n.note)}/>}
  </Stack>
  <Stack direction="row" className="notice-actions" sx={{alignItems:'center',gap:.75,mt:2,pt:1.5,borderTop:'1px solid',borderColor:'divider',flexWrap:'wrap'}}>
   {hasTasks&&<Tooltip title={expandLabel}><span><IconButton className="notice-expand" onClick={onExpandedChange} disabled={disabled} aria-expanded={expanded} aria-controls={bodyID} aria-label={`${expandLabel}${n.title}`} sx={{border:'1px solid',borderColor:'divider',color:'primary.main'}}><ExpandMore sx={{fontSize:28,transform:expanded?'rotate(180deg)':'none',transition:reducedMotion?'none':'transform 240ms cubic-bezier(.2,0,0,1)'}}/></IconButton></span></Tooltip>}
   <Button size="small" variant="outlined" onClick={()=>actions.details(n)} disabled={disabled}>原文</Button>
   {n.kind==='task'&&!done&&<Button size="small" variant="outlined" onClick={()=>actions.calendar(n)} disabled={disabled}>创建提醒</Button>}
   <Box sx={{flex:1,minWidth:0}}/>
   <Tooltip title={done?'恢复':n.kind==='task'?'完成':'知悉'}><span><IconButton className="notice-complete" aria-label={done?'恢复':n.kind==='task'?'完成':'知悉'} onClick={()=>app.act(n.id,v=>setNoticeCompleted(v,!done),done?'已恢复':'已完成')} disabled={disabled} sx={{bgcolor:'action.selected',color:'primary.main','&:hover':{bgcolor:'action.hover'}}}>{done?<Undo sx={{fontSize:28}}/>:<Check sx={{fontSize:28}}/>}</IconButton></span></Tooltip>
   <Tooltip title="删除"><IconButton aria-label={`删除${n.title}`} onClick={()=>app.remove(n.id)} disabled={disabled} sx={{color:'text.secondary'}}><DeleteOutline fontSize="small"/></IconButton></Tooltip>
  </Stack>
  <Box id={bodyID} className="notice-body" aria-hidden={!hasTasks||!expanded}>
  <Collapse in={hasTasks&&expanded} timeout={reducedMotion?0:240} unmountOnExit>
  <Box sx={{mt:2,pt:2,borderTop:'1px solid',borderColor:'divider'}}>
  <Stack spacing={2}>
   {n.tasks.map((t,taskIndex)=><Box key={t.id} className="task-item" sx={{opacity:t.dismissed?.6:1,pt:taskIndex?2:0,borderTop:taskIndex?'1px solid':'none',borderColor:'divider'}}>
    {(n.tasks.length>1||!overview.audiences.length)&&<Chip size="small" label={t.scope==='role'&&t.condition?`${taskAudience(t)} · ${t.condition}`:taskAudience(t)} color={t.scope==='all'?'primary':'warning'} variant="outlined" sx={{mb:.75}}/>}
    <Stack direction="row" sx={{alignItems:'flex-start',gap:.5}}>
     <Checkbox checked={t.completed} disabled={disabled||t.dismissed} onChange={()=>app.act(n.id,v=>toggleTask(v,t.id),t.completed?'已恢复待办':'已完成事项')} slotProps={{input:{'aria-label':`完成：${t.text}`}}} sx={{ml:-1.5,mt:-1.25}}/>
     <Typography component="div" variant="subtitle1" sx={{flex:1,minWidth:0,textDecoration:t.completed?'line-through':'none',color:t.completed?'text.secondary':'text.primary'}}><RichText text={t.text}/></Typography>
    </Stack>
    <Box sx={{mt:(t.timeText||t.location||t.details.length)? .5:0}}>
     {t.timeText&&t.timeText!==n.deadlineText&&<Typography variant="body2" color="primary.main" sx={{mb:.5,fontWeight:600}}>{t.timeText}</Typography>}
     {t.location&&<Typography variant="body2" color="text.secondary" sx={{mb:.5}}>{t.location}</Typography>}
     {t.details.map((detail,i)=><Typography component="div" color="text.secondary" key={i} sx={{mt:.5}}><RichText text={detail}/></Typography>)}
    </Box>
    {!!t.steps.length&&<Stack component="ol" className="task-steps" spacing={0} sx={{mt:1.5,mb:0,p:0,listStyle:'none',borderRadius:2.5,bgcolor:'action.hover'}}>
     {t.steps.map((step,index)=><Box component="li" key={step.id} className="task-step" sx={{p:{xs:1.25,sm:1.5},borderTop:index?'1px solid':'none',borderColor:'divider'}}>
      <Stack direction="row" sx={{alignItems:'flex-start',gap:.5}}>
       <Checkbox disabled={disabled||t.dismissed} checked={step.completed} onChange={()=>app.act(n.id,v=>toggleStep(v,t.id,step.id),step.completed?'已恢复步骤':'已完成步骤')} slotProps={{input:{'aria-label':`完成步骤${index+1}：${step.text}`}}} sx={{ml:-1.5,mt:-1.25}}/>
       <Box sx={{flex:1,minWidth:0}}>
        <Typography component="div" variant="subtitle1" sx={{textDecoration:step.completed?'line-through':'none',color:step.completed?'text.secondary':'text.primary'}}><Box component="span" sx={{color:'primary.main',mr:.75,fontVariantNumeric:'tabular-nums'}}>{index+1}.</Box><RichText text={step.text} inline/></Typography>
       </Box>
      </Stack>
      {step.details.map((d,i)=><Typography component="div" key={i} color="text.secondary" sx={{mt:.5}}><RichText text={d}/></Typography>)}
      <Note text={step.note} onClick={()=>actions.note(n,{type:'step',taskId:t.id,stepId:step.id},step.text,step.note)}/>
      <Box sx={{display:'flex',justifyContent:'flex-end',mt:.5}}>{noteButton({type:'step',taskId:t.id,stepId:step.id},step.text,step.note)}</Box>
     </Box>)}
    </Stack>}
    <Note text={t.note} onClick={()=>actions.note(n,{type:'task',taskId:t.id},t.text,t.note)}/>
    <Stack direction="row" sx={{gap:1,mt:1,flexWrap:'wrap'}}>
     {(t.scope!=='all'||t.dismissed)&&<Button size="small" variant="outlined" color="inherit" disabled={disabled} onClick={()=>app.act(n.id,v=>setTaskApplicable(v,t.id,t.dismissed),t.dismissed?'已恢复事项':'此项不适用')} sx={{color:'text.secondary'}}>{t.dismissed?'恢复此项':'不适用'}</Button>}
     {noteButton({type:'task',taskId:t.id},t.text,t.note)}
    </Stack>
   </Box>)}
  </Stack>
  </Box>
  </Collapse>
  </Box>

 </Paper>;
}
