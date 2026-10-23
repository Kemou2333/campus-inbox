import {useState} from 'react';
import {Button,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Typography} from '@mui/material';

export const AI_PRIVACY_FIRST_USE='原文会发给DeepSeek处理，请勿粘贴身份证号、手机号等敏感信息。';

export function AIPrivacyLink(){
 const [open,setOpen]=useState(false);
 return <><Button size="small" color="inherit" onClick={()=>setOpen(true)} sx={{fontSize:12.5,color:'text.secondary',minWidth:0,px:.75,py:.5,minHeight:36}}>隐私说明</Button>
  <Dialog open={open} onClose={()=>setOpen(false)} aria-labelledby="ai-privacy-heading" maxWidth="xs" fullWidth>
   <DialogTitle id="ai-privacy-heading">AI 与隐私</DialogTitle>
   <DialogContent><Stack spacing={1.5} sx={{color:'text.secondary',lineHeight:1.8}}>
    <Typography>使用 AI 整理时，通知原文会通过本应用的服务器发送给第三方模型 DeepSeek；提问时，会发送当前通知原文和你的问题。请先去掉身份证号、手机号等敏感信息。</Typography>
    <Typography>图片和文件附件本身不会发送给模型，也不参与普通云同步，保留在本机。从附件提取并放进输入框的文字仍会随原文发送。登录后，通知文字、进度和笔记会同步到本应用的服务器。</Typography>
    <Typography>预置示例体验不调用模型。真实 AI 结果可能出错，重要信息请核对原文。</Typography>
   </Stack></DialogContent>
   <DialogActions><Button onClick={()=>setOpen(false)}>知道了</Button></DialogActions>
  </Dialog></>;
}
