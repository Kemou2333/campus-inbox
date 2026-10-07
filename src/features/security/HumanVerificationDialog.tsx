import {useEffect,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,Stack,TextField,Typography} from '@mui/material';
import type {HumanVerificationRequest} from '../../infrastructure/ai-client';

/** Verification image comes from our own server; no third-party script or account. */
export function HumanVerificationDialog({request,onComplete,onCancel}:{request:HumanVerificationRequest|null;onComplete:(answer:string)=>void;onCancel:()=>void}){
 const [answer,setAnswer]=useState('');
 const [imageError,setImageError]=useState(false);
 useEffect(()=>{setAnswer('');setImageError(false);},[request]);
 function submit(){if(answer.length===4&&!imageError)onComplete(answer);}
 return <Dialog open={!!request} onClose={onCancel} maxWidth="xs" aria-labelledby="human-verification-title">
  <DialogTitle id="human-verification-title">安全验证</DialogTitle>
  <DialogContent>
   <Typography variant="body2" color="text.secondary" sx={{mb:2}}>连续整理较多通知，请输入图中的四位数字。</Typography>
   {request?.error&&<Alert severity="warning" sx={{mb:1.5}}>{request.error}</Alert>}
   {imageError&&<Alert severity="warning" sx={{mb:1.5}}>图片未能显示，请取消后重试。</Alert>}
   <Box component="form" id="campus-verification-form" onSubmit={event=>{event.preventDefault();submit();}}>
    <Stack spacing={2}>
     {request&&<Box component="img" src={request.image} alt="四位数字验证码" onError={()=>setImageError(true)} sx={{display:'block',width:200,maxWidth:'100%',height:72,objectFit:'contain',alignSelf:'center',borderRadius:1.5,bgcolor:'#F0F4F7'}}/>}
     <TextField label="验证码" autoFocus value={answer} onChange={event=>setAnswer(event.target.value.replace(/\D/g,'').slice(0,4))}
      slotProps={{htmlInput:{inputMode:'numeric',pattern:'[0-9]{4}',maxLength:4,autoComplete:'off',autoCorrect:'off',autoCapitalize:'off','aria-label':'四位数字验证码'}}}/>
    </Stack>
   </Box>
  </DialogContent>
  <DialogActions><Button onClick={onCancel}>取消</Button><Button variant="contained" type="submit" form="campus-verification-form" disabled={answer.length!==4||imageError}>继续整理</Button></DialogActions>
 </Dialog>;
}
