import test from 'node:test';
import assert from 'node:assert/strict';
import {answerNoticeQuestion,compactModelText,modelInput,modelPayload,questionInput,questionPayload} from '../analyze.mjs';
const envelope=result=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:10,completion_tokens:20}});

test('provider copies collapse only excessive blank lines while preserving paragraphs, indentation and factual text',()=>{
  const concise='通知\r\n  1. 缴费 20.50 元\r\n\r\n\t2. 截止：10月20日 24:00\n链接 https://example.test/a?b=12&c=34\n\n😊全角空格　与隐藏符\u0014保留';
  assert.equal(compactModelText(concise),concise);
  for(const br of ['\n','\r\n','\r']){
    const raw='通知'+br+' \t'+br+br+br+'  1. 缴费20元'+br+br+'\t2. https://example.test/';
    assert.equal(compactModelText(raw),'通知'+br+br+'  1. 缴费20元'+br+br+'\t2. https://example.test/');
    assert.equal(compactModelText(raw).replace(/\s/g,''),raw.replace(/\s/g,''));
    assert.equal(compactModelText(compactModelText(raw)),compactModelText(raw));
  }
});

test('source limits and stored originals remain unchanged while provider text loses redundant blank lines',()=>{
  const sourceText='学校通知：\n\n\n\n  1. 提交20元材料。\n\n\n\t2. 入口：https://example.test/form';
  const original={sources:[{text:sourceText}]},before=JSON.stringify(original);
  const payload=modelPayload(original,{thinkingMode:'low'}),prepared=JSON.parse(payload.messages[1].content);
  assert.equal(JSON.stringify(original),before);assert.equal(modelInput(original).sources[0].text,sourceText);
  assert.equal(prepared.sources[0].text,compactModelText(sourceText));
  const question='何时办理？\n\n\n\n是否必须？',input={sourceText,question};
  assert.deepEqual(questionInput(input),input);
  assert.deepEqual(JSON.parse(questionPayload(input).messages[1].content),{sourceText:compactModelText(sourceText),question:compactModelText(question)});
  const padded='通知'+ '\n'.repeat(4000);
  assert.throws(()=>modelPayload({sources:[{text:padded}]}),/4,000/);
  assert.throws(()=>questionPayload({sourceText:padded,question:'时间？'}),/4,000/);
  assert.throws(()=>questionPayload({sourceText,question:'问题'+ '\n'.repeat(240)}),/240/);
});

test('question quotations crossing shortened blank runs return exact original spans without rewriting source',async()=>{
  for(const br of ['\n','\r\n','\r']){
    const sourceText='通知前言。'+br.repeat(4)+'  提交20元材料。'+br.repeat(3)+'\t请于10月20日前办理。';
    const quotation=compactModelText(sourceText);let calls=0;
    const output=await answerNoticeQuestion({sourceText,question:'请说明要求。'},{apiKey:'fake'},async(_url,options)=>{
      calls++;assert.equal(JSON.parse(JSON.parse(options.body).messages[1].content).sourceText,quotation);
      return envelope({answer:'提交**20元材料**，10月20日前办理。',evidence:[quotation]});
    });
    assert.deepEqual(output.result.evidence,[sourceText]);assert(sourceText.includes(output.result.evidence[0]));assert.equal(calls,1);
  }
});

test('shortened inputs never permit invented quotations or quotes over the existing original-text bounds',async()=>{
  for(const [sourceText,evidence] of [['通知。\n\n\n按要求提交。','通知。\n\n提交20元。'],['通知。'+'\n'.repeat(600)+'按要求提交。','通知。\n\n按要求提交。']]){
    let calls=0;await assert.rejects(answerNoticeQuestion({sourceText,question:'怎么办？'},{apiKey:'fake'},async()=>{calls++;return envelope({answer:'按要求提交。',evidence:[evidence]});}),error=>error.status===502&&error.failureCode==='SCHEMA_INVALID');assert.equal(calls,1);
  }
});

test('question failures give a plain next step without forwarding private provider diagnostics or retrying',async()=>{
  for(const [reply,expected] of [[()=>new Response('private-upstream-diagnostic',{status:429}),/稍后再提问/],[()=>envelope({answer:'不可信答案',evidence:['不是原文']}),/换个问法重试/],[()=>Response.json({choices:[{finish_reason:'length',message:{content:'private-partial-result'}}]}),/重新提问/]]){
    let calls=0;await assert.rejects(answerNoticeQuestion({sourceText:'校内通知：按要求提交。',question:'怎么办？'},{apiKey:'private-test-key'},async()=>{calls++;return reply();}),error=>{assert.match(error.message,expected);assert(!error.message.includes('private-'));return true;});assert.equal(calls,1);
  }
});
