import test from 'node:test';
import assert from 'node:assert/strict';
import {modelPayload} from '../analyze.mjs';
import {SYSTEM_PROMPT,SHORT_NOTICE_PROMPT} from '../../worker/prompt.mjs';

test('short single-source extraction uses the concise contract while retaining low thinking and complete output budget',()=>{
  const input={sources:[{text:'有兴趣的同学请在9月19日前报名数学竞赛。'}]};
  const payload=modelPayload(input,{thinkingMode:'low'});
  assert.equal(payload.messages[0].content,SHORT_NOTICE_PROMPT);
  assert.equal(payload.thinking.type,'enabled');
  assert.equal(payload.reasoning_effort,'low');
  assert.equal(payload.max_tokens,32768);
  assert.deepEqual(JSON.parse(payload.messages[1].content),{sources:[{sourceId:1,text:input.sources[0].text}]});
});

test('long and multi-source notices retain the proven full extraction contract',()=>{
  const long={sources:[{text:'通知正文'.repeat(200)}]};
  const multiple={sources:[{text:'学生提交申请。'},{text:'家长发送短信。'}]};
  for(const input of [long,multiple]){
    const payload=modelPayload(input,{thinkingMode:'low'});
    assert.equal(payload.messages[0].content,SYSTEM_PROMPT);
    assert.equal(payload.thinking.type,'enabled');
    assert.equal(payload.reasoning_effort,'low');
  }
});
