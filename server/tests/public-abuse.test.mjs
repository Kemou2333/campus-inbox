import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../service.mjs';

// Isolated, free tests: all AI replies are fabricated here, no real credentials or network.
const origin='https://public.campus.example',otherOrigin='https://other.campus.example';
const accessToken='fake-internal-signing-secret-at-least-twenty-characters';
const config={apiKey:'fake-model-secret',accessToken,requireAccess:false,allowedOrigins:[origin,otherOrigin],dailyLimit:30,ipDailyLimit:10};
const result={schemaVersion:4,notices:[{schemaVersion:4,kind:'information',title:'处理进度',summary:'原文说明处理进度。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:['原文说明处理进度。']}]};
const modelResponse=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:2,completion_tokens:3}});
const request=(notice='原始通知',extra={})=>new Request('http://localhost/analyze',{method:'POST',headers:{Origin:extra.origin||origin,'Content-Type':'application/json',...(extra.proof?{'X-Campus-Proof':typeof extra.proof==='string'?extra.proof:JSON.stringify(extra.proof)}:{})},body:extra.rawBody??JSON.stringify(extra.body??{notice})});
function solve(challenge){
 assert.equal(challenge.bits,16);
 for(let nonce=0;nonce<=10000000;nonce++){
  const digest=createHash('sha256').update(challenge.token+':'+nonce).digest();
  if(digest[0]===0&&digest[1]===0)return {token:challenge.token,nonce};
 }
 throw new Error('Mock proof unexpectedly exceeded the configured solver range');
}
async function thirdChallenge(handler,ip='address-a',prefix='素材'){
 assert.equal((await handler(request(prefix+'一'),ip)).status,200);
 assert.equal((await handler(request(prefix+'二'),ip)).status,200);
 const third=await handler(request(prefix+'三'),ip);assert.equal(third.status,428);
 const body=await third.json();assert.equal(body.code,'VERIFICATION_REQUIRED');
 return {notice:prefix+'三',challenge:body.challenge};
}
async function stateFixture(){const directory=await mkdtemp(join(tmpdir(),'campus-public-'));return {directory,stateFile:join(directory,'usage.json')};}

test('public callers need no access code; the third uncached request asks for proof before any paid call',async()=>{
 let calls=0;const handler=await createService(config,{modelFetch:async()=>{calls++;return modelResponse();}});
 const {challenge}=await thirdChallenge(handler);assert.equal(calls,2);
 assert.ok(challenge.token);assert.ok(Number.isSafeInteger(challenge.expires));
 const preflight=await handler(new Request('http://localhost/analyze',{method:'OPTIONS',headers:{Origin:origin}}));
 assert.equal(preflight.status,204);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/X-Campus-Proof/);
 assert.equal((await handler(request('未授权域名',{origin:'https://evil.example'}),'foreign')).status,403);assert.equal(calls,2);
});

