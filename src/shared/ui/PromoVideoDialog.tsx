import {useEffect,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogContent,DialogTitle,IconButton,Typography} from '@mui/material';
import Close from '@mui/icons-material/Close';

const VIDEO='./assets/note-inbox-intro-v10.mp4';

/** Mounted only after the visitor chooses to watch; no poster or startup request. */
export default function PromoVideoDialog({onClose}:{onClose:()=>void}){
 const [player,setPlayer]=useState<HTMLVideoElement|null>(null);
 const [attempt,setAttempt]=useState(0),[failed,setFailed]=useState(false),[manualPlay,setManualPlay]=useState(false);
 useEffect(()=>{
  if(!player)return;
  let active=true;
  // Effect replay may follow a cleanup in development; restore the same local asset.
  if(!player.getAttribute('src'))player.setAttribute('src',VIDEO);
  void player.play().catch(()=>{if(active&&!player.error)setManualPlay(true);});
  return()=>{active=false;player.pause();player.removeAttribute('src');player.load();};
 },[player]);
 function retry(){setFailed(false);setManualPlay(false);setAttempt(value=>value+1);}
 return <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby="promo-video-title">
  <DialogTitle id="promo-video-title" sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:1,pr:{xs:1,sm:2}}}>拾笺介绍<IconButton aria-label="关闭介绍视频" onClick={onClose}><Close/></IconButton></DialogTitle>
  <DialogContent sx={{pb:2.5}}>
   <Box sx={{bgcolor:'#101816',borderRadius:1.5,overflow:'hidden'}}>
    <video key={attempt} ref={setPlayer} src={VIDEO} controls playsInline preload="none" aria-label="拾笺 Note Inbox 介绍视频" onPlay={()=>setManualPlay(false)} onError={()=>setFailed(true)} style={{display:'block',width:'100%',aspectRatio:'16 / 9',maxHeight:'70dvh'}}/>
   </Box>
   {failed?<Alert severity="warning" sx={{mt:1.5}} action={<Button color="inherit" onClick={retry}>重试</Button>}>暂时无法播放，请重试。</Alert>:manualPlay&&<Typography variant="body2" color="text.secondary" sx={{mt:1}}>点击播放按钮观看。</Typography>}
  </DialogContent>
 </Dialog>;
}
