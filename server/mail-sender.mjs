import nodemailer from './vendor/nodemailer-10.0.16.mjs';
import {canonicalEmail} from './contracts/email-policy.mjs';
import {constants} from 'node:fs';
import {mkdir,open,rename,unlink} from 'node:fs/promises';
import {dirname,isAbsolute,normalize} from 'node:path';
import {randomBytes} from 'node:crypto';

const APP_NAME='校园 Inbox',SEND_TIMEOUT=10000,TOKEN_TIMEOUT=4000;
const MICROSOFT_TOKEN_URL='https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const MICROSOFT_SCOPE='https://outlook.office.com/SMTP.Send offline_access';
const MAIL_ERROR='验证码发送失败，请稍后再试。';
const configError=field=>new Error(`邮箱登录配置错误：请检查 ${field}。`);
const sendError=()=>Object.assign(new Error(MAIL_ERROR),{code:'MAIL_SEND_FAILED',status:503});

function secret(value,field){
  if(typeof value!=='string'||!value.trim()||value.length>16384||/[\r\n\0]/.test(value))throw configError(field);
  return value;
}
function mailbox(value,field){
  if(typeof value!=='string'||/[\r\n\0]/.test(value))throw configError(field);
  const address=value.trim().toLowerCase();
  if(address.length>254||!/^[a-z0-9][a-z0-9.!#$%&'*+/=?^_`{|}~-]{0,63}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(address)||address.includes('..'))throw configError(field);
  return address;
}
function tokenFile(value){
  const file=value||'/var/lib/campus-inbox/smtp-oauth.json';
  if(typeof file!=='string'||!isAbsolute(file)||normalize(file)!==file||/[\r\n\0]/.test(file)||file.endsWith('/'))throw configError('SMTP_OAUTH_STATE_FILE');
  return file;
}
/** A private, atomically replaced local file stores Microsoft refresh-token rotation. */
function privateTokenStore(file){
  return {
    async load(){
      let handle;
      try{
        handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
        const stat=await handle.stat();
        if(!stat.isFile()||(stat.mode&0o077)!==0||stat.size>20000)throw sendError();
        return JSON.parse(await handle.readFile('utf8'));
      }catch(error){if(error.code==='ENOENT')return null;throw sendError();}
      finally{await handle?.close();}
    },
    async save(state){
      const directory=dirname(file);
      await mkdir(directory,{recursive:true,mode:0o700});
      const directoryHandle=await open(directory,constants.O_RDONLY|constants.O_NOFOLLOW);
      try{const stat=await directoryHandle.stat();if(!stat.isDirectory()||(stat.mode&0o077)!==0)throw sendError();}
      finally{await directoryHandle.close();}
      const temporary=`${file}.tmp-${randomBytes(8).toString('hex')}`;
      let handle;
      try{
        handle=await open(temporary,'wx',0o600);
        await handle.writeFile(JSON.stringify(state)+'\n');await handle.sync();await handle.close();handle=null;
        await rename(temporary,file);
      }finally{await handle?.close();await unlink(temporary).catch(()=>{});}
    },
  };
}
async function tokenResponse(response){
  if(!response?.ok||!response.body)throw sendError();
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
  try{
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw sendError();}text+=decoder.decode(value,{stream:true});}
    return JSON.parse(text+decoder.decode());
  }finally{reader.releaseLock();}
}
function microsoftTokens(config,options){
  const store=options.oauthTokenStore||privateTokenStore(config.stateFile);
  if(typeof store.load!=='function'||typeof store.save!=='function')throw configError('OAuth token store');
  const tokenFetch=options.fetch||globalThis.fetch,now=options.now||Date.now;
  if(typeof tokenFetch!=='function')throw configError('OAuth HTTPS fetch');
  let loaded=false,refreshToken=config.refreshToken,access=null,pending=null;
  return async function getToken(renew=false){
    if(!renew&&access&&access.expires>now()+60000)return access;
    if(pending)return pending;
    pending=(async()=>{
      if(!loaded){
        const state=await store.load();
        if(state?.user===config.user&&state?.clientId===config.clientId)refreshToken=secret(state.refreshToken,'stored refresh token');
        loaded=true;
      }
      const response=await tokenFetch(MICROSOFT_TOKEN_URL,{
        method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:refreshToken,grant_type:'refresh_token',scope:MICROSOFT_SCOPE}),
        signal:AbortSignal.timeout(TOKEN_TIMEOUT),
      });
      const data=await tokenResponse(response),expires=Number(data.expires_in);
      const nextAccess=secret(data.access_token,'OAuth access token');
      if(!Number.isFinite(expires)||expires<=0||expires>86400)throw sendError();
      const nextRefresh=data.refresh_token===undefined?refreshToken:secret(data.refresh_token,'OAuth refresh token');
      // Do not deliver a new access token until the rotated refresh token is durable.
      await store.save({version:1,user:config.user,clientId:config.clientId,refreshToken:nextRefresh});
      refreshToken=nextRefresh;
      return access={accessToken:nextAccess,expires:now()+Math.floor(expires*1000)};
    })();
    try{return await pending;}finally{pending=null;}
  };
}

