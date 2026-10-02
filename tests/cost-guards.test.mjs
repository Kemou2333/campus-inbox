import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../server/service.mjs';
import {boundedText} from '../server/analyze.mjs';

// Every upstream response is generated here. These tests make no network calls.
const origin='https://campus.example.test', accessToken='fake-test-access-token-at-least-20-characters';
const config={apiKey:'fake-test-api-key',accessToken,allowedOrigins:[origin]};
const result={schemaVersion:4,notices:[{schemaVersion:4,kind:'information',title:'处理进度',summary:'系统正在处理。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:['系统正在处理。']}]};
const response=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:2,completion_tokens:3}});
const request=(notice='通知',extra={})=>new Request('http://localhost/analyze',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({notice,...extra})});

test('malformed, oversized and non-text requests never reach the paid model',async()=>{
  let calls=0;
  const handler=await createService(config,{modelFetch:async()=>{calls++;return response();}});
  const inputs=[request('x'.repeat(12001)),request('通知',{files:['private-photo']}),new Request('http://localhost/analyze',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:'{bad json'}),new Request('http://localhost/analyze',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+accessToken,'Content-Type':'text/plain'},body:'通知'})];
  for(let i=0;i<inputs.length;i++)assert.equal((await handler(inputs[i],'invalid-'+i)).status,i===3?415:400);
  assert.equal(calls,0);
});

test('per-address burst control ends at a minute and includes cache hits',async()=>{
  let time=Date.UTC(2026,9,2,0),calls=0;
  const handler=await createService(config,{now:()=>time,modelFetch:async()=>{calls++;return response();}});
  for(let i=0;i<5;i++)assert.equal((await handler(request(),'same-address')).status,200);
  assert.equal((await handler(request(),'same-address')).status,429);
  assert.equal(calls,1);
  time+=60000;
  assert.equal((await handler(request(),'same-address')).status,200);
  assert.equal(calls,1);
});

test('one in-flight request blocks a second address without calling upstream',async()=>{
  let started,finish,calls=0;
  const announced=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>finish=resolve);
  const handler=await createService(config,{modelFetch:async()=>{calls++;started();await gate;return response();}});
  const first=handler(request('第一条'),'address-a');
  await announced;
  assert.equal((await handler(request('第二条'),'address-b')).status,429);
  assert.equal(calls,1);
  finish();assert.equal((await first).status,200);
});

test('failed upstream is not retried or cached and still consumes the daily cap',async()=>{
  let calls=0;
  const handler=await createService({...config,dailyLimit:2},{modelFetch:async()=>{calls++;return new Response('failure',{status:500});}});
  assert.equal((await handler(request(),'a')).status,502);
  assert.equal((await handler(request(),'b')).status,502);
  assert.equal((await handler(request(),'c')).status,429);
  assert.equal(calls,2);
});

test('cache expires once, while Shanghai midnight resets the daily allowance',async()=>{
  let time=Date.UTC(2026,9,2,15,59),calls=0;
  const handler=await createService({...config,dailyLimit:1},{now:()=>time,modelFetch:async()=>{calls++;return response();}});
  assert.equal((await handler(request('第一条'),'a')).status,200);
  assert.equal((await handler(request('第二条'),'b')).status,429);
  time+=60000;
  assert.equal((await handler(request('第二条'),'b')).status,200);
  assert.equal(calls,2);
  time+=16*60000;
  assert.equal((await handler(request('第二条'),'b')).status,429);
  assert.equal(calls,2);
});

test('unreadable or corrupt saved quota fails closed',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-quota-test-'));
  try{
    const stateFile=join(directory,'usage.json');await writeFile(stateFile,'{"day":"today","requests":-1}');
    await assert.rejects(createService({...config,stateFile},{modelFetch:async()=>{throw new Error('must not call upstream');}}),/Invalid quota state/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('UTF-8 stream limits use bytes and cancel oversized streams',async()=>{
  const encoded=new TextEncoder().encode('通知'),chunks=[encoded.slice(0,2),encoded.slice(2)];
  const stream=new ReadableStream({start(controller){chunks.forEach(chunk=>controller.enqueue(chunk));controller.close();}});
  assert.equal(await boundedText(stream,6),'通知');
  let cancelled=false;
  const excessive=new ReadableStream({start(controller){controller.enqueue(encoded);},cancel(){cancelled=true;}});
  await assert.rejects(boundedText(excessive,5),e=>e.status===413);assert.equal(cancelled,true);
});
