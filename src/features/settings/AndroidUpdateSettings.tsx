import {useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,ButtonBase,CircularProgress,Stack,Typography} from '@mui/material';
import SystemUpdateOutlined from '@mui/icons-material/SystemUpdateOutlined';
import Refresh from '@mui/icons-material/Refresh';
import type {AppUpdateResult,PlatformAPI} from '../../platform';
import {version as bundledVersion} from '../../../package.json';

/** Explicit metadata check; downloading still requires a separate user action. */
export function AndroidUpdateSettings({platform}:{platform:PlatformAPI}){
 const [currentVersion,setCurrentVersion]=useState(bundledVersion);
 const [checking,setChecking]=useState(false);
 const [result,setResult]=useState<AppUpdateResult|null>(null);
 const inFlight=useRef(false),alive=useRef(true);
 useEffect(()=>{
  alive.current=true;
  void platform.ready.then(capabilities=>{if(alive.current&&capabilities.appVersion)setCurrentVersion(capabilities.appVersion);}).catch(()=>{});
  return()=>{alive.current=false;};
 },[platform]);
 async function check(){
  if(inFlight.current)return;
  inFlight.current=true;setChecking(true);setResult(null);
  try{
   const next=await platform.checkForUpdate?.()??{status:'unsupported' as const};
   if(alive.current){setResult(next);if(next.currentVersion)setCurrentVersion(next.currentVersion);}
  }catch{if(alive.current)setResult({status:'error'});}
  finally{inFlight.current=false;if(alive.current)setChecking(false);}
 }
 const message=result?.status==='current'?'已是最新版':result?.status==='available'?`发现新版 ${result.version}`
  :result?.status==='busy'?'正在检查，请稍后再点。':result?.status==='cooldown'?'刚刚检查过，请稍后再试。'
   :result?.status==='unsupported'?'请先安装最新版，即可在这里检查更新。':'暂时连不上更新服务，稍后再试。';
 return <Box>
  <ButtonBase onClick={()=>void check()} disabled={checking} sx={{width:'100%',textAlign:'left',px:{xs:2,sm:2.5},py:2,
   display:'flex',gap:1.25,alignItems:'center','&:hover':{bgcolor:'action.hover'},'&.Mui-disabled':{opacity:.7},
   '&.Mui-focusVisible':{outline:'2px solid',outlineColor:'primary.main',outlineOffset:-3}}}>
   <Box sx={{width:34,height:34,borderRadius:'10px',display:'grid',placeItems:'center',flexShrink:0,color:'text.secondary',bgcolor:'action.hover'}}><SystemUpdateOutlined sx={{fontSize:21}}/></Box>
   <Box sx={{flex:1,minWidth:0}}><Typography component="span" sx={{display:'block',fontSize:18,fontWeight:650}}>检查更新</Typography>
    <Typography component="span" sx={{display:'block',fontSize:14,color:'text.secondary',mt:.35}}>当前版本 {currentVersion}</Typography></Box>
   {checking?<Stack direction="row" sx={{gap:.75,alignItems:'center',flexShrink:0}}><CircularProgress size={18}/><Typography sx={{fontSize:14}}>检查中…</Typography></Stack>:<Refresh sx={{fontSize:21,color:'text.secondary',flexShrink:0}}/>}
  </ButtonBase>
  {result&&<Alert role="status" severity={result.status==='current'?'success':result.status==='error'?'warning':'info'} sx={{mx:{xs:2,sm:2.5},mb:2,fontSize:15,
   '& .MuiAlert-message':{minWidth:0,overflowWrap:'anywhere'}}}>
   {message}
   {result.status==='available'&&result.download&&<>
    <Button component="a" href={result.download} target="_blank" rel="noopener noreferrer" variant="contained" size="small" sx={{display:'flex',mt:1,fontSize:15}}>下载更新</Button>
    <Typography sx={{fontSize:13,mt:1,lineHeight:1.7}}>下载后需在系统安装界面确认。</Typography>
   </>}
  </Alert>}
 </Box>;
}
