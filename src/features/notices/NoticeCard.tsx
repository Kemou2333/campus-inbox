import {Box,Button,Checkbox,Chip,IconButton,Paper,Stack,Tooltip,Typography} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import Event from '@mui/icons-material/Event';
import Check from '@mui/icons-material/Check';
import Undo from '@mui/icons-material/Undo';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import {getNoticeStatus,priority,setNoticeCompleted,setTaskApplicable,taskAudience,toggleStep,toggleTask} from '../../domain/notice';
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
 return text?<Box component="button" onClick={onClick} className="item-note" sx={{display:'block',border:'1px solid',borderColor:'divider',textAlign:'left',width:'100%',p:1.25,mt:1,borderRadius:2,bgcolor:'background.paper',color:'text.secondary',cursor:'pointer',fontSize:14,lineHeight:1.6,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</Box>:null;
}
export function NoticeCard({notice:n,app,actions,now,disabled=false}:{notice:Notice;app:CampusController;actions:NoticeActions;now:number;disabled?:boolean}){
 const status=getNoticeStatus(n);const p=priority(n,now);const done=status==='completed'||status==='dismissed';
 const active=n.tasks.filter(t=>!t.dismissed);const count=active.filter(t=>t.completed).length;
 const noteButton=(target:NoteTarget,title:string,text:string)=><Button size="small" variant="outlined" startIcon={<EditNote fontSize="small"/>} aria-label={`给${title}写笔记`} disabled={disabled} onClick={()=>actions.note(n,target,title,text)} color={text?'primary':'inherit'} sx={{color:text?'primary.main':'text.secondary'}}>笔记{text?' · 已记':''}</Button>;
 return <Paper component="article" variant="outlined" id={`notice-${n.id}`} className="notice-card" sx={{p:{xs:2,sm:3},borderColor:p.level==='overdue'&&!done?'error.main':'divider',pointerEvents:disabled?'none':undefined,opacity:done?.88:1}}>
  <Stack direction="row" sx={{alignItems:'flex-start',justifyContent:'space-between',gap:1,mb:1}}>
   <Stack direction="row" sx={{flexWrap:'wrap',gap:1,minWidth:0}}>
    {p.label&&!done?<Chip size="small" label={p.label} color={p.level==='overdue'?'error':'warning'}/>:<Chip size="small" label={done?(status==='dismissed'?'不适用':'已完成'):n.kind==='task'?'待办':'提醒'} color={done?'default':n.kind==='task'?'primary':'secondary'} variant="outlined"/>}
   </Stack>
   <Typography variant="caption" color="text.secondary" sx={{flexShrink:0,pt:.5,fontVariantNumeric:'tabular-nums'}}>{formatDate(n.createdAt,true)}</Typography>
  </Stack>
  <Typography variant="h5" component="h2" sx={{overflowWrap:'anywhere'}}>{n.title}</Typography>
  {(!!n.deadlineText||!!n.localDeadline)&&<Typography variant="body2" color={p.level==='overdue'&&!done?'error.main':'primary.main'} sx={{mt:.75,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{n.localDeadline?`截止：${formatDate(n.localDeadline)}`:n.deadlineText}</Typography>}
  {n.kind!=='task'&&n.summary&&!n.reminders.length&&<Typography component="div" sx={{mt:1.5}}><RichText text={n.summary}/></Typography>}
  <Stack spacing={2} sx={{mt:2}}>
   {n.tasks.map((t,taskIndex)=><Box key={t.id} className="task-item" sx={{opacity:t.dismissed?.6:1,pt:taskIndex?2:0,borderTop:taskIndex?'1px solid':'none',borderColor:'divider'}}>
    <Chip size="small" label={t.scope==='role'&&t.condition?`${taskAudience(t)} · ${t.condition}`:taskAudience(t)} color={t.scope==='all'?'primary':'warning'} variant="outlined" sx={{mb:.75}}/>
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
     {t.steps.map((step,index)=><Box component="li" key={step.id} className="task-step" sx={{p:1.5,borderTop:index?'1px solid':'none',borderColor:'divider'}}>
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
   {n.reminders.map((r,index)=><Box key={r.id} sx={{pt:index?1.5:0,borderTop:index?'1px solid':'none',borderColor:'divider'}}>
    <Typography component="div"><RichText text={r.text}/></Typography>
    <Note text={r.note} onClick={()=>actions.note(n,{type:'reminder',reminderId:r.id},r.text,r.note)}/>
    <Box sx={{display:'flex',justifyContent:'flex-end',mt:.5}}>{noteButton({type:'reminder',reminderId:r.id},r.text,r.note)}</Box>
   </Box>)}
  </Stack>
  {!!n.note&&<Note text={n.note} onClick={()=>actions.note(n,{type:'notice'},n.title,n.note)}/>}
  <AttachmentList ids={n.attachments} platform={app.platform}/>
  <Stack direction="row" className="notice-actions" sx={{alignItems:'center',gap:.5,mt:2,pt:1.5,borderTop:'1px solid',borderColor:'divider',flexWrap:'wrap'}}>
   <Button size="small" variant="outlined" onClick={()=>actions.details(n)} disabled={disabled}>详情原文</Button>
   {n.kind==='task'&&!done&&<Tooltip title="日历与提醒"><IconButton aria-label={`为${n.title}添加日历或提醒`} onClick={()=>actions.calendar(n)} disabled={disabled}><Event fontSize="small"/></IconButton></Tooltip>}
   <Box sx={{flex:1,minWidth:0}}/>
   {!!active.length&&!done&&<Typography variant="caption" color="text.secondary" sx={{fontVariantNumeric:'tabular-nums'}}>{count}/{active.length}</Typography>}
   <Button size="small" variant="contained" startIcon={done?<Undo fontSize="small"/>:<Check fontSize="small"/>} onClick={()=>app.act(n.id,v=>setNoticeCompleted(v,!done),done?'已恢复':'已完成')} disabled={disabled} sx={{bgcolor:'action.selected',color:'primary.main','&:hover':{bgcolor:'action.hover'}}}>{done?'恢复':n.kind==='task'?'完成':'知悉'}</Button>
   <Tooltip title="删除"><IconButton aria-label={`删除${n.title}`} onClick={()=>app.remove(n.id)} disabled={disabled} sx={{color:'text.secondary'}}><DeleteOutline fontSize="small"/></IconButton></Tooltip>
  </Stack>
 </Paper>;
}
export function formatDate(value:string,short=false){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return value;
 return date.toLocaleString('zh-CN',{...(short?{}:{year:'numeric'}),month:'numeric',day:'numeric',...(short?{}:{hour:'2-digit',minute:'2-digit'})});
}
