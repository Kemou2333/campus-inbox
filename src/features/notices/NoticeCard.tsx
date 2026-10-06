import {Box,Button,Checkbox,Chip,IconButton,Paper,Stack,Typography} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import MoreHoriz from '@mui/icons-material/MoreHoriz';
import Event from '@mui/icons-material/Event';
import Check from '@mui/icons-material/Check';
import Undo from '@mui/icons-material/Undo';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import {getNoticeStatus,pendingTasks,priority,setNoticeCompleted,setTaskApplicable,taskAudience,toggleStep,toggleTask} from '../../domain/notice';
import type {Notice,NoteTarget,Task} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {RichText} from '../../shared/ui/RichText';
import {AttachmentList} from '../attachments/AttachmentList';

export interface NoticeActions {
 note:(notice:Notice,target:NoteTarget,title:string,text:string)=>void;
 details:(notice:Notice)=>void;
 calendar:(notice:Notice,task?:Task)=>void;
}
function Note({text,onClick}:{text:string;onClick:()=>void}){
 return text?<Box component="button" onClick={onClick} sx={{display:'block',border:0,textAlign:'left',width:'100%',p:1.25,mt:1,borderRadius:2,bgcolor:'action.hover',color:'text.secondary',cursor:'pointer',fontSize:14,lineHeight:1.7,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</Box>:null;
}
export function NoticeCard({notice:n,app,actions,now,disabled=false}:{notice:Notice;app:CampusController;actions:NoticeActions;now:number;disabled?:boolean}){
 const status=getNoticeStatus(n);const p=priority(n,now);const done=status==='completed'||status==='dismissed';
 const active=n.tasks.filter(t=>!t.dismissed);const count=active.filter(t=>t.completed).length;
 const noteButton=(target:NoteTarget,title:string,text:string)=><IconButton aria-label={`给${title}写笔记`} disabled={disabled} onClick={()=>actions.note(n,target,title,text)} color={text?'primary':'default'}><EditNote fontSize="small"/></IconButton>;
 return <Paper component="article" variant="outlined" id={`notice-${n.id}`} className="notice-card" sx={{p:{xs:2,sm:3},borderColor:p.level==='overdue'&&!done?'error.light':'divider',pointerEvents:disabled?'none':undefined,opacity:done?.88:1}}>
  <Stack direction="row" spacing={1} sx={{alignItems:"center",justifyContent:"space-between",mb:1.5}}>
   <Stack direction="row" sx={{flexWrap:"wrap",gap:1}}>
    {p.label&&!done?<Chip size="small" label={p.label} color={p.level==='overdue'?'error':'warning'}/>:<Chip size="small" label={done?(status==='dismissed'?'不适用':'已完成'):n.kind==='task'?'待办':'提醒'} color={done?'default':n.kind==='task'?'primary':'secondary'} variant="outlined"/>}
    {(!!n.deadlineText||!!n.localDeadline)&&<Chip size="small" label={n.localDeadline?`我的截止时间 ${formatDate(n.localDeadline)}`:n.deadlineText} sx={{bgcolor:'action.hover'}}/>}
   </Stack>
   <Typography variant="caption" color="text.secondary" sx={{flexShrink:0}}>{formatDate(n.createdAt,true)}</Typography>
  </Stack>
  <Typography variant="h5" component="h2" sx={{mb:2,lineHeight:1.4,overflowWrap:'anywhere'}}>{n.title}</Typography>
  {n.kind!=='task'&&n.summary&&!n.reminders.length&&<Typography sx={{mb:1.5}}><RichText text={n.summary}/></Typography>}
  <Stack spacing={2}>
   {n.tasks.map(t=><Box key={t.id} sx={{opacity:t.dismissed?.6:1}}>
    <Stack direction="row" sx={{alignItems:"flex-start",gap:.5}}>
     <Checkbox checked={t.completed} disabled={disabled||t.dismissed} onChange={()=>app.act(n.id,v=>toggleTask(v,t.id),t.completed?'已恢复待办':'已完成事项')} slotProps={{input:{'aria-label':`完成：${t.text}`}}} sx={{ml:-1.25,mt:-.65}}/>
     <Box sx={{flex:1,minWidth:0}}>
      <Chip size="small" label={t.scope==='role'&&t.condition?`${taskAudience(t)} · ${t.condition}`:taskAudience(t)} color={t.scope==='all'?'primary':'warning'} variant="outlined" sx={{mb:1,height:'auto',minHeight:26,'& .MuiChip-label':{whiteSpace:'normal',py:.35}}}/>
      <Typography sx={{fontWeight:650,fontSize:17,textDecoration:t.completed?'line-through':'none',color:t.completed?'text.secondary':'text.primary'}}><RichText text={t.text}/></Typography>
      {t.timeText&&t.timeText!==n.deadlineText&&<Typography variant="body2" color="primary.main" sx={{mt:.5}}>{t.timeText}</Typography>}
      {t.location&&<Typography variant="body2" color="text.secondary" sx={{mt:.5}}>{t.location}</Typography>}
      {t.details.map((detail,i)=><Typography variant="body2" color="text.secondary" key={i} sx={{mt:.6}}><RichText text={detail}/></Typography>)}
      {!!t.steps.length&&<Stack spacing={1} sx={{mt:1.5,borderLeft:'2px solid',borderColor:'divider',pl:1}}>
       {t.steps.map((step,index)=><Box key={step.id}>
        <Stack direction="row" spacing={.5} sx={{alignItems:"flex-start"}}>
         <Checkbox size="small" disabled={disabled||t.dismissed} checked={step.completed} onChange={()=>app.act(n.id,v=>toggleStep(v,t.id,step.id),step.completed?'已恢复步骤':'已完成步骤')} slotProps={{input:{'aria-label':`完成步骤${index+1}：${step.text}`}}} sx={{mt:-.7}}/>
         <Box sx={{flex:1,minWidth:0}}>
          <Typography sx={{textDecoration:step.completed?'line-through':'none',color:step.completed?'text.secondary':'text.primary'}}><Box component="span" sx={{color:'primary.main',mr:.75,fontWeight:700}}>{index+1}.</Box><RichText text={step.text}/></Typography>
          {step.details.map((d,i)=><Typography key={i} variant="body2" color="text.secondary" sx={{mt:.5}}><RichText text={d}/></Typography>)}
          <Note text={step.note} onClick={()=>actions.note(n,{type:'step',taskId:t.id,stepId:step.id},step.text,step.note)}/>
         </Box>
         {noteButton({type:'step',taskId:t.id,stepId:step.id},step.text,step.note)}
        </Stack>
       </Box>)}
      </Stack>}
      <Note text={t.note} onClick={()=>actions.note(n,{type:'task',taskId:t.id},t.text,t.note)}/>
      {(t.scope!=='all'||t.dismissed)&&<Button size="small" disabled={disabled} onClick={()=>app.act(n.id,v=>setTaskApplicable(v,t.id,t.dismissed),t.dismissed?'已恢复事项':'此项不适用')} sx={{px:0,minWidth:0,color:'text.secondary',mt:.5}}>{t.dismissed?'恢复此项':'这项与我无关'}</Button>}
     </Box>
     {noteButton({type:'task',taskId:t.id},t.text,t.note)}
    </Stack>
   </Box>)}
   {n.reminders.map(r=><Box key={r.id}><Stack direction="row" sx={{alignItems:"flex-start",gap:1}}>
    <Box sx={{width:6,height:6,borderRadius:'50%',bgcolor:'secondary.main',mt:1.2,flexShrink:0}}/>
    <Box sx={{flex:1,minWidth:0}}><Typography><RichText text={r.text}/></Typography><Note text={r.note} onClick={()=>actions.note(n,{type:'reminder',reminderId:r.id},r.text,r.note)}/></Box>
    {noteButton({type:'reminder',reminderId:r.id},r.text,r.note)}
   </Stack></Box>)}
  </Stack>
  {!!n.note&&<Note text={n.note} onClick={()=>actions.note(n,{type:'notice'},n.title,n.note)}/>}
  <AttachmentList ids={n.attachments} platform={app.platform}/>
  <Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between",gap:1,mt:2.5,pt:1.5,borderTop:'1px solid',borderColor:'divider',flexWrap:'wrap'}}>
   <Stack direction="row" spacing={.5}>
    <Button size="small" variant="outlined" startIcon={<MoreHoriz/>} onClick={()=>actions.details(n)} disabled={disabled}>详情原文</Button>
    {n.kind==='task'&&!done&&<IconButton aria-label={`为${n.title}添加日历或提醒`} onClick={()=>actions.calendar(n)} disabled={disabled}><Event/></IconButton>}
   </Stack>
   <Stack direction="row" spacing={.5} sx={{alignItems:"center"}}>
    {!!active.length&&!done&&<Typography variant="caption" color="text.secondary" sx={{mr:.5}}>{count} / {active.length}</Typography>}
    <Button size="small" startIcon={done?<Undo/>:<Check/>} onClick={()=>app.act(n.id,v=>setNoticeCompleted(v,!done),done?'已恢复':'已完成')} disabled={disabled}>{done?'恢复':n.kind==='task'?'完成':'已知悉'}</Button>
    <IconButton aria-label={`删除${n.title}`} onClick={()=>app.remove(n.id)} disabled={disabled}><DeleteOutline fontSize="small"/></IconButton>
   </Stack>
  </Stack>
 </Paper>;
}
export function formatDate(value:string,short=false){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return value;
 return date.toLocaleString('zh-CN',{...(short?{}:{year:'numeric'}),month:'numeric',day:'numeric',...(short?{}:{hour:'2-digit',minute:'2-digit'})});
}
