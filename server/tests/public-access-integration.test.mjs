import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAuthService} from '../auth.mjs';
import {createSyncService} from '../sync.mjs';
import {createService} from '../service.mjs';

const origin='https://app.example.test';
const secret='integration-signing-secret-not-a-deployed-key';
const password='integration test password';
const request=(path,body,key)=>new Request('https://api.example.test'+path,{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body)
});
const modelResponse=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:4,notices:[{
  schemaVersion:4,kind:'information',title:'固定测试响应',summary:'不进行任何外部模型调用。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:[]
}]})}}],usage:{prompt_tokens:8,completion_tokens:12}});

test('real invitation sessions share one paid allowance across devices, and logout cannot read cached AI output',async t=>{
  const configuration={signingSecret:secret,allowedOrigins:[origin],stateFile:':memory:'};
  let auth,calls=0;
  const sync=await createSyncService(configuration,{authenticate:key=>auth.getIdentity(key)});
  auth=await createAuthService(configuration,{provision:sync.provision});
  t.after(()=>{auth.close();sync.close();});
  const ai=await createService({apiKey:'mock-model-key',accessToken:secret,requireAccess:false,requireIdentity:true,
    allowedOrigins:[origin],dailyLimit:30,accountDailyLimit:1,ipDailyLimit:10},
    {accountForToken:key=>auth.getIdentity(key)?sync.accountForKey(key):null,modelFetch:async()=>{calls++;return modelResponse();}});

  const invite=auth.issueInvites(1)[0];
  const registered=await auth.handle(request('/auth/register',{invite,username:'test-user',password}),'network-1');
  assert.equal(registered.status,200);const first=await registered.json();
  const login=await auth.handle(request('/auth/login',{username:'test-user',password}),'network-2');
  assert.equal(login.status,200);const second=await login.json();
  assert.notEqual(first.key,second.key);
  assert.equal(sync.accountForKey(first.key).id,sync.accountForKey(second.key).id);

  assert.equal((await ai(request('/analyze',{sources:[{text:'第一条消息'}]},first.key),'network-1')).status,200);
  const exhausted=await ai(request('/analyze',{sources:[{text:'另一条消息'}]},second.key),'network-2');
  assert.equal(exhausted.status,429);assert.equal((await exhausted.json()).code,'ACCOUNT_DAILY_LIMIT');
  assert.equal((await ai(request('/analyze',{sources:[{text:'第一条消息'}]},second.key),'network-2')).status,200);
  assert.equal((await auth.handle(request('/auth/logout',{},first.key),'network-1')).status,200);
  assert.equal((await ai(request('/analyze',{sources:[{text:'第一条消息'}]},first.key),'network-3')).status,401);
  assert.equal((await ai(request('/analyze',{sources:[{text:'未登录消息'}]}),'network-3')).status,401);
  assert.equal(calls,1);
});

test('failed invitation and password attempt limits persist after an auth process restart',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-public-access-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const configuration={signingSecret:secret,allowedOrigins:[origin],stateFile:join(directory,'auth.sqlite')};
  let time=Date.parse('2026-10-07T08:00:00Z');
  let auth=await createAuthService(configuration,{now:()=>time});
  t.after(()=>auth?.close());
  for(let index=0;index<5;index++){
    assert.equal((await auth.handle(request('/auth/register',{invite:'AAAAAAAA',username:'test-user',password}),'invite-network')).status,400);
    assert.equal((await auth.handle(request('/auth/login',{username:'missing-user',password}),'login-network')).status,401);
  }
  auth.close();auth=null;
  auth=await createAuthService(configuration,{now:()=>time});
  assert.equal((await auth.handle(request('/auth/register',{invite:'AAAAAAAA',username:'test-user',password}),'invite-network')).status,429);
  assert.equal((await auth.handle(request('/auth/login',{username:'missing-user',password}),'login-network')).status,429);
  time+=60_000;
  assert.equal((await auth.handle(request('/auth/register',{invite:'AAAAAAAA',username:'test-user',password}),'invite-network')).status,400);
  assert.equal((await auth.handle(request('/auth/login',{username:'missing-user',password}),'login-network')).status,401);
});
