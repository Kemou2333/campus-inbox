import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../service.mjs';
import {modelPayload} from '../analyze.mjs';

// Fake provider responses only: no paid model, SMTP or live credentials.
const origin='https://campus.example.test',accessToken='test-currency-access-token-at-least-20-characters';
const config={apiKey:'fake-key',accessToken,allowedOrigins:[origin],dailyLimit:100};
const original='第一条校园通知';
const output={schemaVersion:4,notices:[{schemaVersion:4,kind:'information',title:'通知信息',summary:'请留意通知信息。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:['请留意通知信息。']}]};
const request=(notice=original,signal)=>new Request('http://local/analyze',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({notice}),...(signal?{signal}:{})});
const envelope=(usage={prompt_tokens:2,completion_tokens:3},reason='stop')=>Response.json({choices:[{finish_reason:reason,message:{content:JSON.stringify(output)}}],...(usage===null?{}:{usage})});
const cost=(input,output)=>Math.ceil(input*2.4+output*9.6);
const reserve=(text=original)=>{const payload=modelPayload(text,config);return cost(Buffer.byteLength(JSON.stringify(payload),'utf8')+1024,payload.max_tokens);};
async function fixture(run){const directory=await mkdtemp(join(tmpdir(),'campus-currency-'));try{return await run(join(directory,'usage.json'));}finally{await rm(directory,{recursive:true,force:true});}}
const state=async file=>JSON.parse(await readFile(file,'utf8'));

test('daily RMB budget defaults to three and rejects invalid configured amounts',async()=>{
  for(const dailyBudgetRmb of [0,-1,NaN,Infinity,'3',0.0000001])await assert.rejects(createService({...config,dailyBudgetRmb}),/currency budget/);
  // The configured budget must cover the entire possible call before dispatch.
  let calls=0;
  const handler=await createService({...config,dailyBudgetRmb:0.01},{modelFetch:async()=>{calls++;return envelope();}});
  const reply=await handler(request(),'one');
  assert.equal(reply.status,429);assert.equal((await reply.json()).code,'DAILY_COST_LIMIT');assert.equal(calls,0);
});

test('default three-RMB allowance never dispatches an unknown-cost call beyond its reserved ceiling',async()=>{
  let calls=0;
  const handler=await createService(config,{modelFetch:async()=>{calls++;return new Response('unknown cost',{status:503});}});
  const allowance=Math.floor(3_000_000/reserve());
  for(let i=0;i<allowance;i++)assert.equal((await handler(request(),'address-'+i)).status,502);
  const blocked=await handler(request(),'last-address');
  assert.equal(blocked.status,429);assert.equal((await blocked.json()).code,'DAILY_COST_LIMIT');assert.equal(calls,allowance);
});

test('full UTF-8 provider payload is reserved on disk before dispatch, then actual usage settles it',async()=>fixture(async file=>{
  const raw='校园通知：请查收一份较长的说明，勿替换中文为字符计数。';
  let calls=0;
  const handler=await createService({...config,stateFile:file},{modelFetch:async(_url,options)=>{
    calls++;const payload=JSON.parse(options.body);
    assert.equal(payload.max_tokens,12288);
    assert.ok(Buffer.byteLength(options.body,'utf8')>options.body.length);
    const before=await state(file);
    assert.equal(before.costMicro,cost(Buffer.byteLength(options.body,'utf8')+1024,payload.max_tokens));
    assert.equal(before.requests,1);
    return envelope({prompt_tokens:2,completion_tokens:3,completion_tokens_details:{reasoning_tokens:3}});
  }});
  assert.equal((await handler(request(raw),'one')).status,200);
  const saved=await state(file);
  assert.equal(saved.costMicro,cost(2,3));assert.equal(saved.input,2);assert.equal(saved.output,3);assert.equal(saved.reasoning,3);assert.equal(calls,1);
  assert.ok(!JSON.stringify(saved).includes('校园通知'));
}));

test('unknown-cost provider failure keeps the full reservation and blocks again after restart',async()=>fixture(async file=>{
  let calls=0;
  const savedConfig={...config,stateFile:file,dailyBudgetRmb:(2*reserve()-1)/1_000_000};
  const fake=async()=>{calls++;return new Response('provider unavailable',{status:503});};
  const handler=await createService(savedConfig,{modelFetch:fake});
  assert.equal((await handler(request(),'one')).status,502);
  assert.equal((await state(file)).costMicro,reserve());
  const restarted=await createService(savedConfig,{modelFetch:fake});
  const blocked=await restarted(request(),'two');
  assert.equal(blocked.status,429);assert.equal((await blocked.json()).code,'DAILY_COST_LIMIT');assert.equal(calls,1);
}));

test('successful response with missing usage keeps reservation while cached reuse is free',async()=>fixture(async file=>{
  let calls=0;
  const handler=await createService({...config,stateFile:file,dailyBudgetRmb:(2*reserve()-1)/1_000_000},{modelFetch:async()=>{calls++;return envelope(null);}});
  assert.equal((await handler(request(),'one')).status,200);
  assert.equal((await state(file)).costMicro,reserve());
  assert.equal((await handler(request(),'two')).status,200);
  const afterCache=await state(file);assert.equal(afterCache.requests,1);assert.equal(afterCache.costMicro,reserve());assert.equal(calls,1);
  const blocked=await handler(request('第二条校园通知'),'three');
  assert.equal(blocked.status,429);assert.equal((await blocked.json()).code,'DAILY_COST_LIMIT');assert.equal(calls,1);
}));

test('invalid or partial provider token counts cannot release uncertain cost',async()=>{
  for(const usage of [{prompt_tokens:'2',completion_tokens:3},{prompt_tokens:2},{prompt_tokens:2,completion_tokens:-1}])await fixture(async file=>{
    const handler=await createService({...config,stateFile:file},{modelFetch:async()=>envelope(usage)});
    assert.equal((await handler(request(),'one')).status,200);assert.equal((await state(file)).costMicro,reserve());
  });
});

test('incomplete paid result settles known token cost, with reasoning included only once',async()=>fixture(async file=>{
  const handler=await createService({...config,stateFile:file},{modelFetch:async()=>envelope({prompt_tokens:11,completion_tokens:13,completion_tokens_details:{reasoning_tokens:12}},'length')});
  assert.equal((await handler(request(),'one')).status,502);
  const saved=await state(file);
  assert.equal(saved.costMicro,cost(11,13));assert.notEqual(saved.costMicro,cost(11,25));assert.equal(saved.lastFinishReason,'length');
}));

test('known actual cost releases unused reservation so normal follow-up requests remain available',async()=>fixture(async file=>{
  let calls=0;
  const handler=await createService({...config,stateFile:file,dailyBudgetRmb:(2*reserve()-1)/1_000_000},{modelFetch:async()=>{calls++;return envelope();}});
  assert.equal((await handler(request(),'one')).status,200);
  assert.equal((await handler(request('第二条校园通知'),'two')).status,200);
  assert.equal(calls,2);assert.equal((await state(file)).costMicro,2*cost(2,3));
}));

test('cancellation without usage retains the reserve and does not retry upstream',async()=>fixture(async file=>{
  let announce,calls=0;
  const started=new Promise(resolve=>announce=resolve),controller=new AbortController();
  const handler=await createService({...config,stateFile:file},{modelFetch:async(_url,options)=>{
    calls++;announce();await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}));
    return envelope();
  }});
  const running=handler(request(original,controller.signal),'one');await started;controller.abort();
  assert.equal((await running).status,499);assert.equal(calls,1);assert.equal((await state(file)).costMicro,reserve());
}));

