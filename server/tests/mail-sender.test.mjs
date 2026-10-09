import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMailSender} from '../mail-sender.mjs';
import nodemailer from '../vendor/nodemailer-10.0.16.mjs';

const PASSWORD_ENV={MAIL_LOGIN_ENABLED:'true',SMTP_HOST:'smtp.qq.com',SMTP_USER:'123456789@qq.com',SMTP_PASSWORD:'fake-test-authorization-code'};
const OAUTH_ENV={MAIL_LOGIN_ENABLED:'true',SMTP_HOST:'smtp-mail.outlook.com',SMTP_PORT:'587',SMTP_SECURE:'false',SMTP_USER:'sender@outlook.com',SMTP_AUTH_MODE:'oauth2',SMTP_OAUTH_CLIENT_ID:'test-client',SMTP_OAUTH_CLIENT_SECRET:'test-secret',SMTP_OAUTH_REFRESH_TOKEN:'environment-refresh'};
const MESSAGE={email:'123456789@qq.com',code:'012345',expiresMinutes:5};
function mockSMTP(){
  const received=[],configurations=[];let closes=0;
  return {received,configurations,get closes(){return closes;},createTransport(config){configurations.push(config);return {sendMail:async message=>{received.push(message);return {accepted:[message.envelope.to[0]],rejected:[]};},close(){closes++;}};}};
}
function oauthSMTP(){
  const tokens=[],messages=[];
  return {tokens,messages,createTransport(config){return {async sendMail(message){const token=await new Promise((resolve,reject)=>config.auth.provisionCallback(config.auth.user,false,(error,token)=>error?reject(error):resolve(token)));tokens.push(token);messages.push(message);return {accepted:message.envelope.to};},close(){}};}};
}
function tokenReply(access='new-access',refresh='rotated-refresh'){
  return new Response(JSON.stringify({access_token:access,refresh_token:refresh,expires_in:3600}),{status:200});
}

