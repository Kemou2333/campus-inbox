import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../service.mjs';
import {analyze,groundDates,ServiceError} from '../analyze.mjs';
const origin='https://kemou2333.github.io',token='test-access-code-at-least-twenty-characters';
const notice={schemaVersion:4,kind:'task',title:'登记通知',summary:'离校同学填写登记。',deadline:null,deadlineText:'9月30日18:00前',tasks:[{text:'填写离校登记表',assignee:'离校同学',details:['填写姓名与学号'],time:null,timeText:'9月30日18:00前',location:null}],timeline:[],materials:['离校登记表'],warnings:[],reminders:[]};
const result={schemaVersion:4,notices:[notice]};
function request(notice='测试通知',auth=token,from=origin){return new Request('http://localhost/analyze',{method:'POST',headers:{Origin:from,Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({notice})});}
const mock=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:100,completion_tokens:100}}));
test('authorization and origin checks prevent paid upstream requests',async()=>{
  let calls=0;const handler=await createService({apiKey:'test',accessToken:token,allowedOrigins:[origin]},{modelFetch:async()=>{calls++;return mock();}});
  assert.equal((await handler(request('通知','wrong'))).status,401);
  assert.equal((await handler(request('通知',token,'https://other.example'))).status,403);
  assert.equal((await handler(request(''))).status,400);assert.equal(calls,0);
  const attachmentRequest=request();attachmentRequest.headers.set('Content-Type','application/json');
  assert.equal((await handler(new Request(attachmentRequest,{body:JSON.stringify({notice:'通知',attachments:['private-image']})}))).status,400);assert.equal(calls,0);
  const preflight=await handler(new Request('http://localhost/analyze',{method:'OPTIONS',headers:{Origin:origin}}));
  assert.equal(preflight.status,204);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/Authorization/);
});
test('source dates prevent inferred years and normalize midnight boundaries',()=>{
  const hallucinated={...result,notices:[{...notice,deadline:'2026-10-15T00:00:00',deadlineText:'10月15号前'}]};
  assert.equal(groundDates(hallucinated,'2026级新生10月15号前注册').notices[0].deadline,null);
  const midnight={...result,notices:[{...notice,deadline:'2026-10-20T24:00:00',deadlineText:'2026年10月20日24:00'}]};
  const grounded=groundDates(midnight,'截止2026年10月20日24:00');
  assert.equal(globalThis.CampusData.batch(grounded,true).notices[0].deadline,'2026-10-21T00:00:00');
  const wrong={...midnight,notices:[{...midnight.notices[0],deadlineText:'2027年10月20日24:00'}]};
  assert.equal(groundDates(wrong,'截止2026年10月20日24:00').notices[0].deadline,null);
});
test('valid structured result is cached, low thinking is explicit and bounded, quota survives restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-test-')),file=join(directory,'usage.json');
  try{
    let calls=0;const modelFetch=async(_url,options)=>{calls++;const payload=JSON.parse(options.body);assert.equal(payload.model,'deepseek-flash');assert.equal(payload.thinking.type,'enabled');assert.equal(payload.reasoning_effort,'low');assert.deepEqual(Object.keys(payload.thinking),['type']);assert.ok(!Object.hasOwn(payload,'temperature'));assert.deepEqual(payload.response_format,{type:'json_object'});assert.equal(payload.max_tokens,32768);return mock();};
    const config={apiKey:'test',accessToken:token,allowedOrigins:[origin],dailyLimit:1,stateFile:file,thinkingMode:'low'};
    const handler=await createService(config,{modelFetch});
    const response=await handler(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),globalThis.CampusData.batch(groundDates(result,'测试通知'),true));
    assert.equal((await handler(request())).status,200);assert.equal(calls,1);
    assert.equal((await handler(request('另一条通知'))).status,429);
    const state=JSON.parse(await readFile(file,'utf8'));assert.equal(state.requests,1);assert.equal(state.input,100);assert.ok(!JSON.stringify(state).includes('测试通知'));
    const restarted=await createService(config,{modelFetch});assert.equal((await restarted(request('新通知'))).status,429);assert.equal(calls,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('paid incomplete or invalid responses retain metering without exposing model content',async()=>{
  const cases=[
    {reason:'length',status:502,message:/减少本次通知数量/},
    {reason:'insufficient_system_resource',status:503,message:/暂时繁忙/},
    {reason:'aborted',status:503,message:/已中断/},
    {reason:'content_filter',status:502,message:/调整内容/},
    {reason:'private-unexpected-finish-reason',status:502,message:/未返回完整/},
    {reason:'stop',content:'{invalid json',status:502,message:/有效的整理结果/},
    {reason:'stop',content:JSON.stringify({...result,notices:[{...notice,tasks:['invalid']}] }),status:502,message:/有效的整理结果/}
  ];
  const directory=await mkdtemp(join(tmpdir(),'campus-paid-failures-'));
  try{
    for(const [i,item] of cases.entries()){
      const file=join(directory,`usage-${i}.json`);let calls=0;
      const modelFetch=async()=>{calls++;return Response.json({choices:[{finish_reason:item.reason,message:{content:item.content||'private-model-result',reasoning_content:'private-reasoning-text'}}],usage:{prompt_tokens:91,completion_tokens:640,completion_tokens_details:{reasoning_tokens:600},private_source:'private-original-notice'}});};
      const config={apiKey:'test',accessToken:token,allowedOrigins:[origin],dailyLimit:1,stateFile:file};
      const handler=await createService(config,{modelFetch});
      const reply=await handler(request('private-original-notice'));
      assert.equal(reply.status,item.status);const body=await reply.json();assert.deepEqual(Object.keys(body),['error','code']);assert.match(body.error,item.message);
      assert.equal(body.code,item.reason==='stop'?'AI_FORMAT_INVALID':'AI_INCOMPLETE');
      const state=JSON.parse(await readFile(file,'utf8'));
      assert.equal(state.requests,1);assert.equal(state.input,91);assert.equal(state.output,640);assert.equal(state.reasoning,600);
      assert.equal(state.lastFinishReason,item.reason==='private-unexpected-finish-reason'?'unknown':item.reason);
      const expectedKeys=['costMicro','day','input','lastFinishReason','output','reasoning','requests'];if(item.reason==='stop')expectedKeys.push('lastFailureCode');assert.deepEqual(Object.keys(state).sort(),expectedKeys.sort());if(item.reason==='stop')assert.equal(state.lastFailureCode,item.content.startsWith('{invalid')?'INVALID_JSON':'TASK_FIELDS');
      assert.ok(!JSON.stringify({state,body}).includes('private-'));assert.equal(calls,1);
      const restarted=await createService(config,{modelFetch});
      assert.equal((await restarted(request('private-original-notice'))).status,429);assert.equal(calls,1);
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('upstream metering accepts only nonnegative safe integer counts',async()=>{
  const usage={prompt_tokens:-1,completion_tokens:'640',completion_tokens_details:{reasoning_tokens:1.5}};
  await assert.rejects(analyze('测试通知',{apiKey:'test'},async()=>Response.json({choices:[{finish_reason:'length',message:{content:'private-result'}}],usage})),e=>{
    assert.ok(e instanceof ServiceError);assert.deepEqual(e.usage,{input:0,output:0,reasoning:0});assert.equal(e.finishReason,'length');return true;
  });
  const error=new ServiceError('safe',502,{usage:{input:Infinity,output:Number.MAX_SAFE_INTEGER+1,reasoning:NaN},finishReason:'private-arbitrary-metadata'});
  assert.deepEqual(error.usage,{input:0,output:0,reasoning:0});assert.equal(error.finishReason,'unknown');
});
test('malformed AI schema and incomplete output are rejected',async()=>{
  for(const choice of [{finish_reason:'length',message:{content:'{}'}},{finish_reason:'stop',message:{content:JSON.stringify({...result,notices:[{...notice,tasks:['invalid legacy task']}]})}},{finish_reason:'stop',message:{content:JSON.stringify({...result,notices:[{...notice,kind:'reminder'}]})}}]){
    const handler=await createService({apiKey:'test',accessToken:token,allowedOrigins:[origin]},{modelFetch:async()=>new Response(JSON.stringify({choices:[choice]}))});
    assert.equal((await handler(request())).status,502);
  }
});

test('structured substeps pass through one mocked AI call and reject injected local or responsibility fields',async()=>{
 const grouped={...result,notices:[{...notice,tasks:[{...notice.tasks[0],steps:[{text:'提交短信截图',details:['提交给通知发布者']},{text:'填写办事簿',details:[]}]}]}]};
 let calls=0;
 const handler=await createService({apiKey:'test',accessToken:token,allowedOrigins:[origin]},{modelFetch:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(grouped)}}]});}});
 const response=await handler(request());assert.equal(response.status,200);const returned=await response.json();
 assert.deepEqual(returned.notices[0].tasks[0].steps,grouped.notices[0].tasks[0].steps);assert.equal(calls,1);
 for(const field of ['note','completed','assignee','condition']){
  const invalid=structuredClone(grouped);invalid.notices[0].tasks[0].steps[0][field]='模型额外字段';
  const reject=await createService({apiKey:'test',accessToken:token,allowedOrigins:[origin]},{modelFetch:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(invalid)}}]})});
  assert.equal((await reject(request())).status,502);
 }
});

