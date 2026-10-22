import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../service.mjs';
import {createRollingQuota,pruneRollingQuota,checkRollingQuota,reserveRollingQuota,FIVE_HOURS_MS,THREE_DAYS_MS} from '../ai-quota.mjs';

// Fake provider only. There are no network, email or paid-model requests.
const origin='https://campus.example.test',secret='quota-test-signing-secret-at-least-twenty-characters';
const key='a'.repeat(43),rotated='b'.repeat(43),other='c'.repeat(43);
const hash=value=>createHmac('sha256',secret).update(value).digest('base64url');
const initial=Date.parse('2026-10-23T04:00:00Z');
const baseKeys={accountKey:hash('owner'),ipKey:hash('ip'),accountFiveHourLimit:5,accountThreeDayLimit:20,ipFiveHourLimit:5};
const output={schemaVersion:4,notices:[{schemaVersion:4,kind:'information',title:'通知',summary:'测试通知信息。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:['测试通知信息。']}]};
const envelope=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:2,completion_tokens:3}});
async function fixture(run,extra={}){
  const directory=await mkdtemp(join(tmpdir(),'campus-rolling-quota-')),stateFile=join(directory,'usage.json');let time=initial,calls=0;
  const config={apiKey:'fake-model-key',accessToken:secret,requireAccess:false,requireIdentity:true,allowedOrigins:[origin],stateFile,...extra};
  const options={now:()=>time,accountForToken:token=>[key,rotated].includes(token)?{id:1}:token===other?{id:2}:null,modelFetch:async()=>{calls++;return envelope();}};
  const request=(text,token=key)=>new Request('https://local/analyze',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({notice:text})});
  try{await run({config,options,request,setTime:value=>{time=value;},advance:value=>{time+=value;},time:()=>time,calls:()=>calls,state:async()=>JSON.parse(await readFile(stateFile,'utf8')),service:await createService(config,options)});}finally{await rm(directory,{recursive:true,force:true});}
}

test('rolling windows expire individual paid events exactly at five hours and 72 hours',()=>{
  const state=createRollingQuota(null,initial);
  for(let i=0;i<5;i++)reserveRollingQuota(state,{...baseKeys,time:initial+i*1000});
  const check=time=>checkRollingQuota(state,{...baseKeys,time});
  assert.equal(check(initial+FIVE_HOURS_MS-1).code,'ACCOUNT_FIVE_HOUR_LIMIT');
  assert.equal(check(initial+FIVE_HOURS_MS-1).retryAfterSeconds,1);
  assert.equal(check(initial+FIVE_HOURS_MS),null);
  reserveRollingQuota(state,{...baseKeys,time:initial+FIVE_HOURS_MS});
  assert.equal(check(initial+FIVE_HOURS_MS).retryAfterSeconds,1);
  // A long account window cannot be reset at midnight or by rotating networks.
  state.accounts[baseKeys.accountKey]=Array.from({length:20},(_,i)=>initial+i*1000);
  state.ips={};
  assert.equal(check(initial+FIVE_HOURS_MS+20000).code,'ACCOUNT_THREE_DAY_LIMIT');
  assert.equal(check(initial+THREE_DAYS_MS-1).retryAfterSeconds,1);
  assert.equal(check(initial+THREE_DAYS_MS),null);
  pruneRollingQuota(state,initial+THREE_DAYS_MS+20000);assert.deepEqual(state.accounts,{});
});

test('five paid account calls persist across restart, token and IP changes; cached reuse is free',async()=>fixture(async s=>{
  for(let i=0;i<5;i++){if(i)s.advance(180001);assert.equal((await s.service(s.request('消息'+i),'network-'+i)).status,200);}
  assert.equal((await s.service(s.request('消息4',rotated),'cached-network')).status,200);assert.equal(s.calls(),5);
  const capped=await s.service(s.request('新消息',rotated),'fresh-network');assert.equal((await capped.json()).code,'ACCOUNT_FIVE_HOUR_LIMIT');
  const persisted=await s.state();assert.equal(persisted.requests,5);assert.equal(Object.values(persisted.rolling.accounts)[0].length,5);
  const raw=JSON.stringify(persisted);assert(!raw.includes(key));assert(!raw.includes('network-'));assert(!raw.includes('消息'));
  const restarted=await createService(s.config,s.options);assert.equal((await (await restarted(s.request('重启后',rotated),'another-network')).json()).code,'ACCOUNT_FIVE_HOUR_LIMIT');
  s.setTime(initial+FIVE_HOURS_MS);assert.equal((await restarted(s.request('重启后',rotated),'another-network')).status,200);assert.equal(s.calls(),6);
  assert.equal((await (await restarted(s.request('剩余仍受限'),'last-network')).json()).code,'ACCOUNT_FIVE_HOUR_LIMIT');
}));