/**
 * No network or private-state access happens until sendCode is called.
 * Test seams: createTransport, fetch, oauthTokenStore, now, sendTimeoutMs.
 */
export function createMailSender(env={},options={}){
  if(env.MAIL_LOGIN_ENABLED!=='true')return null;
  const host=env.SMTP_HOST;
  if(typeof host!=='string'||host.length>253||!host.includes('.')||!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)||host.includes('..'))throw configError('SMTP_HOST');
  const secureValue=env.SMTP_SECURE??'true';
  if(!['true','false'].includes(secureValue))throw configError('SMTP_SECURE');
  const secure=secureValue==='true',port=Number(env.SMTP_PORT??465);
  if(!Number.isSafeInteger(port)||(secure?port!==465:port!==587))throw configError('SMTP_PORT / SMTP_SECURE（465 TLS 或 587 STARTTLS）');
  const user=mailbox(env.SMTP_USER,'SMTP_USER'),from=mailbox(env.SMTP_FROM||user,'SMTP_FROM');
  if(from!==user)throw configError('SMTP_FROM 必须与 SMTP_USER 相同');
  const mode=env.SMTP_AUTH_MODE||'password';let auth;
  if(mode==='password'){
    if(['smtp-mail.outlook.com','smtp.office365.com'].includes(host.toLowerCase()))throw configError('Microsoft SMTP 必须使用 SMTP_AUTH_MODE=oauth2');
    auth={user,pass:secret(env.SMTP_PASSWORD,'SMTP_PASSWORD')};
  }
  else if(mode==='oauth2'){
    if(host.toLowerCase()!=='smtp-mail.outlook.com'||port!==587||secure)throw configError('Outlook OAuth2：smtp-mail.outlook.com / 587 / SMTP_SECURE=false');
    const oauthConfig={user,clientId:secret(env.SMTP_OAUTH_CLIENT_ID,'SMTP_OAUTH_CLIENT_ID'),clientSecret:secret(env.SMTP_OAUTH_CLIENT_SECRET,'SMTP_OAUTH_CLIENT_SECRET'),refreshToken:secret(env.SMTP_OAUTH_REFRESH_TOKEN,'SMTP_OAUTH_REFRESH_TOKEN'),stateFile:tokenFile(env.SMTP_OAUTH_STATE_FILE)};
    const getToken=microsoftTokens(oauthConfig,options);
    auth={type:'OAuth2',user,provisionCallback:(requestedUser,renew,callback)=>{
      if(requestedUser!==user)return callback(sendError());
      getToken(renew).then(token=>callback(null,token.accessToken,token.expires),()=>callback(sendError()));
    }};
  }else throw configError('SMTP_AUTH_MODE');
  const createTransport=options.createTransport||nodemailer.createTransport;
  if(typeof createTransport!=='function')throw configError('SMTP transport');
  const timeout=options.sendTimeoutMs??SEND_TIMEOUT;
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>SEND_TIMEOUT)throw configError('mail deadline');
  const transportOptions={host,port,secure,auth,requireTLS:!secure,ignoreTLS:false,opportunisticTLS:false,
    tls:{rejectUnauthorized:true,minVersion:'TLSv1.2',servername:host},
    connectionTimeout:5000,greetingTimeout:5000,socketTimeout:5000,dnsTimeout:4000,
    logger:false,debug:false,transactionLog:false,pool:false,disableFileAccess:true,disableUrlAccess:true};
  return async function sendCode({email,code,expiresMinutes=5}={}){
    const recipient=canonicalEmail(email);
    if(typeof code!=='string'||!/^\d{6}$/.test(code)||expiresMinutes!==5)throw new Error('验证码邮件内容不正确。');
    let transport,timer;
    try{
      transport=createTransport(transportOptions);
      const message={from:{name:APP_NAME,address:from},to:{address:recipient},envelope:{from,to:[recipient]},
        subject:`${APP_NAME} 登录验证码`,text:`你的 ${APP_NAME} 登录验证码是：${code}\n\n${expiresMinutes} 分钟内有效，请勿告诉他人。\n如果不是你本人操作，请忽略此邮件。`,
        disableFileAccess:true,disableUrlAccess:true};
      const sent=await Promise.race([
        Promise.resolve().then(()=>transport.sendMail(message)),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(sendError()),timeout);}),
      ]);
      if(!Array.isArray(sent?.accepted)||sent.accepted.length!==1||typeof sent.accepted[0]!=='string'||sent.accepted[0].toLowerCase()!==recipient||(sent.rejected?.length||0)||(sent.pending?.length||0))throw sendError();
    }catch{throw sendError();}
    finally{clearTimeout(timer);try{transport?.close?.();}catch{}}
  };
}
