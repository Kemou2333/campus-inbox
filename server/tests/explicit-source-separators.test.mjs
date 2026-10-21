import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,modelInput,modelPayload} from '../analyze.mjs';

const config={apiKey:'synthetic-unused',thinkingMode:'low',oneNoticePerSource:true};
const card=(sourceId,text)=>({sourceId,schemaVersion:4,kind:'task',title:text,summary:'本次办理事项已开放。',deadline:null,deadlineText:'',timeline:[],tasks:[{text,assignee:null,scope:'unspecified',condition:'',details:[],steps:[],time:null,timeText:'',location:null}],materials:[],warnings:[],reminders:[],reminderTitles:[]});
test('explicit separators inside a composer entry preserve source positions and keep other lines intact',()=>{
 const original='【篮球报名通知】\n报名篮球队。\n---\n【英语考试通知】\n参加英语考试。';
 const input={sources:[{text:original},{text:'宿舍通知，正文中的 --- 不是分隔。'}]};
 assert.deepEqual(modelInput(input),{sources:[{sourceId:1,text:'【篮球报名通知】\n报名篮球队。'},{sourceId:2,text:'【英语考试通知】\n参加英语考试。'},{sourceId:3,text:'宿舍通知，正文中的 --- 不是分隔。'}],sourceOriginIndexes:[0,0,1]});
 const payload=modelPayload(input,config),sent=JSON.parse(payload.messages[1].content);
 assert.deepEqual(Object.keys(sent),['sources']);
 assert.equal(payload.messages[0].content.includes('恰有 3 张卡'),true);
 assert.equal(input.sources[0].text,original);
});
test('one provider call returns all separated cards with the original draft mapping',async()=>{
 let calls=0;
 const output=await analyze({sources:[{text:'【篮球报名通知】\n报名篮球队。\n---\n【英语考试通知】\n参加英语考试。'},{text:'宿舍登记。'}]},config,async()=>{
  calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:4,notices:[card(1,'报名篮球队'),card(2,'参加英语考试'),card(3,'登记宿舍信息')]})}}],usage:{prompt_tokens:30,completion_tokens:60}});
 });
 assert.equal(calls,1);assert.deepEqual(output.result.sourceIndexes,[0,0,1]);
 assert.equal(output.result.notices.length,3);
});
test('each separated segment keeps its own URL boundary',async()=>{
 const first=card(1,'报名篮球队');first.tasks[0].details=['https://example.com/english'];
 await assert.rejects(analyze({sources:[{text:'【篮球报名通知】\nhttps://example.com/basketball\n---\n【英语考试通知】\nhttps://example.com/english'}]},config,async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:4,notices:[first,card(2,'参加英语考试')]})}}],usage:{prompt_tokens:30,completion_tokens:60}})),error=>error.failureCode==='SOURCE_LINK');
});
test('empty edge delimiters do not create notices and expanded source counts remain bounded',()=>{
 assert.deepEqual(modelInput({sources:[{text:'---\n完整通知\n---'}]}),{sources:[{sourceId:1,text:'---\n完整通知\n---'}]});
 assert.throws(()=>modelInput({sources:[{text:Array(21).fill('【一条通知】\n办理事项。').join('\n---\n')}]}),error=>error.status===400);
});
