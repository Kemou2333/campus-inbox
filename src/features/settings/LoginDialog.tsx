import {useEffect,useState} from 'react';
import {Alert,Box,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,InputAdornment,MenuItem,Stack,TextField,Typography} from '@mui/material';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import type {CampusController} from '../../app/useCampus';
import {AuthError,type AuthSession,type EmailChallenge,type AuthCaptcha} from '../../infrastructure/auth-client';
import {ALLOWED_EMAIL_DOMAINS,canonicalEmail,canonicalLoginEmail} from '../../../server/contracts/email-policy.mjs';
import {friendlyErrorMessage} from '../../shared/error-message';
import {useAuthImageChallenge} from './useAuthImageChallenge';

interface Props {open:boolean;app:CampusController;onClose:()=>void}
const normalUsername=(value:string)=>value.normalize('NFKC').trim().toLowerCase();
export function LoginDialog({open,app,onClose}:Props){
 const [mode,setMode]=useState<'login'|'register'|'password'>('register');
 const [legacyLogin,setLegacyLogin]=useState(false),[username,setUsername]=useState(''),[password,setPassword]=useState('');
 const [emailLocal,setEmailLocal]=useState(''),[emailDomain,setEmailDomain]=useState('qq.com');
 const [code,setCode]=useState(''),[challenge,setChallenge]=useState<EmailChallenge|null>(null);
 const [showPassword,setShowPassword]=useState(false),[transferApproved,setTransferApproved]=useState(false);
 const [pendingSession,setPendingSession]=useState<AuthSession|null>(null);
 const [working,setWorking]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 const [retryAt,setRetryAt]=useState(0),[clock,setClock]=useState(Date.now());
 const [imageAnswer,setImageAnswer]=useState('');
 const binding=app.sync.connected;
 const emailEnabled=!!app.authOptions?.emailEnabled;
 const registering=!binding&&mode==='register',settingPassword=!binding&&mode==='password';
 const emailForm=binding||settingPassword||registering;
 const passwordForm=!binding;
 const email=`${emailLocal.trim()}@${emailDomain}`;
 const needsTransfer=!!pendingSession;
 const codeLength=challenge?.codeLength??4;
 const waiting=Math.max(0,Math.ceil((retryAt-clock)/1000));
 const waitLabel=waiting>3600?`${Math.ceil(waiting/3600)}小时后`:waiting>60?`${Math.ceil(waiting/60)}分钟后`:`${waiting}s`;
 const busy=working||sending;
 const imageEnabled=app.authOptions?.imageCaptchaEnabled===true;
 const imagePurpose=emailForm?'email':'login';
 const {challenge:imageChallenge,loading:imageLoading,error:imageError,waiting:imageWaiting,refresh:loadImage,invalidate:clearImage}=useAuthImageChallenge(app.auth,open&&imageEnabled,imagePurpose);
 // A verified older account may use a provider no longer offered for new accounts.
 const oldDomain=app.email?.split('@')[1];
 const emailDomains=ALLOWED_EMAIL_DOMAINS.filter(domain=>!app.authOptions?.domains?.length||app.authOptions.domains.includes(domain));
 if(!registering&&oldDomain&&!emailDomains.includes(oldDomain))emailDomains.push(oldDomain);
 function fillEmail(value:string){
  const at=value.lastIndexOf('@');
  if(at<0){setEmailLocal(value);return;}
  const local=value.slice(0,at),domain=value.slice(at+1).trim().toLowerCase();
  if(emailDomains.includes(domain)){setEmailLocal(local);setEmailDomain(domain);}
  else {setEmailLocal(value);setError('请选择列表中的邮箱后缀。');}
 }
 function changeEmail(value:string){fillEmail(value);setChallenge(null);setCode('');}
 function captcha():AuthCaptcha|undefined{
  if(!imageEnabled)return undefined;
  if(!imageChallenge||Date.parse(imageChallenge.expiresAt)<=Date.now()||!/^\d{4}$/.test(imageAnswer))throw new Error('请填写有效的四位图形验证码。');
  return {id:imageChallenge.id,answer:imageAnswer};
 }
 useEffect(()=>{setImageAnswer('');},[imageChallenge?.id,imagePurpose]);
 useEffect(()=>{
  if(!open){setMode('register');setLegacyLogin(false);setPassword('');setCode('');return;}
  setMode('register');setLegacyLogin(false);setUsername(app.username);setEmailLocal(app.email?.split('@')[0]||'');setEmailDomain(app.email?.split('@')[1]||'qq.com');setCode('');setChallenge(null);setError('');setInfo('');setPendingSession(null);setTransferApproved(false);setShowPassword(false);
 },[open]);
 useEffect(()=>{
  if(!open||retryAt<=Date.now())return;
  setClock(Date.now());const timer=setInterval(()=>{const t=Date.now();setClock(t);if(t>=retryAt)clearInterval(timer);},1000);return()=>clearInterval(timer);
 },[open,retryAt]);
 function close(){if(busy)return;if(pendingSession)void app.auth?.logout(pendingSession.key).catch(()=>{});setPendingSession(null);onClose();}
 function changeMode(value:'login'|'register'|'password'){
  if(busy)return;setMode(value);setLegacyLogin(false);setError('');setInfo('');setChallenge(null);setCode('');setTransferApproved(false);
 }
 function fail(issue:unknown){
  setError(friendlyErrorMessage(issue));
  if(issue instanceof AuthError&&issue.retryAfterSeconds){setRetryAt(Date.now()+issue.retryAfterSeconds*1000);setClock(Date.now());}
 }
 function validatePassword(){if(password.length<8||password.length>128)throw new Error('密码需为 8–128 个字符。');}
 async function send(){
  if(busy||waiting||!app.auth)return;setError('');
  let address:string;try{address=settingPassword?canonicalLoginEmail(email):canonicalEmail(email);if(!binding)validatePassword();}catch(issue){fail(issue);return;}
  setSending(true);
  try{
   const purpose=binding?'bind':settingPassword?'password':'register';
   const value=await app.auth.requestEmail(address,purpose,binding?app.cloud?.getKey()||undefined:undefined,captcha());
   clearImage();setImageAnswer('');fillEmail(address);setChallenge(value);setCode('');setRetryAt(Date.now()+value.retryAfterSeconds*1000);setClock(Date.now());
  }catch(issue){fail(issue);}
  finally{setSending(false);}
 }
 async function finish(session:AuthSession){
  if(app.username&&normalUsername(session.username)!==normalUsername(app.username)&&app.notices.length>0&&!transferApproved){setPendingSession(session);return;}
  await app.login(session);setPendingSession(null);setPassword('');setCode('');
  if(!session.email){setInfo('已登录。绑定邮箱后，下次就能用邮箱登录。');setChallenge(null);return;}
  onClose();
 }
 async function submit(){
  if(busy||!app.auth)return;setError('');
  if(needsTransfer&&!transferApproved){setError('请确认是否把本机通知同步到这个账号。');return;}
  if(!pendingSession){
   if(emailForm&&(!challenge||code.length!==codeLength||!/^[0-9]+$/.test(code))){setError(`请获取并填写${codeLength===4?'四':'六'}位邮件验证码。`);return;}
   if(passwordForm){
    try{validatePassword();if(!registering&&!settingPassword){if(legacyLogin){if(!username.trim())throw new Error('请填写旧账号。');}else canonicalLoginEmail(email);}}catch(issue){fail(issue);return;}
   }
  }
  setWorking(true);let accountCreated=false;
  try{
   if(pendingSession){await finish(pendingSession);return;}
   if(binding){await app.bindEmail(challenge!.challengeId,code);setCode('');onClose();return;}
   let session:AuthSession;
   if(settingPassword)session=await app.auth.setEmailPassword(challenge!.challengeId,code,password);
   else if(registering)session=await app.auth.registerEmail(challenge!.challengeId,code,password);
   else session=await app.auth.login(legacyLogin?username:email,password,captcha());
   accountCreated=registering;setChallenge(null);await finish(session);
  }catch(issue){
   if(accountCreated||issue instanceof AuthError&&['ACCOUNT_CREATED_LOGIN_PENDING','EMAIL_LOGIN_PENDING'].includes(issue.code||'')){
    setMode('login');setLegacyLogin(false);setChallenge(null);setCode('');
    setError(issue instanceof AuthError?friendlyErrorMessage(issue):'账号已创建，请稍后登录。');
   }else {fail(issue);if(imageEnabled&&!emailForm){setImageAnswer('');clearImage();}}
  }finally{setWorking(false);}
 }
 const title=binding?'绑定邮箱':settingPassword?'设置密码':registering?'注册':'登录';
 return <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
  <DialogTitle>{title}</DialogTitle>
  <DialogContent>
   <Box component="form" id="campus-login-form" sx={{pt:1}} onSubmit={event=>{event.preventDefault();void submit();}}>
    <Stack spacing={2}>
     {error&&<Alert severity="error">{error}</Alert>}
     {info&&<Alert severity="success">{info}</Alert>}
     {registering&&!emailEnabled&&<Alert severity="info">暂时无法注册，请稍后再试。</Alert>}
     {pendingSession?<Typography sx={{overflowWrap:'anywhere'}}>{pendingSession.email||'旧账号'}</Typography>:<>
      {!binding&&!registering&&!settingPassword&&legacyLogin?<TextField label="旧账号" helperText="填写原来的用户名或邮箱。" required value={username} disabled={busy} onChange={event=>setUsername(event.target.value)} slotProps={{htmlInput:{maxLength:254,autoComplete:'username',autoCapitalize:'none'}}}/>:<Stack direction="row" spacing={1} sx={{alignItems:'flex-start'}}>
       <TextField label="邮箱" required value={emailLocal} disabled={busy||emailForm&&!emailEnabled} onChange={event=>changeEmail(event.target.value)} sx={{flex:1,minWidth:0}} slotProps={{htmlInput:{maxLength:254,autoComplete:'username',autoCapitalize:'none',spellCheck:false}}}/>
       <TextField select label="后缀" value={emailDomain} disabled={busy||emailForm&&!emailEnabled} onChange={event=>{setEmailDomain(event.target.value);setChallenge(null);setCode('');}} sx={{width:184,maxWidth:'60%','& .MuiSelect-select':{fontSize:14,pl:1.25}}}>{emailDomains.map(domain=><MenuItem key={domain} value={domain}>@{domain}</MenuItem>)}</TextField>
      </Stack>}
      {passwordForm&&<TextField label="密码" required type={showPassword?'text':'password'} value={password} disabled={busy} onChange={event=>setPassword(event.target.value)} slotProps={{htmlInput:{maxLength:128,autoComplete:registering||settingPassword?'new-password':'current-password'},input:{endAdornment:<InputAdornment position="end"><IconButton disabled={busy} aria-label={showPassword?'隐藏密码':'显示密码'} onMouseDown={event=>event.preventDefault()} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<VisibilityOffOutlined/>:<VisibilityOutlined/>}</IconButton></InputAdornment>}}}/>}
      {imageEnabled&&<Stack spacing={1}>{imageError&&<Alert severity="warning">{imageError}</Alert>}<Stack direction="row" spacing={1} sx={{alignItems:'center'}}>{imageChallenge&&<Box component="img" src={imageChallenge.image} alt="四位图形验证码" sx={{width:160,height:56,objectFit:'contain',bgcolor:'#fff',borderRadius:1}}/>}{!imageChallenge&&<Typography variant="body2" color="text.secondary">{imageLoading?'正在获取验证码…':imageWaiting?'倒计时结束后自动获取':'验证码暂未获取'}</Typography>}<Button disabled={busy||imageLoading||!!imageWaiting} onClick={()=>void loadImage()}>{imageLoading?'载入中':imageWaiting?`${imageWaiting}s`:imageChallenge?'换一张':'获取验证码'}</Button></Stack><TextField label="图形验证码" value={imageAnswer} disabled={busy||imageLoading||!imageChallenge} onChange={event=>setImageAnswer(event.target.value.replace(/\D/g,'').slice(0,4))} slotProps={{htmlInput:{maxLength:4,inputMode:'numeric',autoComplete:'off'}}}/></Stack>}
      {emailForm&&<>
       <Stack direction="row" spacing={1} sx={{alignItems:'flex-start'}}>
        <TextField label="邮箱验证码" required value={code} disabled={busy||!challenge} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,codeLength))} slotProps={{htmlInput:{maxLength:codeLength,inputMode:'numeric',autoComplete:'one-time-code'}}}/>
        <Button variant="outlined" disabled={busy||!!waiting||!emailLocal.trim()||!emailEnabled} onClick={()=>void send()} sx={{height:56,flexShrink:0,whiteSpace:'nowrap',px:1.5}}>{sending?'发送中':waiting?waitLabel:'获取验证码'}</Button>
       </Stack>
       <Typography variant="body2" color="text.secondary">{challenge?'五分钟内有效。没收到？检查垃圾邮件。':settingPassword?'适用于之前未设置密码的邮箱账号。':binding?'绑定后可用邮箱和原密码登录。':'验证邮箱后，使用密码登录。'}</Typography>
      </>}
      {!binding&&<Stack direction="row" useFlexGap spacing={1.5} sx={{flexWrap:'wrap'}}>
       <Button disabled={busy||mode==='login'&&!app.authOptions} onClick={()=>changeMode(registering||settingPassword?'login':'register')} sx={{px:0}}>{registering?'已有账户？直接登录':settingPassword?'返回登录':'没有账户？注册'}</Button>
       {mode==='login'&&emailEnabled&&<Button disabled={busy} onClick={()=>changeMode('password')} sx={{px:0,color:'text.secondary'}}>设置密码</Button>}
       {mode==='login'&&<Button disabled={busy} onClick={()=>{setLegacyLogin(!legacyLogin);setError('');}} sx={{px:0,color:'text.secondary'}}>{legacyLogin?'邮箱登录':'旧账号登录'}</Button>}
      </Stack>}
     </>}
     {needsTransfer&&<FormControlLabel sx={{alignItems:'flex-start',m:0}} control={<Checkbox checked={transferApproved} disabled={busy} onChange={event=>setTransferApproved(event.target.checked)}/>} label="把本机通知同步到这个账号"/>}
    </Stack>
   </Box>
  </DialogContent>
  <DialogActions><Button disabled={busy} onClick={close}>{binding?'稍后':'取消'}</Button><Button type="submit" form="campus-login-form" variant="contained" disabled={busy||!app.auth||needsTransfer&&!transferApproved||emailForm&&!pendingSession&&(!emailEnabled||!challenge||code.length!==codeLength)}>{working?'请稍候':pendingSession?'继续':binding?'绑定':settingPassword?'保存':registering?'注册':'登录'}</Button></DialogActions>
 </Dialog>;
}
export default LoginDialog;
