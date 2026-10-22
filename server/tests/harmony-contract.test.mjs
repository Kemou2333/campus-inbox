import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createAuthService} from '../auth.mjs';
import {captchaAnswerHash} from '../image-captcha.mjs';

test('actual Harmony request adapter declares the allowed native origin for auth and every job operation',async t=>{
 const source=await readFile(new URL('../../mobile/harmony/entry/src/main/ets/services/InboxApi.ets',import.meta.url),'utf8');
 const js=stripTypeScriptTypes(source.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,''));
 const origin='https://appassets.androidplatform.net',requests=[];
 const auth=await createAuthService({stateFile:':memory:',allowedOrigins:[origin],signingSecret:'synthetic-native-origin-contract-secret'},
  {imageCaptcha:id=>({image:'data:image/png;base64,iVBORw0KGgo=',answerHash:captchaAnswerHash(id,'1234')})});
 t.after(()=>auth.close());
 const jobID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',key='A'.repeat(43);
 const job={id:jobID,requestId:jobID,status:'accepted',noticeIds:[]};
 const http={RequestMethod:{POST:'POST',GET:'GET'},HttpDataType:{STRING:0},createHttp:()=>({destroy(){},async request(url,options){
  requests.push({url,options});
  if(new URL(url).pathname.startsWith('/auth/')){
   const response=await auth.handle(new Request(url,{method:options.method,headers:options.header,...(options.method==='GET'?{}:{body:options.extraData})}),'synthetic-native-ip');
   return {responseCode:response.status,result:await response.text()};
  }
  return {responseCode:200,result:JSON.stringify(new URL(url).pathname==='/analysis-jobs'&&options.method==='GET'?{jobs:[job],hasMore:false}:{job})};
 }})};
 const {InboxApi,CLIENT_ORIGIN}=new Function('http','validID','validateRecord',js+'; return {InboxApi,CLIENT_ORIGIN};')(http,()=>true,()=>{});
 assert.equal(CLIENT_ORIGIN,origin);const api=new InboxApi('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 const challenge=await api.challenge();assert.match(challenge.id,/^[\w-]+$/);
 await assert.rejects(api.login('synthetic@qq.com','synthetic-password',challenge,'1234')); // Unknown account, not a missing-Origin rejection.
 await api.submit('合成通知',jobID,key);await api.readJob(jobID,key);await api.listJobs(key);
 await api.logout(key);
 for(const request of requests)assert.equal(request.options.header.Origin,origin);
 assert.equal(requests.length,6);
 for(const denied of [null,'https://untrusted.example']){
  const response=await auth.handle(new Request('https://api.example/auth/challenge',{method:'POST',headers:{'Content-Type':'application/json',...(denied?{Origin:denied}:{})},body:JSON.stringify({purpose:'login',clientId:'untrusted'})}));
  assert.equal(response.status,403);
 }
});
