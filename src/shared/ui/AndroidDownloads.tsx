import {useEffect,useState} from 'react';
import {Box,Button,IconButton,Stack,Tooltip,Typography} from '@mui/material';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import {initialAndroidDownload,loadAndroidDownload} from '../../infrastructure/android-download';

export function AndroidDownloads({compact=false}:{compact?:boolean}){
 const [release,setRelease]=useState(initialAndroidDownload);
 const [copyMessage,setCopyMessage]=useState('');
 useEffect(()=>{let alive=true;void loadAndroidDownload().then(value=>{if(alive)setRelease(value);});return()=>{alive=false;};},[]);
 async function copyCode(){try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(release.extractionCode!);setCopyMessage('已复制');}catch{setCopyMessage('请长按提取码复制');}}
 return <Box className="android-downloads" sx={{mt:compact?1.5:2.5,p:compact?1.5:2,bgcolor:'action.hover',borderRadius:2}}>
  <Stack direction="row" sx={{alignItems:'baseline',gap:1,mb:1,flexWrap:'wrap'}}><Typography sx={{fontWeight:700}}>安卓手机版</Typography><Typography variant="caption" color="text.secondary">{release.version}{release.sizeBytes?` · ${(release.sizeBytes/1048576).toFixed(1)} MB`:''}</Typography></Stack>
  <Stack direction="row" sx={{gap:1,flexWrap:'wrap'}}>
   {release.primary&&<Button component="a" variant="contained" href={release.primary} target="_blank" rel="noopener noreferrer" startIcon={<DownloadOutlined/>}>主下载</Button>}
   {release.aliyun&&<Button component="a" variant={release.primary?'outlined':'contained'} href={release.aliyun} target="_blank" rel="noopener noreferrer" startIcon={release.primary?undefined:<DownloadOutlined/>}>{release.primary?'阿里云备用':'阿里云下载'}</Button>}
   {!release.aliyun&&release.lanzou&&<Button component="a" variant="contained" href={release.lanzou} target="_blank" rel="noopener noreferrer" startIcon={<DownloadOutlined/>}>蓝奏下载</Button>}
   <Button component="a" variant={release.primary||release.aliyun||release.lanzou?'outlined':'contained'} href={release.github} target="_blank" rel="noopener noreferrer" startIcon={release.primary||release.aliyun||release.lanzou?undefined:<DownloadOutlined/>}>{release.primary||release.aliyun||release.lanzou?'GitHub 备用':'下载安卓版'}</Button>
  </Stack>
  {release.lanzou&&release.extractionCode&&<Stack direction="row" sx={{alignItems:'center',gap:.5,mt:1,flexWrap:'wrap'}}><Typography sx={{fontSize:16}}>提取码 <Box component="strong" sx={{fontSize:20,letterSpacing:2,color:'primary.main',ml:.5,userSelect:'text'}}>{release.extractionCode}</Box></Typography><Tooltip title={copyMessage==='已复制'?'已复制':'复制提取码'}><IconButton size="small" aria-label="复制提取码" onClick={()=>void copyCode()}><ContentCopyOutlined fontSize="small"/></IconButton></Tooltip>{copyMessage&&<Typography role="status" variant="caption" color="primary">{copyMessage}</Typography>}</Stack>}
 </Box>;
}
