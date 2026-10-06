import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../service.mjs';
const origin='https://kemou2333.github.io',signingSecret='test-signing-secret-not-a-user-token';
const keys={a:'a'.repeat(43),b:'b'.repeat(43),c:'c'.repeat(43),d:'d'.repeat(43)};
const accounts=new Map([[keys.a,{id:1}],[keys.b,{id:1}],[keys.c,{id:2}],[keys.d,{id:3}]]);
const config={apiKey:'test-model-key',accessToken:signingSecret,requireAccess:false,requireIdentity:true,accountDailyLimit:1,ipDailyLimit:10,dailyLimit:30,allowedOrigins:[origin]};
function request(text,key=keys.a){return new Request('https://api.example.test/analyze',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify({sources:[{text}]})});}
function result(){return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:4,notices:[{schemaVersion:4,kind:'information',title:'测试消息',summary:'仅供测试的固定响应。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:[]}]})}}],usage:{prompt_tokens:8,completion_tokens:12}});}

test('production AI requires an active account even for a cached result; rotation cannot reset its daily quota',async()=>{
  let calls=0,active=true;
  const handler=await createService(config,{accountForToken:key=>active?accounts.get(key):null,modelFetch:async()=>{calls++;return result();}});
  assert.equal((await handler(request('未登录',null),'ip-1')).status,401);assert.equal(calls,0);
  assert.equal((await handler(request('消息A'),'ip-1')).status,200);assert.equal(calls,1);
  const limited=await handler(request('消息B',keys.b),'ip-2');assert.equal(limited.status,429);assert.equal((await limited.json()).code,'ACCOUNT_DAILY_LIMIT');assert.equal(calls,1);
  assert.equal((await handler(request('消息A',keys.b),'ip-2')).status,200);assert.equal(calls,1);
  active=false;assert.equal((await handler(request('消息A'),'ip-3')).status,401);assert.equal(calls,1);
});
test('different accounts retain their own allowance while the global budget covers paid failures',async()=>{
  let calls=0;
  const handler=await createService({...config,dailyLimit:2},{accountForToken:key=>accounts.get(key),modelFetch:async()=>{calls++;return calls===1?new Response('upstream failure',{status:503}):result();}});
  assert.equal((await handler(request('失败消息'),'network-1')).status,502);
  const again=await handler(request('同账号其他消息',keys.b),'network-2');assert.equal((await again.json()).code,'ACCOUNT_DAILY_LIMIT');
  assert.equal((await handler(request('其他账号消息',keys.c),'network-3')).status,200);
  const global=await handler(request('第三账号消息',keys.d),'network-4');assert.equal((await global.json()).code,'DAILY_LIMIT');assert.equal(calls,2);
});
test('identity quotas survive restart, use hashed IDs, and renew at Shanghai midnight',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-identity-quota-')),file=join(directory,'usage.json');
  let time=Date.parse('2026-10-06T15:59:59Z'),calls=0;
  const options={now:()=>time,accountForToken:key=>accounts.get(key),modelFetch:async()=>{calls++;return result();}};
  try{
    const first=await createService({...config,stateFile:file},options);assert.equal((await first(request('消息A'),'ip-1')).status,200);
    let raw=await readFile(file,'utf8'),state=JSON.parse(raw);assert.equal(Object.values(state.accounts)[0],1);assert.ok(Object.keys(state.accounts).every(key=>/^[-\w]{43}$/.test(key)));assert.equal(raw.includes(keys.a),false);assert.equal(raw.includes('消息A'),false);
    const restarted=await createService({...config,stateFile:file},options);assert.equal((await restarted(request('消息B',keys.b),'ip-2')).status,429);assert.equal(calls,1);
    time+=2000;assert.equal((await restarted(request('消息B',keys.b),'ip-2')).status,200);assert.equal(calls,2);
    state=JSON.parse(await readFile(file,'utf8'));assert.equal(state.day,'2026-10-07');assert.equal(state.requests,1);assert.deepEqual(Object.values(state.accounts),[1]);
    await writeFile(file,JSON.stringify({...state,accounts:{'not-a-hash':-1}}));await assert.rejects(createService({...config,stateFile:file},options),/Invalid identity quota state/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
