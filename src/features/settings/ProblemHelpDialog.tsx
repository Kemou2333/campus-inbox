import {useEffect,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Typography} from '@mui/material';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import type {CampusController} from '../../app/useCampus';
import {version} from '../../../package.json';

interface Props {app:CampusController;open:boolean;onClose:()=>void}
type SummaryApp=Pick<CampusController,'platform'|'sync'|'analysisJobs'|'unconfirmedSubmissions'|'jobStatusError'>;
const syncNames={disconnected:'未连接',idle:'空闲',syncing:'正在同步',offline:'离线',error:'连接异常'};
/** Explicit allowlist: never copy account names, IDs, notices, credentials or raw errors. */
export function problemSummary(app:SummaryApp,online:boolean|undefined):string{
 const active=app.analysisJobs.some(job=>job.status==='accepted'||job.status==='running');
 return ['拾笺 · Note Inbox · 使用状态',`版本：${version}`,`平台：${app.platform.kind==='android'?'安卓应用':'网页'}`,`网络：${online===undefined?'未知':online?'设备在线':'设备离线'}`,`登录：${app.sync.connected?'已登录':'未登录'}`,`同步：${syncNames[app.sync.status]}${app.sync.pendingChanges?'，有改动待上传':''}`,`整理：${app.unconfirmedSubmissions.length?'有提交待确认':active?'云端处理中':app.analysisJobs.some(job=>job.status==='failed')?'有未完成任务':'暂无处理中任务'}${app.jobStatusError?'，状态暂未读到':''}`].join('\n');
}
export function ProblemHelpDialog({app,open,onClose}:Props){
 const [online,setOnline]=useState<boolean|undefined>(()=>typeof navigator==='undefined'?undefined:navigator.onLine),[copyState,setCopyState]=useState<'idle'|'copied'|'manual'>('idle');
 useEffect(()=>{if(!open)return;setCopyState('idle');const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[open]);
 const summary=problemSummary(app,online);
 async function copy(){try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(summary);setCopyState('copied');}catch{setCopyState('manual');}}
 return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="problem-help-title"><DialogTitle id="problem-help-title">遇到问题</DialogTitle><DialogContent><Stack spacing={2}>
  <Box><Typography sx={{fontWeight:700}}>离线</Typography><Typography color="text.secondary">先检查网络。同步未确认前，别卸载应用或清空浏览器数据。</Typography></Box>
  <Box><Typography sx={{fontWeight:700}}>登录过期</Typography><Typography color="text.secondary">重新登录原账号，再查看同步状态。</Typography></Box>
  <Box><Typography sx={{fontWeight:700}}>整理未确认</Typography><Typography color="text.secondary">先点“确认提交”查看同一次请求，避免重复整理。</Typography></Box>
  <Box><Typography sx={{fontWeight:700}}>本机空间不足</Typography><Typography color="text.secondary">先导出备份，再移除不用的附件。不要直接清空应用数据。</Typography></Box>
  <Box component="details"><Typography component="summary" sx={{cursor:'pointer',fontWeight:700}}>使用状态</Typography><Typography component="pre" sx={{fontFamily:'inherit',whiteSpace:'pre-wrap',fontSize:14,userSelect:'text'}}>{summary}</Typography></Box>
  {copyState==='copied'&&<Alert severity="success">状态已复制</Alert>}{copyState==='manual'&&<Alert severity="info">无法自动复制，请展开“使用状态”后长按复制。</Alert>}
 </Stack></DialogContent><DialogActions><Button startIcon={<ContentCopyOutlined/>} onClick={()=>void copy()}>复制状态</Button><Button variant="contained" onClick={onClose}>关闭</Button></DialogActions></Dialog>;
}
export default ProblemHelpDialog;
