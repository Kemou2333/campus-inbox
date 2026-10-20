import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,ServiceError} from '../analyze.mjs';

// Deliberately fake provider envelopes; all cases run without a paid request.
const config={apiKey:'fake-source-mapping-key'};
const information=(title,sourceId,changes={})=>({schemaVersion:4,kind:'information',title,summary:'请留意原文信息。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:['请留意原文信息。'],...(sourceId===undefined?{}:{sourceId}),...changes});
const response=notices=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:4,notices})}}],usage:{prompt_tokens:20,completion_tokens:30,completion_tokens_details:{reasoning_tokens:10}}});
const failCode=code=>error=>error instanceof ServiceError&&error.failureCode===code&&error.usageAvailable&&error.usage.input===20;

test('two topics pasted in one explicit module become two cards in one call with the same original index',async()=>{
  const original='【评教通知】请课程结束前评教。\n\n【宿舍提醒】离开宿舍时锁门。';
  let calls=0;
  const parsed=await analyze({sources:[{text:original}]},config,async(_url,options)=>{
    calls++;assert.deepEqual(JSON.parse(JSON.parse(options.body).messages[1].content),{sources:[{sourceId:1,text:original}]});
    return response([information('课程评教',1),information('宿舍安全',1)]);
  });
  assert.equal(calls,1);assert.deepEqual(parsed.result.sourceIndexes,[0,0]);assert.equal(parsed.result.notices.length,2);
  assert.ok(parsed.result.notices.every(notice=>!Object.hasOwn(notice,'sourceId')));
});

test('one split module followed by another original keeps source positions for every card',async()=>{
  const sources=[{text:'第一条有两个主题。'},{text:'第二条有一个主题。'}];
  const output=await analyze({sources},config,async()=>response([information('第一来源主题一',1),information('第一来源主题二',1),information('第二来源主题',2)]));
  assert.deepEqual(output.result.sourceIndexes,[0,0,1]);
  assert.deepEqual(output.result.notices.map(n=>n.title),['第一来源主题一','第一来源主题二','第二来源主题']);
});

test('source IDs on ordinary one-original one-card output are removed without changing the legacy wire shape',async()=>{
  const output=await analyze({sources:[{text:'第一条'},{text:'第二条'}]},config,async()=>response([information('一',1),information('二',2)]));
  assert.equal(Object.hasOwn(output.result,'sourceIndexes'),false);
  assert.ok(output.result.notices.every(notice=>!Object.hasOwn(notice,'sourceId')));
});

test('missing originals, descending source order, out-of-range IDs and mixed missing IDs are rejected',async()=>{
  const sources=[{text:'第一条'},{text:'第二条'}];
  const malformed=[
    [information('一',1),information('重复一',1)],
    [information('二',2),information('一',1)],
    [information('一',0),information('二',2)],
    [information('一',1),information('二',3)],
    [information('一','1'),information('二',2)],
    [information('一',1),information('缺ID',undefined)],
  ];
  for(const notices of malformed)await assert.rejects(analyze({sources},config,async()=>response(notices)),failCode('SOURCE_COUNT'));
});

test('new IDs do not relax the strict structured-card boundary',async()=>{
  for(const field of ['originalText','completed','attachments','note','execute']){
    const bad=information('注入本地字段',1,{[field]:'not-from-model'});
    await assert.rejects(analyze({sources:[{text:'正常校园信息。'}]},config,async()=>response([bad])),failCode('ROOT_FIELDS'));
  }
});

test('links are checked against the mapped source instead of the card array position',async()=>{
  const sources=[{text:'第一来源：https://first.example.edu/a'},{text:'第二来源：https://second.example.edu/b'}];
  const valid=[information('第一主题',1,{reminders:['https://first.example.edu/a']}),information('第一另一个主题',1,{reminders:['https://first.example.edu/a']}),information('第二主题',2,{reminders:['https://second.example.edu/b']})];
  const output=await analyze({sources},config,async()=>response(valid));assert.deepEqual(output.result.sourceIndexes,[0,0,1]);
  const borrowed=structuredClone(valid);borrowed[2].reminders=['https://first.example.edu/a'];
  await assert.rejects(analyze({sources},config,async()=>response(borrowed)),failCode('SOURCE_LINK'));
});

test('timestamps remain grounded in the actual mapped original after a source produces multiple cards',async()=>{
  const raw='2026年10月20日12:00',timestamp='2026-10-20T12:00:00';
  const date={deadline:timestamp,deadlineText:raw};
  const output=await analyze({sources:[{text:'第一来源明确截止：'+raw},{text:'第二来源只说10月20日12:00，没写年份。'}]},config,async()=>response([information('第一主题',1,date),information('第一另一个主题',1,date),information('第二主题',2,date)]));
  assert.deepEqual(output.result.sourceIndexes,[0,0,1]);
  assert.deepEqual(output.result.notices.map(n=>n.deadline),[timestamp,timestamp,null]);
});

test('old one-to-one responses without IDs still work, but old ambiguous count mismatch cannot be guessed',async()=>{
  const output=await analyze({sources:[{text:'第一条'},{text:'第二条'}]},config,async()=>response([information('一'),information('二')]));
  assert.equal(output.result.notices.length,2);assert.equal(Object.hasOwn(output.result,'sourceIndexes'),false);
  await assert.rejects(analyze({sources:[{text:'包含两个主题的一框原文'}]},config,async()=>response([information('一'),information('二')])),failCode('SOURCE_COUNT'));
});

test('legacy explicit separator input and single-topic text remain compatible with source mapping',async()=>{
  const separated=await analyze('第一条\n---\n第二条',config,async()=>response([information('一',1),information('二',2)]));
  assert.equal(separated.result.notices.length,2);assert.equal(Object.hasOwn(separated.result,'sourceIndexes'),false);
  const single=await analyze('未分段的一条校园信息',config,async()=>response([information('单条')]));
  assert.equal(single.result.notices.length,1);
});