test('shared IP cap survives midnight independently of account IDs and its five-hour boundary',async()=>fixture(async s=>{
  s.setTime(Date.parse('2026-10-23T15:50:00Z'));const start=s.time();
  for(let i=0;i<5;i++){if(i)s.advance(180001);assert.equal((await s.service(s.request('消息'+i,i%2?other:key),'same-network')).status,200);}
  assert.equal((await s.state()).day,'2026-10-24');
  const capped=await s.service(s.request('下一条',other),'same-network');assert.equal((await capped.json()).code,'IP_FIVE_HOUR_LIMIT');
  const restarted=await createService(s.config,s.options);assert.equal((await (await restarted(s.request('重启',other),'same-network')).json()).code,'IP_FIVE_HOUR_LIMIT');
  s.setTime(start+FIVE_HOURS_MS);assert.equal((await restarted(s.request('重启',other),'same-network')).status,200);
}));

test('twenty paid account calls span days, survive restart, and release at the 72-hour boundary',async()=>fixture(async s=>{
  for(let i=0;i<20;i++){
    s.setTime(initial+Math.floor(i/5)*(FIVE_HOURS_MS+1)+(i%5)*180001);
    assert.equal((await s.service(s.request('消息'+i),'network-'+i)).status,200);
  }
  s.setTime(initial+24*60*60*1000);
  const restarted=await createService(s.config,s.options),capped=await restarted(s.request('第二天的新消息',rotated),'new-network');
  assert.equal((await capped.json()).code,'ACCOUNT_THREE_DAY_LIMIT');assert.equal(s.calls(),20);
  s.setTime(initial+THREE_DAYS_MS-1);assert.equal((await restarted(s.request('第三天边界'),'new-network')).headers.get('Retry-After'),'1');
  s.setTime(initial+THREE_DAYS_MS);assert.equal((await restarted(s.request('第三天边界'),'new-network')).status,200);assert.equal(s.calls(),21);
}));

test('concurrent arrivals cannot overrun the final allowance, and paid failures still count once',async()=>fixture(async s=>{
  let calls=0,started,finish;const ready=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{finish=resolve;});
  const service=await createService({...s.config,accountFiveHourLimit:1},{...s.options,modelFetch:async()=>{calls++;started();await gate;return new Response('fake provider failure',{status:503});}});
  const first=service(s.request('第一条'),'network-a');await ready;
  const blocked=await service(s.request('并发第二条'),'network-b');assert.equal((await blocked.json()).code,'SERVICE_BUSY');assert.equal(calls,1);
  finish();assert.equal((await first).status,502);
  const restarted=await createService({...s.config,accountFiveHourLimit:1},s.options);
  assert.equal((await (await restarted(s.request('失败后新请求'),'network-c')).json()).code,'ACCOUNT_FIVE_HOUR_LIMIT');assert.equal(s.calls(),0);
  assert.equal((await s.state()).requests,1);
}));

test('default global cap is 50 per Shanghai natural day; rolling account records survive its reset',async()=>fixture(async s=>{
  const time=Date.parse('2026-10-23T15:59:59Z');s.setTime(time);
  await writeFile(s.config.stateFile,JSON.stringify({day:'2026-10-23',requests:49,input:0,output:0,reasoning:0,costMicro:0,rolling:createRollingQuota(null,time)}));
  const service=await createService(s.config,s.options);assert.equal(service.adminSummary().dailyRequestLimit,50);
  assert.equal((await service(s.request('第50条'),'first')).status,200);
  const capped=await service(s.request('第51条',other),'second');assert.equal((await capped.json()).code,'DAILY_LIMIT');assert.equal(capped.headers.get('Retry-After'),'1');
  s.advance(1000);assert.equal((await service(s.request('新一天',other),'second')).status,200);
  const state=await s.state();assert.equal(state.requests,1);assert.equal(Object.keys(state.rolling.accounts).length,2);
}));

test('legacy daily counts migrate once without resetting known paid usage or leaking identifiers',async()=>fixture(async s=>{
  const day='2026-10-23',oldAccount=hash(day+':account:1'),oldIP=hash(day+':old-network');
  await writeFile(s.config.stateFile,JSON.stringify({day,requests:5,input:0,output:0,reasoning:0,costMicro:0,accounts:{[oldAccount]:5},clients:{[oldIP]:{requests:5,times:[]}}}));
  const service=await createService(s.config,s.options);
  assert.equal((await (await service(s.request('升级后',rotated),'new-network')).json()).code,'ACCOUNT_FIVE_HOUR_LIMIT');
  const migrated=await s.state();assert.equal(migrated.rolling.legacy.at,initial);
  s.advance(FIVE_HOURS_MS);const restarted=await createService(s.config,s.options);
  assert.equal((await restarted(s.request('升级后',rotated),'new-network')).status,200);
  assert.equal((await s.state()).rolling.legacy.at,initial);assert.equal(s.calls(),1);
}));

test('corrupt rolling counters fail closed and invalid configured limits are rejected',async()=>fixture(async s=>{
  for(const rolling of [{version:2,accounts:{},ips:{}},{version:1,accounts:{[hash('owner')]:[-1]},ips:{}},{version:1,accounts:{rawAccount:[initial]},ips:{}}]){
    await writeFile(s.config.stateFile,JSON.stringify({day:'2026-10-23',requests:0,costMicro:0,rolling}));
    await assert.rejects(createService(s.config,s.options),/Invalid rolling AI quota state/);
  }
  for(const value of [0,-1,NaN,'5'])await assert.rejects(createService({...s.config,accountFiveHourLimit:value},s.options),/positive integers/);
}));
