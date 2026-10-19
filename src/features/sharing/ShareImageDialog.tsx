import {useEffect,useState} from 'react';
import {Alert,Box,Button,Checkbox,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,Stack,Typography} from '@mui/material';
import Close from '@mui/icons-material/Close';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import type {Notice} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {shareImageFileName} from '../../domain/share-image';
import {renderShareImages,type ShareImage} from './render-share-image';

export default function ShareImageDialog({notice,app,onClose}:{notice:Notice;app:Pick<CampusController,'platform'|'tell'>;onClose:()=>void}){
 const [details,setDetails]=useState(false),[images,setImages]=useState<ShareImage[]>([]),[url,setURL]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false);
 const [generatedAt]=useState(()=>new Date());
 useEffect(()=>{const abort=new AbortController();setBusy(true);setError('');setImages([]);
  void renderShareImages(notice,details,generatedAt,abort.signal).then(result=>{if(!abort.signal.aborted){setImages(result);setBusy(false);}},cause=>{if(!abort.signal.aborted){setError(cause instanceof Error?cause.message:'图片生成失败');setBusy(false);}});
  return()=>abort.abort();
 },[notice,details,generatedAt]);
 useEffect(()=>{const image=images[0];if(!image){setURL('');return;}const next=URL.createObjectURL(image.blob);setURL(next);return()=>URL.revokeObjectURL(next);},[images]);
 async function save(){const image=images[0];if(!image||saving)return;setSaving(true);setError('');try{const result=await app.platform.saveFile(image.blob,shareImageFileName(notice.title));if(result.status!=='cancelled')app.tell(result.status==='downloaded'?'图片已开始下载':'图片已保存');}catch(cause){setError(cause instanceof Error?cause.message:'图片未保存');}finally{setSaving(false);}}
 return <Dialog open onClose={saving?undefined:onClose} fullWidth maxWidth="sm" aria-labelledby="share-image-title"><DialogTitle component="div" sx={{display:'flex',alignItems:'center',gap:1}}><Typography id="share-image-title" component="h2" variant="h5" sx={{flex:1}}>分享图</Typography><IconButton aria-label="关闭分享图" onClick={onClose} disabled={saving}><Close/></IconButton></DialogTitle><DialogContent><Stack spacing={1.5}>
  <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:1,flexWrap:'wrap'}}><FormControlLabel control={<Checkbox checked={details} onChange={e=>setDetails(e.target.checked)} disabled={saving}/>} label="含详情"/><Typography variant="body2" color="text.secondary">原文、笔记和附件不导出。</Typography></Stack>
  {!!error&&<Alert severity="error">{error}</Alert>}
  {busy?<Stack sx={{alignItems:'center',py:5,gap:2}} role="status"><CircularProgress size={28}/><Typography>正在生成图片</Typography></Stack>:url&&<Box component="img" src={url} alt="分享长图预览" sx={{display:'block',width:'100%',height:'auto',borderRadius:2,border:'1px solid',borderColor:'divider'}}/>}
 </Stack></DialogContent><DialogActions><Button variant="contained" startIcon={<DownloadOutlined/>} disabled={busy||saving||!images.length} onClick={()=>void save()}>{saving?'保存中':'保存'}</Button></DialogActions></Dialog>;
}