test('undated timeline nodes pass one model call while types, fields and existing backups stay strict',async()=>{
 const D=globalThis.CampusData,node={label:'苏老师审批',time:null,timeText:'',location:null};
 const modelResult={...result,notices:[{...notice,timeline:[node]}]};let calls=0;
 const handler=await createService({apiKey:'test',accessToken:token,allowedOrigins:[origin]},{modelFetch:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(modelResult)}}]});}});
 const response=await handler(request('完善请假流程后，由苏老师同意请假。'));
 assert.equal(response.status,200);assert.equal(calls,1);assert.deepEqual((await response.json()).notices[0].timeline,[node]);
 for(const change of [v=>v.timeText=null,v=>delete v.timeText,v=>v.unexpected='extra',v=>v.timeText='x'.repeat(501)]){
  const invalid=structuredClone(modelResult);change(invalid.notices[0].timeline[0]);
  assert.throws(()=>D.batch(invalid,true),/原文时间|时间节点字段/);
 }
 const existingTimeline=[{label:'班级确认',time:'2026-10-07T17:00:00',timeText:'2026年10月7日17:00',location:'办事簿'}];
 const stored=D.create({...notice,timeline:existingTimeline},'原通知');
 assert.deepEqual(D.backup({app:'campus-inbox',version:3,notices:[stored]})[0].timeline,existingTimeline);
 const schema=JSON.parse(await readFile(new URL('./fixtures/analysis.schema.json',import.meta.url),'utf8'));
 const timeText=schema.properties.notices.items.properties.timeline.items.properties.timeText;
 assert.equal(timeText.type,'string');assert.equal(timeText.maxLength,500);assert.ok(!Object.hasOwn(timeText,'minLength'));
});

