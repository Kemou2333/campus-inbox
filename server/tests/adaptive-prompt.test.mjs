import test from 'node:test';
import assert from 'node:assert/strict';
import {modelPayload} from '../analyze.mjs';
import {SYSTEM_PROMPT,SHORT_NOTICE_PROMPT} from '../../worker/prompt.mjs';

test('short single-source extraction uses the concise contract while retaining low thinking and complete output budget',()=>{
  const input={sources:[{text:'有兴趣的同学请在9月19日前报名数学竞赛。'}]};
  const payload=modelPayload(input,{thinkingMode:'low'});
  assert.equal(payload.messages[0].content.startsWith(SHORT_NOTICE_PROMPT+'\n'),true);
  assert.match(payload.messages[0].content,/恰有 1 张卡/);
  assert.equal(payload.thinking.type,'enabled');
  assert.equal(payload.reasoning_effort,'low');
  assert.equal(payload.max_tokens,32768);
  assert.deepEqual(JSON.parse(payload.messages[1].content),{sources:[{sourceId:1,text:input.sources[0].text}]});
});

test('long and multi-source notices retain the full extraction contract',()=>{
  const long={sources:[{text:'通知正文'.repeat(200)}]};
  const multiple={sources:[{text:'学生提交申请。'},{text:'家长发送短信。'}]};
  for(const input of [long,multiple]){
    const payload=modelPayload(input,{thinkingMode:'low'});
    assert.equal(payload.messages[0].content.startsWith(SYSTEM_PROMPT+'\n'),true);
    assert.equal(payload.messages[0].content.includes(`恰有 ${input.sources.length} 张卡`),true);
    assert.equal(payload.thinking.type,'enabled');
    assert.equal(payload.reasoning_effort,'low');
  }
});

test('complex short and long sources both send uncertainty, pending-state and eligibility protections without altering user text',()=>{
  // These are synthetic policy regressions, not model-quality claims. The
  // real six-source evaluations separately review the first provider output.
  const text='助学金申请待学校审批后开放，预计今日内完成。资格成绩须11月10日前取得。平台入口前后不一致，按原文保留。';
  for(const sourceText of [text,text.repeat(14)]){
    const payload=modelPayload({sources:[{text:sourceText}]},{thinkingMode:'low'});
    const policy=payload.messages[0].content;
    assert.match(policy,/互不兼容.*保留两种.*核实/);
    assert.match(policy,/条件差异.*先后阶段不是冲突/);
    assert.match(policy,/不加.*核实说明/);
    assert.match(policy,/尚待审批\/开放.*kind="information"/);
    assert.match(policy,/不造“查看”“等待”待办/);
    assert.match(policy,/资格取得时间用 timeline/);
    assert.match(policy,/最早明确办理截止/);
    assert.match(policy,/材料任选项/);
    assert.match(policy,/共同截止只在 deadlineText 出现一次/);
    assert.equal(payload.reasoning_effort,'low');
    assert.deepEqual(JSON.parse(payload.messages[1].content),{sources:[{sourceId:1,text:sourceText}]});
  }
});
