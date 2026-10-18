import {useEffect,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,Divider,IconButton,Stack,Tooltip,Typography} from '@mui/material';
import DeleteForeverOutlined from '@mui/icons-material/DeleteForeverOutlined';
import Restore from '@mui/icons-material/Restore';
import type {CampusController} from '../../app/useCampus';
import {friendlyErrorMessage} from '../../shared/error-message';

export function TrashDialog({open,app,onClose}:{open:boolean;app:CampusController;onClose:()=>void}){
 const [working,setWorking]=useState(false),[error,setError]=useState('');
 const [confirm,setConfirm]=useState<{id:string;title:string}|'all'|null>(null);
 const scope=app.localDataScope;
 useEffect(()=>{setConfirm(null);setError('');onClose();},[scope]);
 useEffect(()=>{if(!open){setConfirm(null);setError('');}},[open]);
 async function run(operation:()=>Promise<unknown>){if(working)return;setWorking(true);setError('');try{await operation();}catch(issue){setError(friendlyErrorMessage(issue));}finally{setWorking(false);}}
 return <><Dialog open={open} onClose={()=>{if(!working)onClose();}} fullWidth maxWidth="sm">
  <DialogTitle>回收站</DialogTitle><DialogContent>
   <Typography variant="body2" color="text.secondary" sx={{mb:2}}>本机保留 30 天，恢复后继续同步。</Typography>
   {error&&<Alert severity="warning" sx={{mb:2}}>{error}</Alert>}
   {!app.trashItems.length?<Typography color="text.secondary" sx={{py:3,textAlign:'center'}}>回收站是空的</Typography>:<Stack divider={<Divider/>}>{app.trashItems.map(entry=><Box key={entry.id} sx={{py:1.5}}>
    <Typography sx={{fontWeight:700,fontSize:18,overflowWrap:'anywhere'}}>{entry.notice.title}</Typography>
    <Stack direction="row" sx={{alignItems:'center',gap:1,mt:.75}}><Typography variant="caption" color="text.secondary" sx={{flex:1}}>保留至 {new Date(entry.expiresAt).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}</Typography>
     <Button size="small" disabled={working||app.busy} startIcon={<Restore/>} onClick={()=>void run(async()=>{await app.restoreTrash(entry.id);onClose();})}>恢复</Button>
     <Tooltip title="彻底删除"><IconButton size="small" color="error" disabled={working||app.busy} aria-label={`彻底删除：${entry.notice.title}`} onClick={()=>setConfirm({id:entry.id,title:entry.notice.title})}><DeleteForeverOutlined/></IconButton></Tooltip>
    </Stack>
   </Box>)}</Stack>}
  </DialogContent><DialogActions>{!!app.trashItems.length&&<Button color="error" disabled={working||app.busy} onClick={()=>setConfirm('all')}>清空回收站</Button>}<Button disabled={working} onClick={onClose}>关闭</Button></DialogActions>
 </Dialog><Dialog open={open&&!!confirm} onClose={()=>{if(!working)setConfirm(null);}} maxWidth="xs" fullWidth><DialogTitle>{confirm==='all'?'清空回收站？':'彻底删除？'}</DialogTitle><DialogContent><Typography>{confirm==='all'?'这些通知将无法恢复。':`“${confirm?.title??''}”将无法恢复。`}</Typography>{error&&<Alert severity="warning" sx={{mt:1}}>{error}</Alert>}</DialogContent><DialogActions><Button disabled={working} onClick={()=>setConfirm(null)}>取消</Button><Button variant="contained" color="error" disabled={working||app.busy} onClick={()=>void run(async()=>{if(confirm==='all')await app.emptyTrash();else if(confirm)await app.deleteTrashEntry(confirm.id);setConfirm(null);})}>确认删除</Button></DialogActions></Dialog></>;
}
