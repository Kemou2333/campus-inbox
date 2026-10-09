import {useEffect,useState} from 'react';
import {Alert,Box,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,InputAdornment,Stack,TextField,Typography} from '@mui/material';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import type {CampusController} from '../../app/useCampus';
import {AuthError,type AuthSession,type EmailChallenge} from '../../infrastructure/auth-client';
import {canonicalEmail} from '../../../server/contracts/email-policy.mjs';

interface Props {open:boolean;app:CampusController;onClose:()=>void}
const normalUsername=(value:string)=>value.normalize('NFKC').trim().toLowerCase();
export function LoginDialog({open,app,onClose}:Props){
 const [mode,setMode]=useState<'login'|'register'|'password'>('login');
 const [registration,setRegistration]=useState<'email'|'invite'>('email');
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[repeated,setRepeated]=useState(''),[invite,setInvite]=useState('');
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState<EmailChallenge|null>(null);
 const [showPassword,setShowPassword]=useState(false),[transferApproved,setTransferApproved]=useState(false);
 const [pendingSession,setPendingSession]=useState<AuthSession|null>(null);
 const [working,setWorking]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState('');
 const [retryAt,setRetryAt]=useState(0),[clock,setClock]=useState(Date.now());
 const binding=app.sync.connected;
 const emailEnabled=!!app.authOptions?.emailEnabled;
 const registering=!binding&&mode==='register',settingPassword=!binding&&mode==='password';
 const emailForm=binding||settingPassword||registering&&registration==='email';
 const passwordForm=!binding;
 const needsTransfer=!!pendingSession;
 const waiting=Math.max(0,Math.ceil((retryAt-clock)/1000));
 const waitLabel=waiting>3600?`${Math.ceil(waiting/3600)}小时后`:waiting>60?`${Math.ceil(waiting/60)}分钟后`:`${waiting}s`;
 const busy=working||sending;
 useEffect(()=>{
  if(!open){setPassword('');setRepeated('');setCode('');return;}
  setMode('login');setRegistration(app.authOptions?.emailEnabled?'email':'invite');setUsername(app.username);setEmail(app.email||'');setCode('');setChallenge(null);setError('');setPendingSession(null);setTransferApproved(false);setShowPassword(false);
 },[open]);
 useEffect(()=>{
  if(!open||retryAt<=Date.now())return;
  setClock(Date.now());const timer=setInterval(()=>{const t=Date.now();setClock(t);if(t>=retryAt)clearInterval(timer);},1000);return()=>clearInterval(timer);
 },[open,retryAt]);
 function close(){if(busy)return;if(pendingSession)void app.auth?.logout(pendingSession.key).catch(()=>{});setPendingSession(null);onClose();}
 function changeMode(value:'login'|'register'|'password'){
  if(busy)return;if(value==='register')setRegistration(emailEnabled?'email':'invite');setMode(value);setError('');setChallenge(null);setCode('');setRepeated('');setTransferApproved(false);
 }
 function fail(issue:unknown){
  setError(issue instanceof Error?issue.message:'操作未完成，请重试。');
  if(issue instanceof AuthError&&issue.retryAfterSeconds){setRetryAt(Date.now()+issue.retryAfterSeconds*1000);setClock(Date.now());}
 }
 function validatePassword(){
  if(password.length<8||password.length>128)throw new Error('密码需为 8–128 个字符。');
  if((registering||settingPassword)&&password!==repeated)throw new Error('两次输入的密码不一致。');
  if(registering&&(!/^[a-z0-9_\-\p{Script=Han}]{3,24}$/u.test(normalUsername(username))))throw new Error('用户名需为 3–24 个中文、字母、数字、下划线或短横线。');
 }
 async function send(){
  if(busy||waiting||!app.auth)return;setError('');
  let address:string;try{address=canonicalEmail(email);if(!binding)validatePassword();}catch(issue){fail(issue);return;}
  setSending(true);
  try{
   const purpose=binding?'bind':settingPassword?'password':'register';
   const value=await app.auth.requestEmail(address,purpose,binding?app.cloud?.getKey()||undefined:undefined);
   setEmail(address);setChallenge(value);setCode('');setRetryAt(Date.now()+value.retryAfterSeconds*1000);setClock(Date.now());
  }catch(issue){fail(issue);}
  finally{setSending(false);}
 }
 async function finish(session:AuthSession){
  if(app.username&&normalUsername(session.username)!==normalUsername(app.username)&&app.notices.length>0&&!transferApproved){setPendingSession(session);return;}
  await app.login(session);setPendingSession(null);setPassword('');setRepeated('');setCode('');setInvite('');onClose();
 }
 async function submit(){
  if(busy||!app.auth)return;setError('');
  if(needsTransfer&&!transferApproved){setError('请确认是否把本机通知同步到这个账号。');return;}
  if(!pendingSession){
   if(emailForm&&(!challenge||!/^\d{6}$/.test(code))){setError('请获取并填写六位验证码。');return;}
   if(passwordForm){
    try{validatePassword();}catch(issue){fail(issue);return;}
    if(!settingPassword&&!username.trim()){setError('请填写邮箱或用户名。');return;}
   }
  }
  setWorking(true);let accountCreated=false;
  try{
   if(pendingSession){await finish(pendingSession);return;}
   if(binding){await app.bindEmail(challenge!.challengeId,code);setCode('');onClose();return;}
   let session:AuthSession;
   if(settingPassword)session=await app.auth.setEmailPassword(challenge!.challengeId,code,password);
   else if(registering&&registration==='email')session=await app.auth.registerEmail(challenge!.challengeId,code,username,password);
   else if(registering)session=await app.auth.register(invite.trim().toUpperCase(),username,password);
   else session=await app.auth.login(username,password);
   accountCreated=registering;setChallenge(null);await finish(session);
  }catch(issue){
   if(accountCreated||issue instanceof AuthError&&['ACCOUNT_CREATED_LOGIN_PENDING','EMAIL_LOGIN_PENDING'].includes(issue.code||'')){
    setMode('login');setInvite('');setChallenge(null);setCode('');
    if(settingPassword||registration==='email')setUsername(email);
    setError(issue instanceof AuthError?issue.message:'账号已创建，请稍后登录。');
   }else fail(issue);
  }finally{setWorking(false);}
 }
 const title=binding?'绑定邮箱':settingPassword?'设置密码':registering?'注册':'登录';
 return <Dialog open={open} onClose={close}>
  <DialogTitle>{title}</DialogTitle>
  <DialogContent>
   <Box component="form" id="campus-login-form" sx={{pt:1}} onSubmit={event=>{event.preventDefault();void submit();}}>
    <Stack spacing={2}>
     {error&&<Alert severity="error">{error}</Alert>}
     {pendingSession?<Typography sx={{overflowWrap:'anywhere'}}>{pendingSession.email||pendingSession.username}</Typography>:<>
      {registering&&registration==='invite'&&<TextField label="邀请码" required value={invite} disabled={busy} onChange={event=>setInvite(event.target.value.toUpperCase())} slotProps={{htmlInput:{maxLength:8,autoComplete:'off',autoCapitalize:'characters'}}}/>}
      {!binding&&!settingPassword&&<TextField label={registering?'用户名':'邮箱或用户名'} required value={username} disabled={busy} onChange={event=>setUsername(event.target.value)} slotProps={{htmlInput:{maxLength:registering?24:254,autoComplete:'username',autoCapitalize:'none'}}}/>}
      {emailForm&&<TextField label="邮箱" type="email" required value={email} disabled={busy||!emailEnabled} onChange={event=>{setEmail(event.target.value);setChallenge(null);setCode('');}} slotProps={{htmlInput:{maxLength:254,autoComplete:'email',autoCapitalize:'none'}}}/>}
      {passwordForm&&<TextField label="密码" required type={showPassword?'text':'password'} value={password} disabled={busy} onChange={event=>setPassword(event.target.value)} slotProps={{htmlInput:{maxLength:128,autoComplete:registering||settingPassword?'new-password':'current-password'},input:{endAdornment:<InputAdornment position="end"><IconButton disabled={busy} aria-label={showPassword?'隐藏密码':'显示密码'} onMouseDown={event=>event.preventDefault()} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<VisibilityOffOutlined/>:<VisibilityOutlined/>}</IconButton></InputAdornment>}}}/>}
      {(registering||settingPassword)&&<TextField label="再次输入密码" required type={showPassword?'text':'password'} value={repeated} disabled={busy} onChange={event=>setRepeated(event.target.value)} slotProps={{htmlInput:{maxLength:128,autoComplete:'new-password'}}}/>}
      {emailForm&&<>
       <Stack direction="row" spacing={1} sx={{alignItems:'flex-start'}}>
        <TextField label="验证码" required value={code} disabled={busy||!challenge} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,6))} slotProps={{htmlInput:{maxLength:6,inputMode:'numeric',autoComplete:'one-time-code'}}}/>
        <Button variant="outlined" disabled={busy||!!waiting||!email.trim()||!emailEnabled} onClick={()=>void send()} sx={{height:56,flexShrink:0,whiteSpace:'nowrap',px:1.5}}>{sending?'发送中':waiting?waitLabel:'获取验证码'}</Button>
       </Stack>
       <Typography variant="body2" color="text.secondary">{challenge?'5分钟内有效。没收到？检查垃圾邮件。':settingPassword?'仅用于之前未设置密码的邮箱账号。':binding?'绑定后可用邮箱和原密码登录。':'注册后使用密码登录。'}</Typography>
      </>}
      {!binding&&<Stack direction="row" useFlexGap spacing={1} sx={{flexWrap:'wrap'}}>
       <Button disabled={busy||mode==='login'&&!app.authOptions} onClick={()=>changeMode(registering||settingPassword?'login':'register')} sx={{px:0}}>{registering||settingPassword?'返回登录':'注册'}</Button>
       {registering&&emailEnabled&&app.authOptions?.inviteEnabled&&<Button disabled={busy} onClick={()=>{setRegistration(registration==='email'?'invite':'email');setChallenge(null);setCode('');setError('');}} sx={{px:0}}>{registration==='email'?'邀请码注册':'邮箱注册'}</Button>}
       {mode==='login'&&emailEnabled&&<Button disabled={busy} onClick={()=>changeMode('password')} sx={{px:0,color:'text.secondary'}}>设置密码</Button>}
      </Stack>}
     </>}
     {needsTransfer&&<FormControlLabel sx={{alignItems:'flex-start',m:0}} control={<Checkbox checked={transferApproved} disabled={busy} onChange={event=>setTransferApproved(event.target.checked)}/>} label="把本机通知同步到这个账号"/>}
    </Stack>
   </Box>
  </DialogContent>
  <DialogActions><Button disabled={busy} onClick={close}>取消</Button><Button type="submit" form="campus-login-form" variant="contained" disabled={busy||!app.auth||needsTransfer&&!transferApproved||emailForm&&!pendingSession&&(!emailEnabled||!challenge||code.length!==6)}>{working?'请稍候':pendingSession?'继续':binding?'绑定':settingPassword?'保存':registering?'注册':'登录'}</Button></DialogActions>
 </Dialog>;
}
export default LoginDialog;
