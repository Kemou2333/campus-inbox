import {useEffect,useState} from 'react';
import {Alert,Box,Button,Checkbox,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,Stack,Typography} from '@mui/material';
import type {Notice} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {shareImageFileName} from '../../domain/share-image';
import {renderShareImages,type ShareImage} from './render-share-image';

export default function ShareImageDialog({notice,app,onClose}:{notice:Notice;app:Pick<CampusController,'platform'|'tell'>;onClose:()=>void}){
 const [details,setDetails]=useState(false),[images,setImages]=useState<ShareImage[]>([]),[page,setPage]=useState(0),[url,setURL]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false);
 const [generatedAt]=useState(()=>new Date());
 useEffect(()=>{const abort=new AbortController();setBusy(true);setError('');setImages([]);setPage(0);
  void renderShareImages(notice,details,generatedAt,abort.signal).then(result=>{if(!abort.signal.aborted){setImages(result);setBusy(false);}},cause=>{if(!abort.signal.aborted){setError(cause instanceof Error?cause.message:'图片生成失败');setBusy(false);}});
  return()=>abort.abort();
 },[notice,details,generatedAt]);
 useEffect(()=>{const image=images[page];if(!image){setURL('');return;}const next=URL.createObjectURL(image.blob);setURL(next);return()=>URL.revokeObjectURL(next);},[images,page]);
 async function save(){const image=images[page];if(!image||saving)return;setSaving(true);setError('');try{const result=await app.platform.saveFile(image.blob,shareImageFileName(notice.title,page,images.length));if(result.status!=='cancelled')app.tell(result.status==='downloaded'?'图片已开始下载':'图片已保存');}catch(cause){setError(cause instanceof Error?cause.message:'图片未保存');}finally{setSaving(false);}}
 return <Dialog open onClose={saving?undefined:onClose} fullWidth maxWidth="sm" aria-labelledby="share-image-title"><DialogTitle id="share-image-title">分享图</DialogTitle><DialogContent><Stack spacing={1.5}>
  <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:1,flexWrap:'wrap'}}><FormControlLabel control={<Checkbox checked={details} onChange={e=>setDetails(e.target.checked)} disabled={saving}/>} label="含详情"/><Typography variant="body2" color="text.secondary">原文、笔记和附件不导出。</Typography></Stack>
  {!!error&&<Alert severity="error">{error}</Alert>}
  {busy?<Stack sx={{alignItems:'center',py:5,gap:2}} role="status"><CircularProgress size={28}/><Typography>正在生成图片</Typography></Stack>:url&&<Box component="img" src={url} alt={`分享图预览，第 ${page+1} 页，共 ${images.length} 页`} sx={{display:'block',width:'100%',height:'auto',borderRadius:2,border:'1px solid',borderColor:'divider'}}/>}
  {images.length>1&&<Stack direction="row" sx={{alignItems:'center',justifyContent:'center',gap:1}}><Button disabled={page===0||saving} onClick={()=>setPage(value=>value-1)}>上一页</Button><Typography aria-live="polite">{page+1} / {images.length}</Typography><Button disabled={page===images.length-1||saving} onClick={()=>setPage(value=>value+1)}>下一页</Button></Stack>}
 </Stack></DialogContent><DialogActions><Button onClick={onClose} disabled={saving}>关闭</Button><Button variant="contained" disabled={busy||saving||!images.length} onClick={()=>void save()}>{saving?'保存中':images.length>1?'保存本页':'保存图片'}</Button></DialogActions></Dialog>;
}
