import {useEffect,useMemo,useRef,useState} from 'react';
import {Box,Button,Chip,Collapse,InputAdornment,MenuItem,Paper,Stack,Tab,Tabs,TextField,Typography} from '@mui/material';
import Search from '@mui/icons-material/Search';
import Add from '@mui/icons-material/Add';
import ArrowForward from '@mui/icons-material/ArrowForward';
import {getNoticeStatus,pendingTasks,priority,sortNotices} from '../../domain/notice';
import type {Notice,SortOrder} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {NoticeCard,type NoticeActions} from './NoticeCard';

function AnimatedNotices({records,app,actions,now,onEmpty}:{records:Notice[];app:CampusController;actions:NoticeActions;now:number;onEmpty:(empty:boolean)=>void}){
 const [rows,setRows]=useState(()=>records.map(record=>({record,visible:true})));
 const current=useRef(records);current.current=records;
 useEffect(()=>setRows(previous=>[...records.map(record=>({record,visible:true})),...previous.filter(row=>!records.some(n=>n.id===row.record.id)).map(row=>({...row,visible:false}))]),[records]);
 useEffect(()=>onEmpty(rows.length===0),[rows.length,onEmpty]);
 return <Stack>{rows.map(row=><Collapse key={row.record.id} in={row.visible} timeout={220} onExited={()=>setRows(old=>old.filter(v=>v.record.id!==row.record.id||current.current.some(n=>n.id===v.record.id)))}>
  <Box sx={{pb:2}}><NoticeCard notice={row.record} app={app} actions={actions} now={now} disabled={!row.visible}/></Box>
 </Collapse>)}</Stack>;
}
export function FeedPage({app,actions,onCompose,focusID}:{app:CampusController;actions:NoticeActions;onCompose:()=>void;focusID:string|null}){
 const [tab,setTab]=useState(0);const [query,setQuery]=useState('');const [sort,setSort]=useState<SortOrder>('priority');const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60_000);return()=>clearInterval(timer);},[]);
 const pending=app.notices.filter(n=>getNoticeStatus(n)==='pending');
 const reminders=app.notices.filter(n=>getNoticeStatus(n)==='reminder');
 const complete=app.notices.filter(n=>['completed','dismissed'].includes(getNoticeStatus(n)));
 const urgent=sortNotices(pending.filter(n=>priority(n,now).rank<=2),'priority',now).slice(0,4);
 const records=useMemo(()=>{
  const status=tab===0?'pending':tab===1?'reminder':'completed';const needle=query.trim().toLocaleLowerCase();
  return sortNotices(app.notices.filter(n=>(status==='completed'?['completed','dismissed'].includes(getNoticeStatus(n)):getNoticeStatus(n)===status)&&(!needle||[n.title,n.summary,n.originalText,n.note,...n.tasks.flatMap(t=>[t.text,t.note,...t.steps.flatMap(s=>[s.text,s.note])]),...n.reminders.flatMap(r=>[r.text,r.note])].join('\n').toLocaleLowerCase().includes(needle))),sort,now);
 },[app.notices,tab,query,sort,now]);
 const [animationEmpty,setAnimationEmpty]=useState(records.length===0);
 function jump(id:string){setTab(0);setQuery('');setTimeout(()=>document.getElementById(`notice-${id}`)?.scrollIntoView({behavior:'smooth',block:'center'}),100);}
 useEffect(()=>{if(!focusID)return;const n=app.notices.find(n=>n.id===focusID);if(!n)return;setTab(getNoticeStatus(n)==='pending'?0:getNoticeStatus(n)==='reminder'?1:2);setQuery('');const timer=setTimeout(()=>document.getElementById(`notice-${focusID}`)?.scrollIntoView({behavior:'smooth',block:'center'}),150);return()=>clearTimeout(timer);},[focusID,app.notices]);
 return <Stack spacing={2.5} className="page-enter">
  <Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between",gap:2}}>
   <Box><Typography variant="h4" component="h1">我的通知</Typography><Stack direction="row" sx={{flexWrap:"wrap",gap:1,mt:1.5}}><Chip label={`${pending.reduce((n,v)=>n+pendingTasks(v).length,0)} 个未完成事项`} color="primary"/><Chip label={`${reminders.length} 条提醒`} color="secondary" variant="outlined"/></Stack></Box>
   <Button startIcon={<Add/>} variant="contained" onClick={onCompose} sx={{flexShrink:0}}>新增</Button>
  </Stack>
  {!!urgent.length&&<Paper sx={{p:2,bgcolor:'action.hover'}}><Typography variant="h6" sx={{mb:1}}>近期要办</Typography><Stack spacing={.5}>{urgent.map(n=>{const p=priority(n,now);return <Button key={n.id} onClick={()=>jump(n.id)} endIcon={<ArrowForward fontSize="small"/>} sx={{justifyContent:'space-between',color:'text.primary',borderRadius:2,textAlign:'left',gap:1,px:1}}><Box component="span" sx={{flex:1,minWidth:0}}>{n.title}</Box><Chip label={p.label} size="small" color={p.level==='overdue'?'error':'warning'} variant="outlined"/></Button>;})}</Stack></Paper>}
  <Tabs value={tab} onChange={(_,value)=>setTab(value)} variant="fullWidth" aria-label="通知分类">
   <Tab label={`待办 ${pending.length}`}/><Tab label={`提醒 ${reminders.length}`}/><Tab label={`已完成 ${complete.length}`}/>
  </Tabs>
  <Stack direction="row" sx={{gap:1.5}}>
   <TextField placeholder="搜索通知或笔记" value={query} onChange={e=>setQuery(e.target.value)} size="small" aria-label="搜索通知" slotProps={{input:{startAdornment:<InputAdornment position="start"><Search/></InputAdornment>}}}/>
   <TextField select value={sort} onChange={e=>setSort(e.target.value as SortOrder)} size="small" sx={{width:{xs:125,sm:155},flexShrink:0}} aria-label="通知排序"><MenuItem value="priority">优先级</MenuItem><MenuItem value="deadline">截止时间</MenuItem><MenuItem value="newest">最近添加</MenuItem></TextField>
  </Stack>
  <AnimatedNotices records={records} app={app} actions={actions} now={now} onEmpty={setAnimationEmpty}/>
  {!records.length&&animationEmpty&&<Paper variant="outlined" sx={{p:4,textAlign:'center'}}><Typography variant="h6">{query?'没有找到匹配的通知':tab===0?'暂时没有待办':tab===1?'暂时没有提醒':'还没有完成的通知'}</Typography><Typography color="text.secondary" sx={{mt:1,mb:2}}>{query?'换一个关键词试试。':'添加通知，或者载入几条示例看看。'}</Typography>{!query&&<Stack direction="row" sx={{justifyContent:"center",gap:1}}><Button variant="contained" onClick={onCompose}>新增通知</Button><Button variant="outlined" onClick={()=>void app.loadExamples().catch(app.report)}>载入示例通知</Button></Stack>}</Paper>}
 </Stack>;
}
