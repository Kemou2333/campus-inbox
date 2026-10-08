import {useEffect,useState} from 'react';
import {Alert,Box,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,InputAdornment,Stack,Tab,Tabs,TextField,Typography} from '@mui/material';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import type {CampusController} from '../../app/useCampus';
import {AuthError,type AuthSession,type EmailChallenge} from '../../infrastructure/auth-client';
import {canonicalEmail} from '../../../server/contracts/email-policy.mjs';

interface Props {open:boolean;app:CampusController;onClose:()=>void}
const normalUsername=(value:string)=>value.normalize('NFKC').trim().toLowerCase();
export function LoginDialog({open,app,onClose}:Props){
 const [method,setMethod]=useState<'email'|'account'>('account');
 const [register,setRegister]=useState(false);
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[repeated,setRepeated]=useState(''),[invite,setInvite]=useState('');
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState<EmailChallenge|null>(null);
 const [showPassword,setShowPassword]=useState(false),[transferApproved,setTransferApproved]=useState(false);
 const [pendingSession,setPendingSession]=useState<AuthSession|null>(null);
 const [working,setWorking]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState('');
 const [retryAt,setRetryAt]=useState(0),[clock,setClock]=useState(Date.now());
 const binding=app.sync.connected;
 const emailEnabled=!!app.authOptions?.emailEnabled;
 const emailForm=binding||method==='email';
 const differentAccount=!!app.username&&normalUsername(username)!==normalUsername(app.username)&&app.notices.length>0;
 const needsTransfer=!!pendingSession||!emailForm&&differentAccount;
 const waiting=Math.max(0,Math.ceil((retryAt-clock)/1000));
 const waitLabel=waiting>3600?`${Math.ceil(waiting/3600)}小时后`:waiting>60?`${Math.ceil(waiting/60)}分钟后`:`${waiting}s`;
 const busy=working||sending;
 useEffect(()=>{
  if(!open){setPassword('');setRepeated('');setCode('');return;}
  setMethod(app.authOptions?.emailEnabled?'email':'account');setRegister(false);setUsername(app.username);setEmail(app.email||'');setCode('');setChallenge(null);setError('');setPendingSession(null);setTransferApproved(false);setShowPassword(false);
 },[open]);
 useEffect(()=>{
  if(!open||retryAt<=Date.now())return;
  setClock(Date.now());const timer=setInterval(()=>{const t=Date.now();setClock(t);if(t>=retryAt)clearInterval(timer);},1000);return()=>clearInterval(timer);
 },[open,retryAt]);
 function close(){if(busy)return;if(pendingSession)void app.auth?.logout(pendingSession.key).catch(()=>{});setPendingSession(null);onClose();}
 function fail(issue:unknown){
  setError(issue instanceof Error?issue.message:'操作未完成，请重试。');
  if(issue instanceof AuthError&&issue.retryAfterSeconds){setRetryAt(Date.now()+issue.retryAfterSeconds*1000);setClock(Date.now());}
 }
 async function send(){
  if(busy||waiting||!app.auth)return;setError('');
  let address:string;try{address=canonicalEmail(email);}catch(issue){fail(issue);return;}
  setSending(true);
  try{const value=await app.auth.requestEmail(address,binding?'bind':'login',binding?app.cloud?.getKey()||undefined:undefined);setEmail(address);setChallenge(value);setCode('');setRetryAt(Date.now()+value.retryAfterSeconds*1000);setClock(Date.now());}
  catch(issue){fail(issue);}
  finally{setSending(false);}
 }
 async function finish(session:AuthSession){
  if(app.username&&normalUsername(session.username)!==normalUsername(app.username)&&app.notices.length>0&&!transferApproved){setPendingSession(session);return;}
  await app.login(session);setPendingSession(null);setPassword('');setRepeated('');setCode('');setInvite('');onClose();
 }
 async function submit(){
  if(busy||!app.auth)return;setError('');
  if(needsTransfer&&!transferApproved){setError('请确认是否把本机通知同步到这个账号。');return;}
  if(!pendingSession&&emailForm&&(!challenge||!/^\d{6}$/.test(code))){setError('请获取并填写六位验证码。');return;}
  if(!pendingSession&&!emailForm){
   if(!username.trim()||!password){setError('请填写用户名和密码。');return;}
   if(register&&password!==repeated){setError('两次输入的密码不一致。');return;}
  }
  setWorking(true);let accountCreated=false;
  try{
   if(pendingSession){await finish(pendingSession);return;}
   if(emailForm){
    if(binding){await app.bindEmail(challenge!.challengeId,code);setCode('');onClose();}
    else{const session=await app.auth.verifyEmail(challenge!.challengeId,code);setChallenge(null);await finish(session);}
   }else{
    const session=register?await app.auth.register(invite.trim().toUpperCase(),username,password):await app.auth.login(username,password);
    accountCreated=register;await finish(session);
   }
  }catch(issue){
   if(!emailForm&&(accountCreated||issue instanceof AuthError&&issue.code==='ACCOUNT_CREATED_LOGIN_PENDING')){setRegister(false);setInvite('');setError(!accountCreated&&issue instanceof AuthError?issue.message:'账号已创建，请稍后登录。');}
   else{if(issue instanceof AuthError&&['ACCOUNT_CREATED_LOGIN_PENDING','EMAIL_LOGIN_PENDING'].includes(issue.code||'')){setChallenge(null);setCode('');}fail(issue);}
  }finally{setWorking(false);}
 }
 return <Dialog open={open} onClose={close}>
  <DialogTitle>{binding?'绑定邮箱':register&&method==='account'?'注册':'登录'}</DialogTitle>
  <DialogContent>
   {!binding&&emailEnabled&&!pendingSession&&<Tabs value={method} variant="fullWidth" aria-label="登录方式" sx={{mb:2}} onChange={(_,value)=>{if(busy)return;setMethod(value);setError('');setTransferApproved(false);}}><Tab value="email" label="邮箱" disabled={busy}/><Tab value="account" label="账号" disabled={busy}/></Tabs>}
   <Box component="form" id="campus-login-form" onSubmit={event=>{event.preventDefault();void submit();}}>
    <Stack spacing={2}>
     {error&&<Alert severity="error">{error}</Alert>}
     {pendingSession?<Typography sx={{overflowWrap:'anywhere'}}>{pendingSession.email||pendingSession.username}</Typography>:emailForm?<>
      <TextField label="邮箱" type="email" required value={email} disabled={busy||!emailEnabled} onChange={event=>{setEmail(event.target.value);setChallenge(null);setCode('');setTransferApproved(false);}} slotProps={{htmlInput:{maxLength:254,autoComplete:'email',autoCapitalize:'none'}}}/>
      <Stack direction="row" spacing={1} sx={{alignItems:'flex-start'}}>
       <TextField label="验证码" required value={code} disabled={busy||!challenge} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,6))} slotProps={{htmlInput:{maxLength:6,inputMode:'numeric',autoComplete:'one-time-code'}}}/>
       <Button variant="outlined" disabled={busy||!!waiting||!email.trim()||!emailEnabled} onClick={()=>void send()} sx={{height:56,flexShrink:0,whiteSpace:'nowrap',px:1.5}}>{sending?'发送中':waiting?waitLabel:'获取验证码'}</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">{challenge?'5分钟内有效。没收到？检查垃圾邮件。':binding?'验证后可用邮箱登录原账号。':'首次登录会创建账号。'}</Typography>
     </>:<>
      {register&&<TextField label="邀请码" required value={invite} disabled={busy} onChange={event=>setInvite(event.target.value.toUpperCase())} slotProps={{htmlInput:{maxLength:8,autoComplete:'off',autoCapitalize:'characters'}}}/>}
      <TextField label="用户名" required value={username} disabled={busy} onChange={event=>{setUsername(event.target.value);setTransferApproved(false);}} slotProps={{htmlInput:{maxLength:24,autoComplete:'username',autoCapitalize:'none'}}}/>
      <TextField label="密码" required type={showPassword?'text':'password'} value={password} disabled={busy} onChange={event=>setPassword(event.target.value)} slotProps={{htmlInput:{maxLength:128,autoComplete:register?'new-password':'current-password'},input:{endAdornment:<InputAdornment position="end"><IconButton disabled={busy} aria-label={showPassword?'隐藏密码':'显示密码'} onMouseDown={event=>event.preventDefault()} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<VisibilityOffOutlined/>:<VisibilityOutlined/>}</IconButton></InputAdornment>}}}/>
      {register&&<TextField label="再次输入密码" required type={showPassword?'text':'password'} value={repeated} disabled={busy} onChange={event=>setRepeated(event.target.value)} slotProps={{htmlInput:{maxLength:128,autoComplete:'new-password'}}}/>}
      <Button disabled={busy} onClick={()=>{setRegister(!register);setError('');setRepeated('');}} sx={{alignSelf:'flex-start',px:0}}>{register?'返回登录':'邀请码注册'}</Button>
     </>}
     {needsTransfer&&<FormControlLabel sx={{alignItems:'flex-start',m:0}} control={<Checkbox checked={transferApproved} disabled={busy} onChange={event=>setTransferApproved(event.target.checked)}/>} label="把本机通知同步到这个账号"/>}
    </Stack>
   </Box>
  </DialogContent>
  <DialogActions><Button disabled={busy} onClick={close}>取消</Button><Button type="submit" form="campus-login-form" variant="contained" disabled={busy||!app.auth||needsTransfer&&!transferApproved||emailForm&&!pendingSession&&(!emailEnabled||!challenge||code.length!==6)}>{working?'请稍候':pendingSession?'继续':binding?'绑定':register?'注册':'登录'}</Button></DialogActions>
 </Dialog>;
}
export default LoginDialog;
