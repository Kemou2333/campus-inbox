import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,normalizeDescriptionArrays} from '../analyze.mjs';
const card=()=>({sourceId:1,schemaVersion:4,kind:'task',title:'比赛报名',summary:'本次校赛选拔参赛学生。',deadline:null,deadlineText:'',timeline:[],tasks:[{text:'完成比赛报名',assignee:null,scope:'all',condition:'',details:[],steps:[{text:'填写报名表',details:[]}],time:null,timeText:'',location:null}],materials:[],warnings:[],reminders:[],reminderTitles:[]});
const envelope=n=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:4,notices:[n]})}}],usage:{prompt_tokens:10,completion_tokens:30}});
const config={apiKey:'synthetic-unused',oneNoticePerSource:true};
test('string descriptions become one list item without editing or mutating any words',async()=>{
 const n=card(),sentence='  在原通知所附二维码填写报名信息。  ';
 n.tasks[0].steps[0].details=sentence;n.tasks[0].details='';n.warnings='逾期不接受补报名。';
 const before=structuredClone(n),normalized=normalizeDescriptionArrays({schemaVersion:4,notices:[n]});
 assert.deepEqual(n,before);assert.deepEqual(normalized.notices[0].tasks[0].steps[0].details,[sentence]);
 assert.deepEqual(normalized.notices[0].tasks[0].details,[]);
 let calls=0;
 const output=await analyze('报名通知：在原通知所附二维码填写报名信息。逾期不接受补报名。',config,async()=>{calls++;return envelope(n);});
 assert.equal(calls,1);assert.deepEqual(output.result.notices[0].tasks[0].steps[0].details,[sentence.trim()]);
 assert.deepEqual(output.result.notices[0].warnings,['逾期不接受补报名。']);
});
test('normalization does not fill missing required fields or accept objects and overlong prose',async()=>{
 for(const change of [n=>delete n.tasks[0].steps[0].details,n=>n.tasks[0].steps[0].details={text:'说明'},n=>n.tasks[0].steps[0].details='长'.repeat(501)]){
  const n=card();change(n);await assert.rejects(analyze('比赛报名通知。',config,async()=>envelope(n)),error=>error.failureCode==='STEP_FIELDS'||error.failureCode==='STEP_DETAILS');
 }
});
test('unknown fields and fabricated links still fail after description normalization',async()=>{
 const n=card();n.tasks[0].steps[0].details='https://example.com/invented';
 await assert.rejects(analyze('比赛报名通知。',config,async()=>envelope(n)),error=>error.failureCode==='SOURCE_LINK');
 n.tasks[0].steps[0]={...n.tasks[0].steps[0],details:'二维码报名。',hidden:'未知字段'};
 await assert.rejects(analyze('二维码报名。',config,async()=>envelope(n)),error=>error.failureCode==='STEP_FIELDS');
});