test('explicit source boundaries preserve original order, use one call and ground dates per source',async()=>{
 const first='  请假通知\r\n学生在2026年10月7日17:00前上传截图。  ',second='  返校通知\r\n请按申报时间返校。  ';
 const input=first+'\r\n \t--- \t\r\n'+second,date='2026-10-07T17:00:00',timeText='2026年10月7日17:00';
 const dated={...notice,deadline:date,deadlineText:timeText,tasks:[{...notice.tasks[0],time:date,timeText}],timeline:[{label:'审核',time:date,timeText,location:null}]};
 const batchResult={schemaVersion:4,notices:[dated,{...dated,title:'返校'}]};let calls=0;
 const output=await analyze(input,{apiKey:'test'},async(_url,options)=>{
  calls++;const payload=JSON.parse(options.body),user=JSON.parse(payload.messages[1].content);
  assert.deepEqual(user,{sources:[{sourceId:1,text:first.trim()},{sourceId:2,text:second.trim()}]});
  assert.ok(!Object.hasOwn(user,'notice'));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(batchResult)}}],usage:{prompt_tokens:9,completion_tokens:12}});
 });
 assert.equal(calls,1);assert.equal(output.result.notices[0].deadline,date);assert.equal(output.result.notices[0].tasks[0].time,date);assert.equal(output.result.notices[0].timeline[0].time,date);
 assert.equal(output.result.notices[1].deadline,null);assert.equal(output.result.notices[1].tasks[0].time,null);assert.equal(output.result.notices[1].timeline[0].time,null);
 let badCalls=0;
 await assert.rejects(analyze(input,{apiKey:'test'},async()=>{badCalls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:9,completion_tokens:12,completion_tokens_details:{reasoning_tokens:3}}});}),error=>{
  assert.ok(error instanceof ServiceError);assert.equal(error.failureCode,'SOURCE_COUNT');assert.equal(error.finishReason,'stop');assert.deepEqual(error.usage,{input:9,output:12,reasoning:3});return true;
 });
 assert.equal(badCalls,1);
 let oversizedCalls=0;
 await assert.rejects(analyze(Array.from({length:21},(_,i)=>'通知'+i).join('\n---\n'),{apiKey:'test'},async()=>{oversizedCalls++;return mock();}),error=>error instanceof ServiceError&&error.status===400);
 assert.equal(oversizedCalls,0);
 for(const original of ['未分段的一条通知。','说明中 inline --- 不是分隔线。','只有一段\n---\n']){
  let singleCalls=0;
  await analyze(original,{apiKey:'test'},async(_url,options)=>{singleCalls++;assert.deepEqual(JSON.parse(JSON.parse(options.body).messages[1].content),{notice:original});return mock();});
  assert.equal(singleCalls,1);
 }
});
