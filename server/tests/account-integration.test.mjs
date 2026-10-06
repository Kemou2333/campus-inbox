import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthService} from '../auth.mjs';
import {createSyncService} from '../sync.mjs';
import {createService} from '../service.mjs';
const origin='https://kemou2333.github.io',secret='test-only-signing-secret-not-a-production-key';
function request(path,body,key){return new Request('https://api.example.test'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body)});}
test('real invitation login, sync and metering share one stable account across devices and logout',async()=>{
  let auth,calls=0;
  const sync=await createSyncService({stateFile:':memory:',signingSecret:secret,allowedOrigins:[origin]},{authenticate:key=>auth.getIdentity(key)});
  auth=await createAuthService({stateFile:':memory:',signingSecret:secret,allowedOrigins:[origin]},{provision:sync.provision});
  const response={schemaVersion:4,notices:[{schemaVersion:4,kind:'information',title:'测试通知',summary:'用于免费集成检查。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:[]}]};
  const ai=await createService({apiKey:'fake-provider-key',accessToken:secret,requireAccess:false,requireIdentity:true,accountDailyLimit:1,allowedOrigins:[origin]},{accountForToken:key=>auth.getIdentity(key)?sync.accountForKey(key):null,modelFetch:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}],usage:{prompt_tokens:1,completion_tokens:2}});}});
  try{
    const invite=auth.issueInvites(1)[0];
    const registered=await auth.handle(request('/auth/register',{username:'tester01',password:'test-only-password',invite}),'network-1');
    assert.equal(registered.status,200);const first=await registered.json();
    const loggedIn=await auth.handle(request('/auth/login',{username:'tester01',password:'test-only-password'}),'network-2');
    assert.equal(loggedIn.status,200);const second=await loggedIn.json();
    assert.notEqual(first.key,second.key);assert.equal(auth.getIdentity(first.key).subject,auth.getIdentity(second.key).subject);
    assert.equal(sync.accountForKey(first.key).id,sync.accountForKey(second.key).id);
    const record={...response.notices[0],schemaVersion:5,id:'notice-1',originalText:'测试原通知。',createdAt:'2026-10-06T09:00:00+08:00',updatedAt:'2026-10-06T09:01:00+08:00',completed:false,dismissed:false,note:'设备一留下的笔记',localDeadline:null,audienceOverride:'',attachments:[]};
    const pushed=await sync.handle(request('/sync',{cursor:0,changes:[{id:record.id,baseVersion:0,record}]},first.key),'network-1');assert.equal(pushed.status,200);
    const pulled=await (await sync.handle(request('/sync',{cursor:0,changes:[]},second.key),'network-2')).json();assert.deepEqual(pulled.updates[0].record,record);
    assert.equal((await ai(request('/analyze',{sources:[{text:'测试A'}]},first.key),'network-1')).status,200);
    const capped=await ai(request('/analyze',{sources:[{text:'测试B'}]},second.key),'network-2');assert.equal((await capped.json()).code,'ACCOUNT_DAILY_LIMIT');assert.equal(calls,1);
    assert.equal((await auth.handle(request('/auth/logout',{},first.key),'network-1')).status,200);
    assert.equal((await sync.handle(request('/sync',{cursor:0,changes:[]},first.key),'network-1')).status,401);
    assert.equal((await ai(request('/analyze',{sources:[{text:'测试A'}]},first.key),'network-1')).status,401);
    assert.equal((await sync.handle(request('/sync',{cursor:0,changes:[]},second.key),'network-2')).status,200);assert.equal(calls,1);
  }finally{auth.close();sync.close();}
});
