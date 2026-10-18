import {useEffect,useState} from 'react';
import {Box,Button,IconButton,Stack,Tooltip,Typography} from '@mui/material';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import {fallbackAndroidDownload,loadAndroidDownload} from '../../infrastructure/android-download';

export function AndroidDownloads({compact=false}:{compact?:boolean}){
 const [release,setRelease]=useState(fallbackAndroidDownload);
 const [copied,setCopied]=useState(false);
 useEffect(()=>{let alive=true;void loadAndroidDownload().then(value=>{if(alive)setRelease(value);});return()=>{alive=false;};},[]);
 return <Box className="android-downloads" sx={{mt:compact?1.5:2.5,p:compact?1.5:2,bgcolor:'action.hover',borderRadius:2}}>
  <Stack direction="row" sx={{alignItems:'baseline',gap:1,mb:1,flexWrap:'wrap'}}><Typography sx={{fontWeight:700}}>安卓手机版</Typography><Typography variant="caption" color="text.secondary">{release.version}{release.sizeBytes?` · ${(release.sizeBytes/1048576).toFixed(1)} MB`:''}</Typography></Stack>
  <Stack direction="row" sx={{gap:1,flexWrap:'wrap'}}>
   {release.lanzou&&<Button component="a" variant="contained" href={release.lanzou} target="_blank" rel="noopener noreferrer" startIcon={<DownloadOutlined/>}>蓝奏下载</Button>}
   <Button component="a" variant={release.lanzou?'outlined':'contained'} href={release.github} target="_blank" rel="noopener noreferrer" startIcon={release.lanzou?undefined:<DownloadOutlined/>}>{release.lanzou?'GitHub 备用':'下载安卓版'}</Button>
  </Stack>
  {release.lanzou&&release.extractionCode&&<Stack direction="row" sx={{alignItems:'center',gap:.5,mt:1}}><Typography sx={{fontSize:16}}>提取码 <Box component="strong" sx={{fontSize:20,letterSpacing:2,color:'primary.main',ml:.5}}>{release.extractionCode}</Box></Typography><Tooltip title={copied?'已复制':'复制提取码'}><IconButton size="small" aria-label={copied?'已复制提取码':'复制提取码'} onClick={()=>{void navigator.clipboard?.writeText(release.extractionCode!).then(()=>setCopied(true)).catch(()=>setCopied(false));}}><ContentCopyOutlined fontSize="small"/></IconButton></Tooltip>{copied&&<Typography role="status" variant="caption" color="primary">已复制</Typography>}</Stack>}
 </Box>;
}