test('old token totals migrate to persistent RMB cost and do not reset the budget',async()=>fixture(async file=>{
  await writeFile(file,JSON.stringify({day:'2026-10-08',requests:1,input:1_000_000,output:100_000,reasoning:90_000}));
  let calls=0;
  const options={now:()=>Date.UTC(2026,9,8,3),modelFetch:async()=>{calls++;return envelope();}};
  const handler=await createService({...config,stateFile:file},options);
  const migrated=await state(file);
  assert.equal(migrated.costMicro,3_360_000);
  assert.equal((await handler(request(),'one')).status,429);assert.equal(calls,0);
  const restarted=await createService({...config,stateFile:file},options);
  assert.equal((await restarted(request(),'two')).status,429);assert.equal((await state(file)).costMicro,migrated.costMicro);
}));

test('Shanghai midnight renews currency allowance and reports a clear next-day wait',async()=>fixture(async file=>{
  let time=Date.UTC(2026,9,8,15,59),calls=0;
  const handler=await createService({...config,stateFile:file,dailyBudgetRmb:(reserve()+1)/1_000_000},{now:()=>time,modelFetch:async()=>{calls++;return new Response('failure',{status:503});}});
  assert.equal((await handler(request(),'one')).status,502);
  const limited=await handler(request(),'two');
  assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');assert.equal((await limited.json()).retryAfterSeconds,60);
  time+=60_000;assert.equal((await handler(request(),'three')).status,502);assert.equal(calls,2);
  const nextDay=await state(file);assert.equal(nextDay.day,'2026-10-09');assert.equal(nextDay.requests,1);assert.equal(nextDay.costMicro,reserve());
}));

test('corrupt currency totals fail closed instead of creating free budget',async()=>fixture(async file=>{
  for(const costMicro of [-1,1.5,'0',Number.MAX_SAFE_INTEGER+1]){
    await writeFile(file,JSON.stringify({day:'2026-10-08',requests:0,input:0,output:0,reasoning:0,costMicro}));
    await assert.rejects(createService({...config,stateFile:file}),/currency budget state/);
  }
}));
