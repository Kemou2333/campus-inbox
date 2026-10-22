import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,normalizeDescriptionArrays} from '../analyze.mjs';
const card=()=>({sourceId:1,schemaVersion:4,kind:'task',title:'篮球队报名',summary:'学院篮球队招募新队员。',deadline:null,deadlineText:'',timeline:[],tasks:[{text:'完成报名',assignee:null,scope:'all',condition:'',details:[],steps:[{text:'填写预选表',details:['在**原通知表格**登记。'],time:null,timeText:'',location:null}],time:null,timeText:'',location:null}],materials:[],warnings:[],reminders:[],reminderTitles:[]});
const envelope=n=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:4,notices:[n]})}}],usage:{prompt_tokens:10,completion_tokens:30}});
const config={apiKey:'synthetic-unused',oneNoticePerSource:true};
test('only exactly empty known task metadata can be removed from a step, without prose edits or mutation',async()=>{
 const n=card(),before=structuredClone(n),normalized=normalizeDescriptionArrays({schemaVersion:4,notices:[n]});
 assert.deepEqual(n,before);assert.deepEqual(normalized.notices[0].tasks[0].steps[0],{text:'填写预选表',details:['在**原通知表格**登记。']});
 assert.equal(normalized.notices[0].tasks[0].time,null);assert.equal(normalized.notices[0].tasks[0].timeText,'');assert.equal(normalized.notices[0].tasks[0].location,null);
 let calls=0;const result=await analyze('在原通知表格登记篮球队报名。',config,async()=>{calls++;return envelope(n);});assert.equal(calls,1);assert.equal(result.result.notices[0].tasks[0].steps[0].details[0],'在**原通知表格**登记。');
});
test('nonempty time/location, wrong empty types and unknown step fields remain strict failures',async()=>{
 for(const extra of [{time:'2026-10-22T18:00:00'},{timeText:'10月22日'},{timeText:' '},{location:'D1146'},{location:''},{hidden:null}]){
  const n=card();Object.assign(n.tasks[0].steps[0],extra);
  await assert.rejects(analyze('篮球队报名。',config,async()=>envelope(n)),error=>error.failureCode==='STEP_FIELDS');
 }
});
test('empty metadata does not fill required step fields',async()=>{
 for(const key of ['text','details']){const n=card();delete n.tasks[0].steps[0][key];await assert.rejects(analyze('篮球队报名。',config,async()=>envelope(n)),error=>error.failureCode==='STEP_FIELDS'||error.failureCode==='STEP_TEXT'||error.failureCode==='STEP_DETAILS');}
});
