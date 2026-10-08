import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../service.mjs';

const origin='https://app.example.test',keys=Array.from({length:12},(_,i)=>String(i+1).padStart(43,'a'));
const accounts=new Map(keys.map((key,i)=>[key,{id:i+1}]));accounts.set('b'.repeat(43),{id:1});
const config={apiKey:'mock-api-key',accessToken:'mock-signing-secret-long-enough',requireAccess:false,requireIdentity:true,allowedOrigins:[origin],dailyLimit:30,accountDailyLimit:10,ipDailyLimit:30};
const result={schemaVersion:4,notices:[{schemaVersion:4,kind:'information',title:'课程安排',summary:'原通知信息。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:[]}]};
const request=(text,key=keys[0])=>new Request('https://api.example.test/analyze',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({sources:[{text}]})});
const response=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:2,completion_tokens:3}});

test('students sharing a campus network have separate captcha frequency and account rolling limits',async()=>{
  let calls=0;const handler=await createService(config,{accountForToken:key=>accounts.get(key),modelFetch:async()=>{calls++;return response();}});
  for(const [text,key] of [['同学甲通知一',keys[0]],['同学甲通知二',keys[0]],['同学乙通知一',keys[1]],['同学乙通知二',keys[1]]])assert.equal((await handler(request(text,key),'campus-nat')).status,200);
  const third=await handler(request('同学甲通知三'),'campus-nat');assert.equal(third.status,428);assert.equal((await third.json()).code,'VERIFICATION_REQUIRED');assert.equal(calls,4);
  for(const [key,ip] of [['b'.repeat(43),'new-device-network'],[keys[0],'another-network']])assert.equal((await handler(request('同学甲通知一',key),ip)).status,200);
  const sixth=await handler(request('同学甲通知一','b'.repeat(43)),'third-network');assert.equal(sixth.status,429);assert.equal((await sixth.json()).code,'ACCOUNT_RATE_LIMIT');assert.equal(calls,4);
});

test('authenticated network traffic is capped at twenty requests even when all results are cached',async()=>{
  let calls=0;const handler=await createService({...config,dailyLimit:1},{accountForToken:key=>accounts.get(key),modelFetch:async()=>{calls++;return response();}});
  for(const key of keys.slice(0,10))for(let i=0;i<2;i++)assert.equal((await handler(request('共同课程通知',key),'campus-nat')).status,200);
  const twentyFirst=await handler(request('共同课程通知',keys[10]),'campus-nat');assert.equal(twentyFirst.status,429);assert.equal((await twentyFirst.json()).code,'IP_RATE_LIMIT');assert.equal(calls,1);
  assert.equal((await handler(request('共同课程通知',keys[10]),'other-network')).status,200);assert.equal(calls,1);
});

test('stable account rolling limits survive restart and changing sessions or networks, then expire after three minutes',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-account-rates-')),stateFile=join(directory,'usage.json');
  let time=Date.parse('2026-10-08T08:00:00Z'),calls=0;
  const options={now:()=>time,accountForToken:key=>accounts.get(key),modelFetch:async()=>{calls++;return response();}};
  try{
    const handler=await createService({...config,stateFile},options);
    for(let i=0;i<5;i++)assert.equal((await handler(request('共同课程通知'),`network-${i}`)).status,200);
    const state=JSON.parse(await readFile(stateFile,'utf8'));assert.equal(Object.values(state.accountRates)[0].length,5);assert.ok(Object.keys(state.accountRates).every(key=>/^[-\w]{43}$/.test(key)));
    const restarted=await createService({...config,stateFile},options),limited=await restarted(request('另一条通知','b'.repeat(43)),'new-network');
    assert.equal(limited.status,429);assert.equal((await limited.json()).code,'ACCOUNT_RATE_LIMIT');assert.equal(calls,1);
    time+=180000;assert.equal((await restarted(request('另一条通知','b'.repeat(43)),'new-network')).status,200);assert.equal(calls,2);
    await writeFile(stateFile,JSON.stringify({...state,accountRates:{[Object.keys(state.accountRates)[0]]:Array(6).fill(time)}}));
    await assert.rejects(createService({...config,stateFile},options),/Invalid account rate state/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
