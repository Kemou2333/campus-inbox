import {useEffect,useState} from 'react';
import {Alert,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,MenuItem,Stack,TextField,Typography} from '@mui/material';
import type {CampusController} from '../../app/useCampus';
import type {Notice,Task} from '../../domain/types';
import {effectiveDeadline,taskDeadline} from '../../domain/notice';
import {timeFromText,timeSpecToDate} from '../../domain/time';
import {plainReadingText} from '../../domain/reading';
export interface CalendarSelection {notice:Notice;task?:Task}
const localInput=(value:string)=>{
 const d=new Date(value),pad=(n:number)=>String(n).padStart(2,'0');
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export function CalendarDialog({selection,app,onClose}:{selection:CalendarSelection|null;app:CampusController;onClose:()=>void}){
 const [date,setDate]=useState('');const [allDay,setAllDay]=useState(false);const [personal,setPersonal]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [lead,setLead]=useState(60);
 useEffect(()=>{if(!selection)return;const {notice,task}=selection;const due=task?taskDeadline(notice,task):effectiveDeadline(notice);const calendarDate=timeSpecToDate(timeFromText(task?.timeText||notice.deadlineText));
  setDate(due?localInput(due):calendarDate||'');setAllDay(!due&&!!calendarDate);setPersonal(false);setError('');setLead(60);
 },[selection]);
 const title=selection?.task?.text||selection?.notice.title||'';
 function millis(){const value=new Date(allDay?`${date}T00:00:00`:date).getTime();if(!date||!Number.isFinite(value))throw new Error('请先填写明确的日期和时间。');return value;}
 function savePersonal(){if(!personal||allDay||!selection)return;app.update(selection.notice.id,n=>({...n,updatedAt:new Date().toISOString(),...(selection.task?{tasks:n.tasks.map(t=>t.id===selection.task!.id?{...t,localDeadline:`${date}:00`}:t)}:{localDeadline:`${date}:00`})}));}
 async function calendar(){setBusy(true);setError('');try{const startMillis=millis();const n=selection!.notice;const result=await app.platform.openCalendar({title,startMillis,allDay,location:selection?.task?.location||undefined,description:[n.summary,...(selection?.task?[selection.task]:n.tasks).flatMap(t=>[t.text,...t.steps.map((s,i)=>`${i+1}. ${s.text}`)])].filter(Boolean).map(plainReadingText).join('\n')});
  if(result.status!=='cancelled'){savePersonal();app.tell(result.status==='opened'?'已打开日历，请在日历中确认保存。':'已下载日历文件，请导入你的日历。');onClose();}
 }catch(e){setError(e instanceof Error?e.message:'日历暂时无法使用。');}finally{setBusy(false);}}
 async function reminder(){setBusy(true);setError('');try{const triggerMillis=millis()-lead*60_000;if(triggerMillis<=Date.now())throw new Error('提醒时间已经过去，请调整时间。');const n=selection!.notice;const result=await app.platform.scheduleReminder({id:n.id,title,body:plainReadingText(selection?.task?.text||n.summary),triggerMillis});
  if(result.status==='scheduled'){savePersonal();app.tell('已设置本机提醒');onClose();}else setError(result.status==='permission-denied'?'请允许应用发送通知后再试。':'此设备暂不支持本地提醒，可以添加到日历。');
 }catch(e){setError(e instanceof Error?e.message:'提醒暂时无法设置。');}finally{setBusy(false);}}
 return <Dialog open={!!selection} onClose={busy?undefined:onClose}>
  <DialogTitle>日历与提醒</DialogTitle>
  <DialogContent><Stack spacing={2}><Typography>{title}</Typography>
   {error&&<Alert severity="error">{error}</Alert>}
   {!date&&<Alert severity="info">原文没有完整日期，请确认后填写。</Alert>}
   <FormControlLabel control={<Checkbox checked={allDay} onChange={e=>{setAllDay(e.target.checked);setDate(e.target.checked?date.slice(0,10):date.length===10?`${date}T09:00`:date);setPersonal(false);}}/>} label="全天事项"/>
   <TextField label={allDay?'日期':'日期与时间'} type={allDay?'date':'datetime-local'} value={date} onChange={e=>setDate(e.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
   {!allDay&&<FormControlLabel control={<Checkbox checked={personal} onChange={e=>setPersonal(e.target.checked)}/>} label="同时设为我的截止时间"/>}
   {app.capabilities?.localReminders&&!allDay&&<><TextField select label="本机提醒" value={lead} onChange={e=>setLead(Number(e.target.value))}><MenuItem value={0}>在设定时间提醒</MenuItem><MenuItem value={15}>提前 15 分钟</MenuItem><MenuItem value={60}>提前 1 小时</MenuItem><MenuItem value={1440}>提前 1 天</MenuItem></TextField><Typography variant="caption" color="text.secondary">系统省电设置可能让提醒稍有延迟。</Typography></>}
  </Stack></DialogContent>
  <DialogActions sx={{flexWrap:'wrap'}}><Button onClick={onClose} disabled={busy}>取消</Button>{app.capabilities?.localReminders&&!allDay&&<Button onClick={()=>void reminder()} disabled={busy||!date}>设置提醒</Button>}<Button variant="contained" onClick={()=>void calendar()} disabled={busy||!date}>添加到日历</Button></DialogActions>
 </Dialog>;
}
