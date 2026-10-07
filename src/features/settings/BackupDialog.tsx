import {useState} from 'react';
import {Alert,Button,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,Radio,RadioGroup} from '@mui/material';
import type {CampusController} from '../../app/useCampus';

export function BackupDialog({open,app,onClose}:{open:boolean;app:CampusController;onClose:()=>void}){
 const [mode,setMode]=useState('complete'),[working,setWorking]=useState(false),[error,setError]=useState('');
 async function exportNow(){
  if(working)return;setWorking(true);setError('');
  try{await app.backup(mode==='complete');onClose();}catch(issue){setError(issue instanceof Error?issue.message:'备份未完成。');}
  finally{setWorking(false);}
 }
 return <Dialog open={open} onClose={()=>{if(!working)onClose();}} maxWidth="xs">
  <DialogTitle>导出备份</DialogTitle>
  <DialogContent>
   {error&&<Alert severity="warning" sx={{mb:1.5}}>{error}可以选择仅备份文字。</Alert>}
   <RadioGroup aria-label="备份内容" value={mode} onChange={event=>setMode(event.target.value)}>
    <FormControlLabel value="complete" disabled={working} control={<Radio/>} label="通知、进度和本机附件"/>
    <FormControlLabel value="text" disabled={working} control={<Radio/>} label="仅通知文字与进度"/>
   </RadioGroup>
  </DialogContent>
  <DialogActions><Button disabled={working} onClick={onClose}>取消</Button><Button variant="contained" disabled={working} onClick={()=>void exportNow()}>{working?'导出中…':'导出'}</Button></DialogActions>
 </Dialog>;
}
