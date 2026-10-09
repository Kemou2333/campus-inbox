import {lazy,Suspense,useEffect,useState} from 'react';
import {Alert,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,Stack,Typography} from '@mui/material';
import AttachFile from '@mui/icons-material/AttachFile';
import Close from '@mui/icons-material/Close';
import {getFile,type StoredAttachment} from '../../infrastructure/attachment-store';
import type {PlatformAPI} from '../../platform';
const PdfPreview=lazy(()=>import('./PdfPreview'));
const isImage=(file:StoredAttachment|null)=>!!file&&/^image\/(png|jpeg|gif|webp|avif|bmp)$/i.test(file.type);
function ImageThumbnail({file}:{file:StoredAttachment}){
 const [url,setUrl]=useState('');
 useEffect(()=>{const value=URL.createObjectURL(file.blob);setUrl(value);return()=>URL.revokeObjectURL(value);},[file.blob]);
 return <Box component="img" src={url||undefined} alt="" loading="lazy" sx={{width:128,height:88,maxWidth:'100%',objectFit:'contain',borderRadius:1,bgcolor:'background.default',mb:.5}}/>;
}

export function AttachmentList({ids,platform,onRemove}:{ids:string[];platform:PlatformAPI;onRemove?:(id:string)=>void}){
 const [files,setFiles]=useState<(StoredAttachment|null)[]>([]);
 const [selected,setSelected]=useState<StoredAttachment|null>(null);
 const [url,setUrl]=useState('');const [error,setError]=useState('');
 const [textPreview,setTextPreview]=useState<string|null>(null);
 const textFile=!!selected&&(/^(text\/|application\/(json|xml))/i.test(selected.type)||/\.(txt|md|csv|json|log|html?|svg|xml)$/i.test(selected.name));
 useEffect(()=>{let alive=true;void Promise.all(ids.map(getFile)).then(v=>{if(alive)setFiles(v);}).catch(()=>{if(alive)setError('附件暂时无法读取。');});return()=>{alive=false;};},[ids]);
 useEffect(()=>{if(!selected)return;const value=URL.createObjectURL(selected.blob);setUrl(value);return()=>URL.revokeObjectURL(value);},[selected]);
 useEffect(()=>{setTextPreview(null);if(!selected||!textFile||selected.size>200_000)return;let alive=true;void selected.blob.text().then(text=>{if(alive)setTextPreview(text);}).catch(()=>{if(alive)setError('附件文字暂时无法读取。');});return()=>{alive=false;};},[selected,textFile]);
 if(!ids.length)return null;
 const image=isImage(selected);
 const pdf=selected?.type==='application/pdf';
 async function download(){if(!selected)return;try{await platform.saveFile(selected.blob,selected.name);}catch(e){setError(e instanceof Error?e.message:'附件保存失败。');}}
 return <>
  <Stack direction="row" sx={{flexWrap:"wrap",gap:1,mt:1.5}}>
   {ids.map((id,index)=>{const file=files[index];return <Box key={id} sx={{display:'flex',alignItems:'center',border:'1px solid',borderColor:'divider',borderRadius:2,maxWidth:'100%'}}>
    <Button size="small" startIcon={isImage(file)?undefined:<AttachFile/>} disabled={!file} onClick={()=>{setError('');setSelected(file);}} sx={{maxWidth:260,minHeight:38,px:1.5,...(isImage(file)?{flexDirection:'column',py:1}: {})}}>
     {isImage(file)&&file&&<ImageThumbnail file={file}/>}
     <span className="attachment-name">{file?.name||'附件未在此设备保存'}</span>
    </Button>
    {onRemove&&<IconButton size="small" aria-label={`移除${file?.name||'附件'}`} onClick={()=>onRemove(id)}><Close fontSize="small"/></IconButton>}
   </Box>;})}
  </Stack>
  <Dialog open={!!selected} onClose={()=>setSelected(null)} maxWidth="md">
   <DialogTitle>{selected?.name}</DialogTitle>
   <DialogContent>
    {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
    {image?<Box component="img" src={url} alt={selected?.name} sx={{display:'block',maxWidth:'100%',maxHeight:'65vh',mx:'auto',objectFit:'contain'}}/>:
     pdf&&selected?<Suspense fallback={<Box sx={{display:'grid',placeItems:'center',minHeight:120}}><CircularProgress size={28} aria-label="正在加载 PDF 预览"/></Box>}><PdfPreview blob={selected.blob} name={selected.name}/></Suspense>:
     textFile&&selected&&selected.size<=200_000?<Box component="pre" sx={{m:0,whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'inherit',fontSize:16,lineHeight:1.7}}>{textPreview??'正在读取…'}</Box>:
     <Typography color="text.secondary">{textFile?'文件较大，请保存后查看。':'这种附件请保存后使用对应应用打开。'}</Typography>}
   </DialogContent>
   <DialogActions><Button onClick={()=>setSelected(null)}>关闭</Button><Button variant="contained" onClick={()=>void download()}>保存附件</Button></DialogActions>
  </Dialog>
 </>;
}