test('mail login requires an explicit enable flag and disabled mode touches no state or transport',()=>{
  let touched=false;const options={createTransport(){touched=true;},oauthTokenStore:{load(){touched=true;},save(){touched=true;}}};
  for(const flag of [undefined,'false','TRUE',true])assert.equal(createMailSender({...OAUTH_ENV,MAIL_LOGIN_ENABLED:flag},options),null);
  assert.equal(touched,false);
});
test('enabled incomplete or unsafe startup configuration fails without exposing supplied values',()=>{
  for(const patch of [{SMTP_PASSWORD:''},{SMTP_HOST:'https://evil.example'},{SMTP_PORT:'25'},{SMTP_PORT:'587'},{SMTP_SECURE:'false'},{SMTP_SECURE:'False'},{SMTP_USER:'sender@qq.com\r\nBcc: other@example.com'},{SMTP_FROM:'other@qq.com'},{SMTP_FROM:'Sender <123456789@qq.com>'},{SMTP_AUTH_MODE:'invalid'}]){
    assert.throws(()=>createMailSender({...PASSWORD_ENV,...patch}),/邮箱登录配置错误/);
  }
  assert.throws(()=>createMailSender({...OAUTH_ENV,SMTP_OAUTH_CLIENT_SECRET:undefined}),/SMTP_OAUTH_CLIENT_SECRET/);
  assert.throws(()=>createMailSender({...PASSWORD_ENV,SMTP_HOST:'smtp-mail.outlook.com',SMTP_PORT:'587',SMTP_SECURE:'false'}),/必须使用 SMTP_AUTH_MODE=oauth2/);
  assert.throws(()=>createMailSender({...OAUTH_ENV,SMTP_OAUTH_STATE_FILE:'https://example.com/token'}),/SMTP_OAUTH_STATE_FILE/);
});
test('only one canonical recipient and a six digit five-minute text code are sent over strict TLS',async()=>{
  const mock=mockSMTP(),sender=createMailSender(PASSWORD_ENV,mock);
  await sender({...MESSAGE,email:'Student.Name+try@gmail.com'});
  const message=mock.received[0],config=mock.configurations[0];
  assert.deepEqual(message.envelope,{from:PASSWORD_ENV.SMTP_USER,to:['studentname@gmail.com']});
  assert.deepEqual(message.to,{address:'studentname@gmail.com'});assert.equal(message.from.address,PASSWORD_ENV.SMTP_USER);
  assert.match(message.text,/012345/);assert.match(message.text,/5 分钟/);assert.match(message.text,/校园 Inbox/);
  assert.equal(message.html,undefined);assert.equal(message.attachments,undefined);assert.equal(message.headers,undefined);assert.doesNotMatch(message.text,/https?:\/\//);
  assert.equal(config.secure,true);assert.equal(config.port,465);assert.equal(config.tls.rejectUnauthorized,true);
  assert.equal(config.debug,false);assert.equal(config.logger,false);assert.equal(config.ignoreTLS,false);assert.equal(config.opportunisticTLS,false);
  for(const key of ['connectionTimeout','greetingTimeout','socketTimeout','dnsTimeout'])assert.ok(config[key]<=10000);
  assert.equal(mock.closes,1);
  for(const patch of [{email:'123456789@qq.com,other@qq.com'},{email:'123456789@qq.com\r\nBcc:other@qq.com'},{code:'12345'},{code:'123456\n'},{code:123456},{expiresMinutes:30}])await assert.rejects(sender({...MESSAGE,...patch}));
  assert.equal(mock.received.length,1);
});
test('STARTTLS is required on port 587 and the sender may use an Outlook address',async()=>{
  const mock=mockSMTP(),sender=createMailSender({...PASSWORD_ENV,SMTP_HOST:'smtp.example.com',SMTP_PORT:'587',SMTP_SECURE:'false',SMTP_USER:'sender@outlook.com'},mock);
  await sender(MESSAGE);assert.equal(mock.configurations[0].requireTLS,true);assert.equal(mock.configurations[0].tls.rejectUnauthorized,true);
});
test('SMTP rejection, exceptions and a stalled send all produce the same safe failure',async()=>{
  for(const sendMail of [async()=>({accepted:[],rejected:[MESSAGE.email]}),async()=>({accepted:[MESSAGE.email],rejected:[MESSAGE.email]}),async()=>{throw new Error('SMTP password=fake-secret server error');},async()=>new Promise(()=>{})]){
    let closed=0;const sender=createMailSender(PASSWORD_ENV,{sendTimeoutMs:20,createTransport:()=>({sendMail,close(){closed++;}})});
    await assert.rejects(sender(MESSAGE),error=>error.message==='验证码发送失败，请稍后再试。'&&error.code==='MAIL_SEND_FAILED'&&error.status===503);
    assert.equal(closed,1);
  }
});
test('Outlook refresh uses the fixed Microsoft endpoint, saved token precedence and persistence before delivery',async()=>{
  const smtp=oauthSMTP(),requests=[],saved=[];let persisted=false;
  const sender=createMailSender(OAUTH_ENV,{...smtp,
    oauthTokenStore:{async load(){return {user:OAUTH_ENV.SMTP_USER,clientId:OAUTH_ENV.SMTP_OAUTH_CLIENT_ID,refreshToken:'stored-refresh'};},async save(state){saved.push(state);persisted=true;}},
    async fetch(url,request){requests.push({url,request});return tokenReply();},
  });
  await sender(MESSAGE);await sender(MESSAGE);
  assert.equal(requests.length,1);assert.equal(requests[0].url,'https://login.microsoftonline.com/consumers/oauth2/v2.0/token');
  assert.equal(requests[0].request.redirect,'error');assert.equal(requests[0].request.body.get('refresh_token'),'stored-refresh');
  assert.equal(requests[0].request.body.get('scope'),'https://outlook.office.com/SMTP.Send offline_access');
  assert.equal(saved[0].refreshToken,'rotated-refresh');assert.equal(persisted,true);assert.deepEqual(smtp.tokens,['new-access','new-access']);
});
test('Outlook never authenticates with a new access token when rotating-token persistence fails',async()=>{
  const smtp=oauthSMTP();const sender=createMailSender(OAUTH_ENV,{...smtp,oauthTokenStore:{async load(){return null;},async save(){throw new Error('write failed secret');}},fetch:async()=>tokenReply()});
  await assert.rejects(sender(MESSAGE),{message:'验证码发送失败，请稍后再试。'});assert.equal(smtp.tokens.length,0);
});
test('Outlook persisted refresh tokens survive sender restarts in a private local file',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-mail-token-')),file=join(directory,'smtp-oauth.json'),env={...OAUTH_ENV,SMTP_OAUTH_STATE_FILE:file};
  try{
    let requestToken;const smtp=oauthSMTP();await createMailSender(env,{...smtp,fetch:async()=>tokenReply()})(MESSAGE);
    assert.equal((await stat(file)).mode&0o077,0);assert.equal(JSON.parse(await readFile(file,'utf8')).refreshToken,'rotated-refresh');
    await createMailSender(env,{...oauthSMTP(),fetch:async(_url,request)=>{requestToken=request.body.get('refresh_token');return tokenReply('second-access','second-refresh');}})(MESSAGE);
    assert.equal(requestToken,'rotated-refresh');assert.equal(JSON.parse(await readFile(file,'utf8')).refreshToken,'second-refresh');
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('the vendored full Nodemailer bundle composes mail offline without node_modules',async()=>{
  const transport=nodemailer.createTransport({streamTransport:true,buffer:true});
  try{
    const message=await transport.sendMail({from:'sender@outlook.com',to:MESSAGE.email,subject:'bundle smoke',text:'offline MIME check'});
    assert.ok(Buffer.isBuffer(message.message));assert.match(message.message.toString(),/offline MIME check/);
  }finally{transport.close();}
});

test('registration, binding and password setup mails accurately name their operation',async()=>{
 const mock=mockSMTP(),sender=createMailSender(PASSWORD_ENV,mock);
 for(const [purpose,label] of [['register','注册'],['bind','绑定邮箱'],['password','设置密码']]){
  await sender({...MESSAGE,purpose});assert.equal(mock.received.at(-1).subject,`校园 Inbox ${label}验证码`);assert.ok(mock.received.at(-1).text.includes(`${label}验证码`));
 }
 await assert.rejects(sender({...MESSAGE,purpose:'unsafe purpose'}));assert.equal(mock.received.length,3);
});
