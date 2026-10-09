import test from 'node:test';
import assert from 'node:assert/strict';
import '../contracts/time.js';
import '../contracts/data.js';
const D=globalThis.CampusData,due='2026-06-01T15:00:00';
const taskText='报名截止时间之前（2026年6月1日15:00前）';
function record(raw=taskText,deadline=due){
  return D.create({schemaVersion:4,kind:'task',title:'赛事报名',summary:'参赛同学按通知报名。',deadline,deadlineText:'报名截止时间：2026年6月1日15:00',timeline:[],materials:[],warnings:[],reminders:[],tasks:[{text:'加入赛事QQ群',assignee:null,scope:'conditional',condition:'报名参赛的同学',details:[],steps:[],time:null,timeText:raw,location:null,timeSpec:{type:'unknown',year:null,month:null,day:null,hour:null,minute:null,rawText:raw}}]},'报名截止时间：2026年6月1日15:00；报名截止时间之前加入赛事QQ群。');
}

test('same complete deadline with expanded task phrasing retains urgency without mutating AI data',()=>{
  const n=record(),before=structuredClone(n);
  assert.equal(D.taskDeadline(n,n.tasks[0]),due);assert.equal(D.effectiveDeadline(n),due);assert.equal(D.priority(n,Date.parse('2026-06-01T16:00:00')).level,'overdue');assert.deepEqual(n,before);
});
test('missing year, relative, different, ranged or repeated task deadlines are never borrowed',()=>{
  for(const raw of ['6月1日15:00前','今天15:00前','明天中午前','2026年6月2日15:00前','2026年6月1日16:00前','2026年6月1日14:00至15:00前','每年2026年6月1日15:00前']){
    const n=record(raw);assert.equal(D.taskDeadline(n,n.tasks[0]),null);assert.equal(D.effectiveDeadline(n),null);
  }
});
test('same-clock event starts remain events, with or without their own ISO',()=>{
  const n=record('2026年6月1日15:00活动开始');assert.equal(D.taskDeadline(n,n.tasks[0]),null);
  n.tasks[0].time=due;assert.equal(D.taskDeadline(n,n.tasks[0]),null);
});
test('exact association does not create missing global deadlines or reinterpret a timezone',()=>{
  const absent=record(taskText,null);assert.equal(D.taskDeadline(absent,absent.tasks[0]),null);
  const utc=record(taskText,due+'Z');assert.equal(D.taskDeadline(utc,utc.tasks[0]),null);
});
test('24:00 association uses the explicit next-day ISO already in the global deadline',()=>{
  const n=record('请在2026年6月1日24:00前提交','2026-06-02T00:00:00');n.deadlineText='2026年6月1日24:00截止';assert.equal(D.taskDeadline(n,n.tasks[0]),n.deadline);
});
test('completed and excluded associated actions do not leave unrelated undated actions urgent',()=>{
  const n=record();n.tasks.push({...n.tasks[0],timeText:'后续安排等待群内通知',timeSpec:undefined});
  n.tasks[0].completed=true;assert.equal(D.effectiveDeadline(n),null);
  n.tasks[0].completed=false;n.tasks[0].dismissed=true;assert.equal(D.effectiveDeadline(n),null);
});
