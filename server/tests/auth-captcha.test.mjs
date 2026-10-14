import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAuthService} from '../auth.mjs';
import {captchaAnswerHash} from '../image-captcha.mjs';

const origin='https://app.example.test',password='test-only-password';
async function fixture(file=':memory:',limits){
  let time=Date.parse('2026-10-14T01:00:59Z'),mailCalls=0;
  const config={stateFile:file,allowedOrigins:[origin,'https://second.example.test'],signingSecret:'test-only-image-auth-signing-secret'};
  const options={now:()=>time,limits,sendCode:async()=>{mailCalls++;},imageCaptcha:id=>({image:'data:image/png;base64,fixture',answerHash:captchaAnswerHash(id,'1234')})};
  let auth=await createAuthService(config,options);
  const request=async(path,body={},ip='same-campus',requestOrigin=origin)=>{
    const response=await auth.handle(new Request('https://api.example.test/auth/'+path,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)}),ip);
    return {status:response.status,body:await response.json()};
  };
  const image=async(purpose='login',ip='same-campus',clientId=randomUUID(),requestOrigin=origin)=>{
    const value=await request('challenge',{purpose,clientId},ip,requestOrigin);assert.equal(value.status,200);return {id:value.body.id,answer:'1234'};
  };
  const register=async(username='kemou')=>{const result=await request('register',{username,password,invite:auth.issueInvites(1)[0],captcha:await image('register')});assert.equal(result.status,200);return result.body;};
  return {request,image,register,advance:ms=>{time+=ms;},get mailCalls(){return mailCalls;},get auth(){return auth;},restart:async()=>{auth.close();auth=await createAuthService(config,options);},close:()=>auth.close()};
}

test('production-default password and invite flows require a single-use image challenge',async t=>{
  const f=await fixture();t.after(f.close);
  const opts=await f.request('options');assert.equal(opts.body.imageCaptchaEnabled,true);
  const invite=f.auth.issueInvites(1)[0];
  const blocked=await f.request('register',{username:'kemou',password,invite});assert.equal(blocked.status,428);assert.equal(blocked.body.code,'AUTH_CAPTCHA_REQUIRED');
  const registered=await f.request('register',{username:'kemou',password,invite,captcha:await f.image('register')});assert.equal(registered.status,200);
  const required=await f.request('login',{username:'kemou',password});assert.equal(required.status,428);
  const captcha=await f.image(),first=await f.request('login',{username:'kemou',password,captcha});assert.equal(first.status,200);
  const replay=await f.request('login',{username:'kemou',password,captcha});assert.equal(replay.status,400);assert.equal(replay.body.code,'AUTH_CAPTCHA_INVALID');
});
test('challenge answers are bound to IP, allowed origin, purpose and expiry',async t=>{
  const f=await fixture();t.after(f.close);await f.register();
  const captcha=await f.image();
  for(const [ip,o] of [['different-network',origin],['same-campus','https://second.example.test']]){
    const result=await f.request('login',{username:'kemou',password,captcha},ip,o);assert.equal(result.status,400);
  }
  const wrongPurpose=await f.request('email/request',{email:'somebody@163.com',purpose:'login',captcha});assert.equal(wrongPurpose.status,400);assert.equal(f.mailCalls,0);
  const invalidOrigin=await f.request('challenge',{purpose:'login',clientId:randomUUID()},'same-campus','https://attacker.test');assert.equal(invalidOrigin.status,403);
  f.advance(5*60000);const expired=await f.request('login',{username:'kemou',password,captcha});assert.equal(expired.status,400);
});
test('concurrent redemption consumes an answer before password work yields',async t=>{
  const f=await fixture();t.after(f.close);await f.register();const captcha=await f.image();
  const results=await Promise.all([f.request('login',{username:'kemou',password,captcha}),f.request('login',{username:'kemou',password,captcha})]);
  assert.deepEqual(results.map(value=>value.status).sort(),[200,400]);
});
test('five wrong image guesses retire the challenge and send no email',async t=>{
  const f=await fixture();t.after(f.close);const captcha=await f.image('email');
  for(let i=0;i<5;i++){const result=await f.request('email/request',{email:'somebody@163.com',purpose:'login',captcha:{...captcha,answer:'0000'}});assert.equal(result.status,400);assert.equal(result.body.code,'AUTH_CAPTCHA_INVALID');}
  assert.equal((await f.request('email/request',{email:'somebody@163.com',purpose:'login',captcha})).status,400);assert.equal(f.mailCalls,0);
});
test('image refresh cooldown, per-client limits and counters survive restart',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-auth-image-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const f=await fixture(join(directory,'auth.sqlite'),{challengeClientMinute:2});t.after(f.close);const clientId=randomUUID();
  await f.image('login','same-campus',clientId);
  const early=await f.request('challenge',{purpose:'login',clientId});assert.equal(early.status,429);assert.equal(early.body.retryAfterSeconds,6);
  f.advance(6000);await f.image('login','same-campus',clientId);await f.restart();f.advance(6000);
  const third=await f.request('challenge',{purpose:'login',clientId});assert.equal(third.status,429);assert.equal(third.body.code,'AUTH_CAPTCHA_RATE_LIMIT');
  f.advance(60000);await f.image('login','same-campus',clientId);
});
test('rolling password guessing caps cannot burst across a clock minute or rotate IPs',async t=>{
  const f=await fixture();t.after(f.close);await f.register();
  for(let i=0;i<5;i++){
    const result=await f.request('login',{username:'kemou',password:'wrong-password',captcha:await f.image('login','network-'+i)},'network-'+i);assert.equal(result.status,401);
  }
  f.advance(2000);const limited=await f.request('login',{username:'kemou',password,captcha:await f.image('login','new-network')},'new-network');assert.equal(limited.status,429);assert(limited.body.retryAfterSeconds>=58);
  f.advance(60000);assert.equal((await f.request('login',{username:'kemou',password,captcha:await f.image('login','new-network')},'new-network')).status,200);
});
test('network image limits also stop rotating arbitrary client IDs',async t=>{
  const f=await fixture(':memory:',{challengeIPMinute:2});t.after(f.close);await f.image();await f.image();
  const limited=await f.request('challenge',{purpose:'login',clientId:randomUUID()});assert.equal(limited.status,429);
  assert.equal((await f.request('challenge',{purpose:'login',clientId:randomUUID()},'other-campus')).status,200);
});
test('unsolved image requests cannot exhaust a named account password budget from arbitrary networks',async t=>{
  const f=await fixture();t.after(f.close);await f.register();
  for(let i=0;i<6;i++)assert.equal((await f.request('login',{username:'kemou',password:'wrong-password'},'unsolved-network-'+i)).status,428);
  const captcha=await f.image('login','real-user-network');assert.equal((await f.request('login',{username:'kemou',password,captcha},'real-user-network')).status,200);
});
