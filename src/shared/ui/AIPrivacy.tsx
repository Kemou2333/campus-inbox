import {Stack,Typography} from '@mui/material';

export const AI_PRIVACY_FIRST_USE='原文会发给DeepSeek处理，请勿粘贴身份证号、手机号等敏感信息。';

export function AIPrivacyContent(){
 return <Stack spacing={1.5} sx={{color:'text.secondary',lineHeight:1.8}}>
  <Typography>使用 AI 整理时，通知原文会通过本应用的服务器发送给第三方模型 DeepSeek；提问时，会发送当前通知原文和你的问题。请先去掉身份证号、手机号等敏感信息。</Typography>
  <Typography>图片和文件附件本身不会发送给模型，也不参与普通云同步，保留在本机。</Typography>
  <Typography>AI 可能出错，重要信息请核对原文。</Typography>
 </Stack>;
}