test('valid proof spends one model call, does not double-count the rolling limit, and cannot be replayed',async()=>{
 const fixture=await stateFixture();let calls=0,time=Date.UTC(2026,9,4,0);
 try{
  const handler=await createService({...config,stateFile:fixture.stateFile},{now:()=>time,modelFetch:async()=>{calls++;return modelResponse();}});
  const {notice,challenge}=await thirdChallenge(handler),proof=solve(challenge);
  assert.equal((await handler(request(notice,{proof}),'address-a')).status,200);assert.equal(calls,3);
  const repeated=await handler(request(notice,{proof}),'address-a');assert.equal(repeated.status,400);assert.equal((await repeated.json()).code,'INVALID_PROOF');assert.equal(calls,3);
  const state=JSON.parse(await readFile(fixture.stateFile,'utf8')),client=Object.values(state.clients)[0];
  assert.equal(state.requests,3);assert.equal(client.requests,3);assert.equal(client.times.length,3);
  assert.equal((await handler(request(notice),'address-a')).status,200);assert.equal(calls,3);
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});

test('proof is bound to original body, network, origin, and signature; invalid submissions do not consume it',async()=>{
 let calls=0;const handler=await createService(config,{modelFetch:async()=>{calls++;return modelResponse();}});
 const {notice,challenge}=await thirdChallenge(handler),proof=solve(challenge);
 const cases=[
  [request('被替换的通知',{proof}),'address-a'],
  [request(notice,{proof}),'address-b'],
  [request(notice,{proof,origin:otherOrigin}),'address-a'],
  [request(notice,{proof:{...proof,token:proof.token.slice(0,-1)+(proof.token.endsWith('A')?'B':'A')}}),'address-a'],
  [request(notice,{proof:{...proof,nonce:-1}}),'address-a'],
  [request(notice,{proof:'{bad-json'}),'address-a'],
  [request(notice,{proof:{...proof,nonce:10000001}}),'address-a']
 ];
 for(const [req,ip]of cases){const response=await handler(req,ip);assert.equal(response.status,400);assert.equal((await response.json()).code,'INVALID_PROOF');}
 assert.equal(calls,2);assert.equal((await handler(request(notice,{proof}),'address-a')).status,200);assert.equal(calls,3);
});

test('proof expires exactly at two minutes and a process restart invalidates outstanding proof',async()=>{
 const fixture=await stateFixture();let time=Date.UTC(2026,9,4,0),calls=0;
 try{
  const settings={...config,stateFile:fixture.stateFile},options={now:()=>time,modelFetch:async()=>{calls++;return modelResponse();}};
  const handler=await createService(settings,options),first=await thirdChallenge(handler),proof=solve(first.challenge);
  time=first.challenge.expires;
  assert.equal((await handler(request(first.notice,{proof}),'address-a')).status,400);assert.equal(calls,2);
  const challengeResponse=await handler(request('重启前待验证'),'address-a');assert.equal(challengeResponse.status,428);
  const restartProof=solve((await challengeResponse.json()).challenge),restarted=await createService(settings,options);
  assert.equal((await restarted(request('重启前待验证',{proof:restartProof}),'address-a')).status,400);assert.equal(calls,2);
  const fresh=await restarted(request('重启后重新验证'),'address-a');assert.equal(fresh.status,428);assert.equal(calls,2);
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});

test('five requests including cache reuse and a solved challenge exhaust the rolling limit; only expired entries reopen it',async()=>{
 const fixture=await stateFixture();let time=Date.UTC(2026,9,4,0),calls=0;
 try{
  const handler=await createService({...config,stateFile:fixture.stateFile},{now:()=>time,modelFetch:async()=>{calls++;return modelResponse();}});
  const {notice,challenge}=await thirdChallenge(handler);
  assert.equal((await handler(request(notice,{proof:solve(challenge)}),'address-a')).status,200);
  time+=30000;
  assert.equal((await handler(request(notice),'address-a')).status,200);assert.equal((await handler(request(notice),'address-a')).status,200);
  const sixth=await handler(request(notice),'address-a');assert.equal(sixth.status,429);assert.equal((await sixth.json()).code,'IP_RATE_LIMIT');assert.equal(sixth.headers.get('Retry-After'),'150');assert.equal(calls,3);
  time+=149999;assert.equal((await handler(request(notice),'address-a')).headers.get('Retry-After'),'1');
  time++;assert.equal((await handler(request(notice),'address-a')).status,200);assert.equal(calls,3);
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});

test('public rolling limit persists across restart even though process-local result cache is cleared',async()=>{
 const fixture=await stateFixture();let calls=0,time=Date.UTC(2026,9,4,0);
 try{
  const settings={...config,stateFile:fixture.stateFile},options={now:()=>time,modelFetch:async()=>{calls++;return modelResponse();}};
  const handler=await createService(settings,options);
  for(let i=0;i<5;i++)assert.equal((await handler(request('相同内容'),'address-a')).status,200);
  const restarted=await createService(settings,options),blocked=await restarted(request('相同内容'),'address-a');
  assert.equal(blocked.status,429);assert.equal((await blocked.json()).code,'IP_RATE_LIMIT');assert.equal(calls,1);
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});

test('per-network daily cap includes failed paid calls and survives restart; other networks keep their own cap',async()=>{
 const fixture=await stateFixture();let calls=0;
 try{
  const settings={...config,stateFile:fixture.stateFile,ipDailyLimit:2},options={modelFetch:async()=>{calls++;return new Response('provider failure',{status:500});}};
  const handler=await createService(settings,options);
  assert.equal((await handler(request('失败一'),'address-a')).status,502);assert.equal((await handler(request('失败二'),'address-a')).status,502);
  const capped=await handler(request('第三次'),'address-a');assert.equal(capped.status,429);assert.equal((await capped.json()).code,'IP_DAILY_LIMIT');assert.equal(calls,2);
  const restarted=await createService(settings,options),again=await restarted(request('重启后'),'address-a');assert.equal((await again.json()).code,'IP_DAILY_LIMIT');assert.equal(calls,2);
  assert.equal((await restarted(request('不同网络'),'address-b')).status,502);assert.equal(calls,3);
  const state=JSON.parse(await readFile(fixture.stateFile,'utf8'));assert.equal(state.requests,3);assert.deepEqual(Object.values(state.clients).map(x=>x.requests).sort(),[1,2]);
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});

test('global cap includes paid failures; known cached results remain free after the cap',async()=>{
 let calls=0;const handler=await createService({...config,dailyLimit:2},{modelFetch:async()=>{calls++;return calls===1?modelResponse():new Response('provider failure',{status:500});}});
 assert.equal((await handler(request('缓存通知'),'address-a')).status,200);
 assert.equal((await handler(request('失败通知'),'address-b')).status,502);
 const capped=await handler(request('新通知'),'address-c');assert.equal(capped.status,429);assert.equal((await capped.json()).code,'DAILY_LIMIT');
 assert.equal((await handler(request('缓存通知'),'address-d')).status,200);assert.equal(calls,2);
});

test('new networks rejected by the global cap cannot grow the retained client map',async()=>{
 const fixture=await stateFixture();let calls=0;const time=Date.UTC(2026,9,4,0);
 try{
  const handler=await createService({...config,stateFile:fixture.stateFile,dailyLimit:1},{now:()=>time,modelFetch:async()=>{calls++;return modelResponse();}});
  assert.equal((await handler(request('缓存通知'),'known-network')).status,200);
  const before=JSON.parse(await readFile(fixture.stateFile,'utf8'));
  for(let i=0;i<128;i++){
   const response=await handler(request('已满额后的新通知'),'rejected-network-'+i);
   assert.equal(response.status,429);assert.equal((await response.json()).code,'DAILY_LIMIT');
  }
  // A known cache hit flushes the current in-memory map; checking only the old file
  // before this persistence would miss a leak held in process memory.
  assert.equal((await handler(request('缓存通知'),'known-network')).status,200);
  const after=JSON.parse(await readFile(fixture.stateFile,'utf8'));
  assert.deepEqual(Object.keys(after.clients),Object.keys(before.clients));
  assert.equal(Object.keys(after.clients).length,1);assert.equal(after.requests,1);assert.equal(calls,1);
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});

test('simultaneous public arrivals before quota persistence can dispatch only one paid call',async()=>{
 const fixture=await stateFixture();let calls=0,finish;
 const gate=new Promise(resolve=>finish=resolve);
 try{
  const handler=await createService({...config,stateFile:fixture.stateFile},{modelFetch:async()=>{calls++;await gate;return modelResponse();}});
  const pending=Array.from({length:12},(_,i)=>handler(request('并发通知'+i),'network-'+i));
  // Let asynchronous quota persistence reach the model; the gate is explicitly released below.
  for(let i=0;i<1000&&calls===0;i++)await new Promise(resolve=>setTimeout(resolve,2));
  assert.equal(calls,1);
  finish();const responses=await Promise.all(pending),statuses=responses.map(x=>x.status);
  assert.equal(statuses.filter(x=>x===200).length,1);assert.equal(statuses.filter(x=>x===429).length,11);assert.equal(calls,1);
  const state=JSON.parse(await readFile(fixture.stateFile,'utf8'));assert.equal(state.requests,1);assert.equal(Object.values(state.clients).reduce((sum,x)=>sum+x.requests,0),1);
 }finally{finish?.();await rm(fixture.directory,{recursive:true,force:true});}
});

test('simultaneous replay of one solved proof dispatches exactly one paid request',async()=>{
 let calls=0;const handler=await createService(config,{modelFetch:async()=>{calls++;return modelResponse();}});
 const {notice,challenge}=await thirdChallenge(handler),proof=solve(challenge);
 const responses=await Promise.all([handler(request(notice,{proof}),'address-a'),handler(request(notice,{proof}),'address-a')]);
 assert.deepEqual(responses.map(x=>x.status).sort(),[200,400]);assert.equal(calls,3);
});

test('malformed input, foreign origin, and oversized body do not spend quota or start paid calls',async()=>{
 const fixture=await stateFixture();let calls=0;
 try{
  const handler=await createService({...config,stateFile:fixture.stateFile},{modelFetch:async()=>{calls++;return modelResponse();}});
  const inputs=[request('x'.repeat(4001)),request('',{rawBody:'{bad'}),request('',{body:{notice:'文本',attachments:['图像']}}),request('',{body:{sources:[{text:'文本',id:'personal-id'}]}}),request('',{rawBody:' '.repeat(64001)}),request('通知',{origin:'https://foreign.example'})];
  for(const input of inputs)assert.ok([400,403,413].includes((await handler(input,'address-a')).status));
  assert.equal(calls,0);await assert.rejects(stat(fixture.stateFile),{code:'ENOENT'});
  assert.equal((await handler(request('合法通知'),'address-a')).status,200);assert.equal(calls,1);
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});

test('quota snapshots contain hashed networks and numeric usage only, with restrictive file permission',async()=>{
 const fixture=await stateFixture();
 try{
  const handler=await createService({...config,stateFile:fixture.stateFile},{modelFetch:async()=>modelResponse()});
  assert.equal((await handler(request('sensitive-notice-body'),'203.0.113.17')).status,200);
  const raw=await readFile(fixture.stateFile,'utf8'),state=JSON.parse(raw);
  for(const privateText of ['203.0.113.17','sensitive-notice-body',accessToken,config.apiKey,origin])assert.ok(!raw.includes(privateText));
  assert.equal(Object.keys(state.clients).length,1);assert.match(Object.keys(state.clients)[0],/^[\w-]{43}$/);
  assert.equal((await stat(fixture.stateFile)).mode&0o777,0o600);
  assert.deepEqual(Object.values(state.clients)[0],{requests:1,times:[Object.values(state.clients)[0].times[0]]});
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});

test('corrupt persisted network quotas fail closed rather than resetting the paid allowance',async()=>{
 const fixture=await stateFixture();
 try{
  for(const clients of [[],null,{'plain-ip':{requests:1,times:[]}}, {["a".repeat(43)]:{requests:-1,times:[]}}, {["a".repeat(43)]:{requests:1,times:Array(6).fill(1)}}, {["a".repeat(43)]:{requests:1,times:[NaN]}}]){
   await writeFile(fixture.stateFile,JSON.stringify({day:'2026-10-04',requests:1,input:0,output:0,reasoning:0,clients}));
   await assert.rejects(createService({...config,stateFile:fixture.stateFile},{modelFetch:async()=>{throw new Error('No upstream calls allowed');}}),/Invalid address quota state/);
  }
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});

test('a persistence failure prevents model dispatch and fails closed',async()=>{
 const fixture=await stateFixture();let calls=0;
 try{
  const handler=await createService({...config,stateFile:fixture.stateFile},{modelFetch:async()=>{calls++;return modelResponse();}});
  await rm(fixture.directory,{recursive:true,force:true});
  const response=await handler(request('不应付费'),'address-a');assert.equal(response.status,503);assert.equal(calls,0);
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});

test('Shanghai midnight opens fresh global, per-network, and rolling allowances',async()=>{
 const fixture=await stateFixture();let time=Date.UTC(2026,9,4,15,59,59),calls=0;
 try{
  const handler=await createService({...config,stateFile:fixture.stateFile,dailyLimit:1,ipDailyLimit:1},{now:()=>time,modelFetch:async()=>{calls++;return modelResponse();}});
  assert.equal((await handler(request('旧日通知'),'address-a')).status,200);
  const blocked=await handler(request('旧日新通知'),'address-a');assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'1');
  time+=1000;assert.equal((await handler(request('新日通知'),'address-a')).status,200);assert.equal(calls,2);
  const state=JSON.parse(await readFile(fixture.stateFile,'utf8'));assert.equal(state.day,'2026-10-05');assert.equal(state.requests,1);assert.equal(Object.values(state.clients)[0].requests,1);
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});

test('a late old-day model reply cannot write its tokens into a new day created by a cache hit',async()=>{
 const fixture=await stateFixture();let time=Date.UTC(2026,9,4,15,59,58),calls=0,started,finish;
 const announcement=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>finish=resolve);
 try{
  const handler=await createService({...config,stateFile:fixture.stateFile},{now:()=>time,modelFetch:async()=>{calls++;if(calls===2){started();await gate;}return modelResponse();}});
  assert.equal((await handler(request('已缓存通知'),'address-a')).status,200);
  const pending=handler(request('临近午夜的付费通知'),'address-a');await announcement;
  time+=2000;
  const blocked=await handler(request('已缓存通知'),'address-b');assert.equal(blocked.status,429);assert.equal((await blocked.json()).code,'SERVICE_BUSY');
  finish();assert.equal((await pending).status,200);
  assert.equal((await handler(request('已缓存通知'),'address-b')).status,200);
  const state=JSON.parse(await readFile(fixture.stateFile,'utf8'));assert.equal(state.day,'2026-10-05');assert.equal(state.requests,0);
  assert.equal(state.input,0,'old-day tokens must not become new-day spending');assert.equal(state.output,0);assert.equal(calls,2);
 }finally{finish?.();await rm(fixture.directory,{recursive:true,force:true});}
});

test('a midnight rollover during preflight persistence cannot detach a paid request from its network quota',async()=>{
 const fixture=await stateFixture();let time=Date.UTC(2026,9,4,15,59,58),calls=0,armed=false,cacheRequest,handler;
 const clock=()=>{
  if(armed){armed=false;queueMicrotask(()=>{time+=2000;cacheRequest=handler(request('已缓存通知'),'address-b');});}
  return time;
 };
 try{
  handler=await createService({...config,stateFile:fixture.stateFile},{now:clock,modelFetch:async()=>{calls++;return modelResponse();}});
  assert.equal((await handler(request('已缓存通知'),'address-a')).status,200);
  armed=true;const arrivedBeforeMidnight=await handler(request('持久化时跨日'),'address-a');
  assert.ok([200,429].includes(arrivedBeforeMidnight.status));assert.equal((await cacheRequest).status,200);
  const state=JSON.parse(await readFile(fixture.stateFile,'utf8'));
  assert.equal(state.day,'2026-10-05');
  assert.equal(state.requests,Object.values(state.clients).reduce((sum,client)=>sum+client.requests,0),'every paid dispatch must belong to a retained network quota');
  assert.equal(state.requests,calls-1);
 }finally{await rm(fixture.directory,{recursive:true,force:true});}
});
