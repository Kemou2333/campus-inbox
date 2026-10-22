import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,answerNoticeQuestion} from '../analyze.mjs';
import {ownSourceLinks} from '../contracts/markdown-links.mjs';
const envelope=value=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:1,completion_tokens:1}});
const item=reminder=>({schemaVersion:4,kind:'information',title:'校园通知',summary:'报名安排。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:[reminder]});
const config={apiKey:'offline-fake'};
test('analysis rejects both reviewed Markdown destination bypasses, with one local response and no retry',async()=>{
 for(const [source,markdown] of [
  ['校园通知：请在原群内报名。','[校园报名入口](https&#x3A;//phishing.example/form)'],
  ['校园通知：请访问 https://campus.example 查看报名信息。','[校园报名入口](https://campus.example(note)@phishing.example/form)']
 ]){
  let calls=0;await assert.rejects(analyze({sources:[{text:source}]},config,async()=>{calls++;return envelope({schemaVersion:4,notices:[item(markdown)]});}),error=>error.failureCode==='SOURCE_LINK');assert.equal(calls,1);
 }
});
test('notice answers reject both reviewed bypasses, including an empty or legitimate evidence list',async()=>{
 for(const [sourceText,answer,evidence] of [
  ['校园通知：请在原群内报名。','[校园报名入口](https&#x3A;//phishing.example/form)',[]],
  ['校园通知：请访问 https://campus.example 查看报名信息。','[校园报名入口](https://campus.example(note)@phishing.example/form)',['https://campus.example']]
 ]){
  let calls=0;await assert.rejects(answerNoticeQuestion({sourceText,question:'在哪里报名？'},config,async()=>{calls++;return envelope({answer,evidence});}),error=>error.failureCode==='SCHEMA_INVALID');assert.equal(calls,1);
 }
});
test('source checks use complete resolved targets for references, entities, escapes and auto links',()=>{
 const source='校园资料：https://campus.example/form(v2)?x=1&y=2。另一份：https://示例.invalid/课程（第二讲）。';
 for(const markdown of [
  '[报名](https&#x3A;//campus.example/form\\(v2\\)?x=1&amp;y=2)',
  '[报名][ID]\n\n[id]: https://campus.example/form(v2)?x=1&y=2',
  '<https://campus.example/form(v2)?x=1&y=2>'
 ])assert.equal(ownSourceLinks(markdown,source),true,markdown);
 for(const markdown of [
  '[报名][ID]\n\n[id]: https&#58;//phishing.example/form',
  '<https://phishing.example/form>',
  'https://phishing.example/form',
  '[报名](https://campus.example/form(v2)?x=1&y=2@phishing.example)'
 ])assert.equal(ownSourceLinks(markdown,source),false,markdown);
 assert.equal(ownSourceLinks('[完整括号](https://campus.example/form(v2))','校园资料：https://campus.example/form(other)'),false);
 assert.equal(ownSourceLinks('[缩短域名](https://campus.example/)','校园资料：https://campus.example中文.invalid/'),false);
 assert.equal(ownSourceLinks('[缩短路径](https://campus.example/)','校园资料：https://campus.example/课程'),false);
 assert.equal(ownSourceLinks('[缩短显式目标](https://示例.invalid/课程)','[资料](https://示例.invalid/课程（第二讲）)'),false);
 assert.equal(ownSourceLinks('[入口](https://campus.example/)','校园资料：`https://campus.example/`'),true);
});
