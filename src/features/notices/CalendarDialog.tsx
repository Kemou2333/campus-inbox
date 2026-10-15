import {useEffect,useState} from 'react';
import {Alert,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,MenuItem,Stack,TextField,ToggleButton,ToggleButtonGroup,Typography} from '@mui/material';
import NotificationsNone from '@mui/icons-material/NotificationsNone';
import EventOutlined from '@mui/icons-material/EventOutlined';
import type {CampusController} from '../../app/useCampus';
import type {Notice,Task} from '../../domain/types';
import {effectiveDeadline,taskDeadline} from '../../domain/notice';
import {timeFromText,timeSpecToDate} from '../../domain/time';
import {plainReadingText} from '../../domain/reading';
import {localReminderID} from '../../domain/reminders';
export interface CalendarSelection {notice:Notice;task?:Task}
const localInput=(value:string)=>{
 const d=new Date(value),pad=(n:number)=>String(n).padStart(2,'0');
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export function CalendarDialog({selection,app,onClose}:{selection:CalendarSelection|null;app:CampusController;onClose:()=>void}){
 const [date,setDate]=useState('');const [allDay,setAllDay]=useState(false);const [personal,setPersonal]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [lead,setLead]=useState(60);const [channel,setChannel]=useState<'notification'|'calendar'>('calendar');const [suggestedTime,setSuggestedTime]=useState(false);
 useEffect(()=>{if(!selection)return;const {notice,task}=selection;const due=task?taskDeadline(notice,task):effectiveDeadline(notice);const point=due||task?.time||(task?null:notice.deadline);const calendarDate=timeSpecToDate(timeFromText(task?.timeText||notice.deadlineText));
  // An explicit event start is useful for a reminder without becoming a deadline.
  setDate(point?localInput(point):calendarDate||'');setAllDay(!point&&!!calendarDate);setChannel(app.capabilities?.localReminders&&(point||!calendarDate)?'notification':'calendar');setSuggestedTime(false);setPersonal(false);setError('');setLead(60);
 },[selection,app.capabilities?.localReminders]);
 const title=selection?.task?.text||selection?.notice.title||'';
 function millis(){const value=new Date(allDay?`${date}T00:00:00`:date).getTime();if(!date||!Number.isFinite(value))throw new Error('请先填写明确的日期和时间。');return value;}
 function savePersonal(){if(!personal||allDay||!selection)return;app.update(selection.notice.id,n=>({...n,updatedAt:new Date().toISOString(),...(selection.task?{tasks:n.tasks.map(t=>t.id===selection.task!.id?{...t,localDeadline:`${date}:00`}:t)}:{localDeadline:`${date}:00`})}));}
 async function calendar(){setBusy(true);setError('');try{const startMillis=millis();const n=selection!.notice;const result=await app.platform.openCalendar({title,startMillis,allDay,location:selection?.task?.location||undefined,description:[n.summary,...(selection?.task?[selection.task]:n.tasks).flatMap(t=>[t.text,...t.steps.map((s,i)=>`${i+1}. ${s.text}`)])].filter(Boolean).map(plainReadingText).join('\n')});
  if(result.status!=='cancelled'){savePersonal();app.tell(result.status==='opened'?'已打开日历，请在日历中确认保存。':'已下载日历文件，请导入你的日历。');onClose();}
 }catch(e){setError(e instanceof Error?e.message:'日历暂时无法使用。');}finally{setBusy(false);}}
 async function reminder(){setBusy(true);setError('');try{const triggerMillis=millis()-lead*60_000;if(triggerMillis<=Date.now())throw new Error('提醒时间已经过去，请调整时间。');const n=selection!.notice;const result=await app.platform.scheduleReminder({id:localReminderID(n.id,selection?.task?.id),noticeId:n.id,title:plainReadingText(title),body:plainReadingText(selection?.task?.text||n.summary),triggerMillis});
  if(result.status==='scheduled'){savePersonal();app.tell('已设置应用通知，仅此手机');onClose();}else setError(result.status==='permission-denied'?'请在手机应用设置中允许校园 Inbox 发送通知后再试。':'此设备暂不支持应用通知，可以改用日历。');
 }catch(e){setError(e instanceof Error?e.message:'提醒暂时无法设置。');}finally{setBusy(false);}}
 return <Dialog open={!!selection} onClose={busy?undefined:onClose}>
  <DialogTitle>创建提醒</DialogTitle>
  <DialogContent><Stack spacing={2}><Typography>{title}</Typography>
   {app.capabilities?.localReminders&&<ToggleButtonGroup exclusive fullWidth value={channel} onChange={(_,value:'notification'|'calendar'|null)=>{if(!value)return;setChannel(value);setError('');if(value==='notification'&&allDay){setAllDay(false);setDate(date.length===10?`${date}T09:00`:date);setSuggestedTime(true);}}} disabled={busy} aria-label="提醒方式" sx={{'& .MuiToggleButton-root':{gap:.75,py:1.25,fontSize:15}}}><ToggleButton value="notification" aria-label="应用通知"><NotificationsNone fontSize="small"/>应用通知</ToggleButton><ToggleButton value="calendar" aria-label="日历"><EventOutlined fontSize="small"/>日历</ToggleButton></ToggleButtonGroup>}
   {error&&<Alert severity="error">{error}</Alert>}
   {!date&&<Alert severity="info">原文没有完整日期，请确认后填写。</Alert>}
   {channel==='calendar'&&<FormControlLabel control={<Checkbox checked={allDay} onChange={e=>{setAllDay(e.target.checked);setDate(e.target.checked?date.slice(0,10):date.length===10?`${date}T09:00`:date);setPersonal(false);}}/>} label="全天事项"/>}
   <TextField label={allDay?'日期':'日期与时间'} type={allDay?'date':'datetime-local'} value={date} onChange={e=>setDate(e.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
   {suggestedTime&&channel==='notification'&&<Typography variant="caption" color="text.secondary">原文没有具体时刻，09:00 仅为建议，请自行确认。</Typography>}
   {!allDay&&<FormControlLabel control={<Checkbox checked={personal} onChange={e=>setPersonal(e.target.checked)}/>} label="同时设为我的截止时间"/>}
   {channel==='notification'&&<><TextField select label="提前提醒" value={lead} onChange={e=>setLead(Number(e.target.value))}><MenuItem value={0}>在设定时间提醒</MenuItem><MenuItem value={15}>提前 15 分钟</MenuItem><MenuItem value={60}>提前 1 小时</MenuItem><MenuItem value={1440}>提前 1 天</MenuItem></TextField><Typography variant="caption" color="text.secondary">仅此手机。省电或强行停止可能影响提醒。</Typography></>}
  </Stack></DialogContent>
  <DialogActions sx={{flexWrap:'wrap'}}><Button onClick={onClose} disabled={busy}>取消</Button><Button variant="contained" onClick={()=>void(channel==='notification'?reminder():calendar())} disabled={busy||!date}>{channel==='notification'?'设置应用通知':'添加到日历'}</Button></DialogActions>
 </Dialog>;
}
