import test from 'node:test';
import assert from 'node:assert/strict';
import '../dist/data.js';
const D=globalThis.CampusData;
const analysis={schemaVersion:4,kind:'task',title:'填写登记',summary:'需要登记的同学填写。',deadline:null,deadlineText:'明天中午前',tasks:[{text:'提交登记',assignee:'需要登记的同学',details:[],time:null,timeText:'明天中午前',location:null}],timeline:[],materials:[],warnings:[],reminders:[]};

test('calendar rejects impossible dates, times and offsets',()=>{
  for(const value of ['2026-02-29T10:00:00','2026-04-31T10:00:00','2026-10-01T24:00:00','2026-10-01T10:60:00','2026-10-01T10:00:60','2026-10-01T10:00:00+14:01','2026-10-01T10:00:00+15:00','10月7日17:00'])assert.throws(()=>D.date(value));
  for(const value of ['2028-02-29T10:00:00','2026-10-01T10:00:00+14:00','2026-10-01T10:00:00-08:00'])assert.equal(D.date(value),value);
});

test('batch and task shape reject extra instructions and impossible classifications',()=>{
  const wrapped={schemaVersion:4,notices:[analysis]};assert.equal(D.batch(wrapped,true).notices.length,1);
  for(const value of [{...wrapped,execute:'anything'},{schemaVersion:4,notices:[]},{schemaVersion:4,notices:Array(21).fill(analysis)},{...wrapped,notices:[{...analysis,tasks:[{...analysis.tasks[0],execute:'anything'}]}]},{...wrapped,notices:[{...analysis,kind:'information'}]},{...wrapped,notices:[{...analysis,kind:'reminder',tasks:[],reminders:[]}]}])assert.throws(()=>D.batch(value,true));
});

test('legacy backup upgrades retain completion states and do not invent timestamps',()=>{
  const current=D.create(analysis,'原文');
  const legacy={...current,tasks:[{text:'保留旧任务',completed:true}]};delete legacy.kind;delete legacy.schemaVersion;delete legacy.timeline;delete legacy.reminders;delete legacy.attachments;
  for(const version of [1,2,3]){
    const [upgraded]=D.backup({app:'campus-inbox',version,notices:[legacy]});
    assert.equal(upgraded.tasks[0].completed,true);assert.equal(upgraded.deadline,null);assert.equal(upgraded.deadlineText,'明天中午前');assert.deepEqual(upgraded.attachments,[]);assert.equal(upgraded.schemaVersion,4);
  }
});

test('invalid backups are rejected without mutating input or retaining unknown fields',()=>{
  const original=D.create(analysis,'<img src=x onerror=alert(1)>');
  const source={...original,unexpected:'ignored'};const snapshot=structuredClone(source);
  const normalized=D.notices([source]);assert.deepEqual(source,snapshot);assert.ok(!Object.hasOwn(normalized[0],'unexpected'));assert.equal(normalized[0].originalText,original.originalText);
  for(const invalid of [[original,original],[{...original,completed:'true'}],[{...original,tasks:[{...original.tasks[0],completed:'yes'}]}],[{...original,attachments:['same','same']}],[{...original,attachments:Array.from({length:11},(_,i)=>'file-'+i)}]])assert.throws(()=>D.notices(invalid));
  assert.throws(()=>D.backup({app:'another-app',version:4,notices:[]}));assert.throws(()=>D.backup({app:'campus-inbox',version:5,notices:[]}));
});

test('deadline sort is stable for unknown times and leaves the original list intact',()=>{
  const unknown={...D.create(analysis,'原文'),createdAt:'2026-10-02T08:00:00Z'};
  const earlier={...D.create(analysis,'原文'),deadline:'2026-10-03T08:00:00Z',createdAt:'2026-10-01T08:00:00Z'};
  const later={...D.create(analysis,'原文'),deadline:'2026-10-04T08:00:00Z',createdAt:'2026-10-01T08:00:00Z'};
  const original=[unknown,later,earlier],before=original.map(n=>n.id);
  assert.deepEqual(D.sort(original,'deadline').map(n=>n.id),[earlier.id,later.id,unknown.id]);assert.deepEqual(original.map(n=>n.id),before);
});

test('strict AI timeline rejects extra or missing fields while legacy backup remains readable',()=>{
  const point={label:'活动开始',time:null,timeText:'明天',location:null};
  assert.doesNotThrow(()=>D.analysis({...analysis,timeline:[point]},true));
  assert.throws(()=>D.analysis({...analysis,timeline:[{...point,execute:'anything'}]},true));
  const missing={...point};delete missing.location;
  assert.throws(()=>D.analysis({...analysis,timeline:[missing]},true));
  assert.equal(D.analysis({...analysis,timeline:[{...point,legacy:'ignored'}]}).timeline[0].label,'活动开始');
});

test('new input is capped at 4000 characters while old 12000-character records remain readable',()=>{
  assert.equal(D.MAX_TEXT,4000);
  assert.equal(D.create(analysis,'字'.repeat(4000)).originalText.length,4000);
  assert.throws(()=>D.create(analysis,'字'.repeat(4001)));
  const legacy={...D.create(analysis,'旧通知'),originalText:'字'.repeat(12000)};
  assert.equal(D.backup({app:'campus-inbox',version:4,notices:[legacy]})[0].originalText.length,12000);
  assert.throws(()=>D.notices([{...legacy,originalText:'字'.repeat(12001)}]));
});

test('task applicability distinguishes everyone, conditional branches and other roles',()=>{
  const base=analysis.tasks[0];
  for(const scope of ['all','conditional','role','unspecified']){
    const input={...base,scope,condition:scope==='conditional'?'尚未选上该课程的同学':''};
    assert.equal(D.task(input,true).scope,scope);
  }
  const old=D.task(base,true);assert.equal(old.scope,'unspecified');assert.equal(old.condition,'');assert.equal(old.assignee,base.assignee);
  const invalid=[
    {...base,scope:'everybody',condition:''},
    {...base,scope:'conditional',condition:''},
    {...base,scope:'conditional',condition:'   '},
    {...base,scope:'role',condition:'',assignee:null},
    {...base,scope:'all'},
    {...base,condition:'不完整'},
    {...base,scope:'conditional',condition:'字'.repeat(121)},
    {...base,scope:'all',condition:123}
  ];
  for(const input of invalid)assert.throws(()=>D.task(input,true));
  assert.equal(D.task({...base,scope:'conditional',condition:'字'.repeat(120)},true).condition.length,120);
});

test('notes and not-applicable decisions survive backups without entering the model contract',()=>{
  const current=D.create(analysis,'原文');
  assert.equal(current.note,'');assert.equal(current.audienceOverride,'');assert.equal(current.tasks[0].dismissed,false);
  const local={...current,note:'待联系本人\n确认后再提交',audienceOverride:'all',tasks:[{...current.tasks[0],dismissed:true}]};
  const [restored]=D.backup(D.exportBackup([local]));
  assert.equal(restored.note,local.note);assert.equal(restored.audienceOverride,'all');assert.equal(restored.tasks[0].dismissed,true);assert.equal(restored.tasks[0].completed,false);
  const legacy={...local};delete legacy.note;delete legacy.audienceOverride;legacy.tasks=legacy.tasks.map(({dismissed,...task})=>task);
  for(const version of [1,2,3,4]){
    const [old]=D.backup({app:'campus-inbox',version,notices:[legacy]});
    assert.equal(old.note,'');assert.equal(old.audienceOverride,'');assert.equal(old.tasks[0].dismissed,false);
  }
  assert.equal(D.notice({...local,note:'字'.repeat(D.MAX_NOTE)}).note.length,4000);
  for(const invalid of [{...local,note:'字'.repeat(4001)},{...local,note:123},{...local,audienceOverride:'conditional'},{...local,audienceOverride:null},{...local,tasks:[{...local.tasks[0],dismissed:'yes'}]}])assert.throws(()=>D.notice(invalid));
  assert.throws(()=>D.analysis({...analysis,note:'模型不得生成笔记'},true));
  assert.throws(()=>D.analysis({...analysis,audienceOverride:'all'},true));
  assert.throws(()=>D.analysis({...analysis,tasks:[{...analysis.tasks[0],dismissed:true}]},true));
  assert.throws(()=>D.analysis({...analysis,tasks:[{...analysis.tasks[0],note:'模型不得生成笔记'}]},true));
  const normalized=D.analysis(local);assert.ok(!Object.hasOwn(normalized,'note'));assert.ok(!Object.hasOwn(normalized,'audienceOverride'));assert.ok(!Object.hasOwn(normalized.tasks[0],'dismissed'));
});

test('per-item notes, reminder notes and personal dates round trip only as local data',()=>{
 const n=D.create(analysis,'原文');n.tasks[0].note='事项专属批注';n.tasks[0].localDeadline='2026-10-07T09:00:00Z';n.localDeadline='2026-10-08T09:00:00Z';
 const info=D.create({...analysis,kind:'reminder',tasks:[],reminders:['记得关电源','遵守住宿纪律']},'原文');info.reminderNotes[1]='已确认';
 const [restored,r]=D.backup(D.exportBackup([n,info]));assert.equal(restored.tasks[0].note,n.tasks[0].note);assert.equal(restored.tasks[0].localDeadline,n.tasks[0].localDeadline);assert.deepEqual(r.reminderNotes,['','已确认']);
 assert.throws(()=>D.analysis({...analysis,localDeadline:n.localDeadline},true));assert.throws(()=>D.task({...analysis.tasks[0],localDeadline:n.localDeadline},true));
 assert.throws(()=>D.notice({...n,tasks:[{...n.tasks[0],note:'x'.repeat(4001)}]}));assert.throws(()=>D.notice({...info,reminderNotes:['','','extra']}));assert.throws(()=>D.notice({...n,localDeadline:'2026-02-30T12:00:00Z'}));
});

test('local priority ignores finished items, supports personal overrides and never guesses missing dates',()=>{
 const now=Date.parse('2026-10-04T00:00:00Z'),n=D.create(analysis,'原文');
 assert.equal(D.priority(n,now).level,'unknown');assert.equal(D.effectiveDeadline(n),null);
 const t={...n,tasks:[{...n.tasks[0],localDeadline:'2026-10-03T23:59:00Z'},{...n.tasks[0],localDeadline:'2026-10-04T12:00:00Z'}]};
 assert.equal(D.priority(t,now).level,'overdue');t.tasks[0].completed=true;assert.equal(D.priority(t,now).level,'soon');
 t.tasks[1].dismissed=true;assert.equal(D.priority(t,now).level,'unknown');
 const upcoming={...n,deadline:'2026-10-06T12:00:00Z'},later={...n,deadline:'2026-10-12T12:00:00Z'};
 assert.equal(D.priority(upcoming,now).level,'upcoming');assert.equal(D.priority(later,now).level,'scheduled');assert.equal(D.priority({...upcoming,completed:true},now).level,'unknown');
 const overridden={...later,localDeadline:'2026-10-04T20:00:00Z'};assert.equal(D.priority(overridden,now).level,'soon');
 assert.deepEqual(D.sort([n,later,upcoming,overridden],'priority',now),[overridden,upcoming,later,n]);
});

test('AI may group necessary same-person actions into steps without accepting local or role fields',()=>{
 const student={...analysis.tasks[0],assignee:'请假学生',scope:'conditional',condition:'需办理10月8日请假的同学',text:'办理普通请假',steps:[{text:'提交家长短信截图',details:['发给通知发布者']},{text:'填写办事簿',details:['写明请假事由和详细去向']},{text:'提交智慧学工请假',details:[]}]};
 const parent={...analysis.tasks[0],assignee:'家长',scope:'role',condition:student.condition,text:'发送请假短信',steps:[]};
 const result=D.analysis({...analysis,tasks:[parent,student]},true);
 assert.equal(result.tasks[0].scope,'role');assert.equal(result.tasks[1].steps.length,3);assert.equal(result.tasks[1].condition,student.condition);
 assert.deepEqual(result.tasks[1].steps[0],student.steps[0]);
 for(const key of ['assignee','condition','scope','completed','note','steps'])assert.throws(()=>D.task({...student,steps:[{...student.steps[0],[key]:'extra'}]},true));
 assert.throws(()=>D.task({...student,steps:[{text:'未提供细节字段'}]},true));
 assert.throws(()=>D.task({...student,steps:['字符串步骤']},true));
});

test('steps validate practical limits and optional v4 compatibility',()=>{
 const old=D.task(analysis.tasks[0],true);assert.deepEqual(old.steps,[]);
 const max={text:'字'.repeat(60),details:Array(5).fill('字'.repeat(500))};
 assert.equal(D.task({...analysis.tasks[0],steps:Array(10).fill(max)},true).steps.length,10);
 for(const steps of [null,{},Array(11).fill(max),[{...max,text:'字'.repeat(61)}],[{...max,text:' '}],[{...max,details:Array(6).fill('详情')}],[{...max,details:['字'.repeat(501)]}],[{...max,details:[' ']}]]){
  assert.throws(()=>D.task({...analysis.tasks[0],steps},true));
 }
});

test('step completion and private notes survive save/export/import without rewriting AI content',()=>{
 const a={...analysis,tasks:[{...analysis.tasks[0],steps:[{text:'提交截图',details:['提交给发布者']},{text:'填写办事簿',details:[]}]}]};
 const local=D.create(a,'通知原文');
 assert.deepEqual(local.tasks[0].steps[0],{...a.tasks[0].steps[0],completed:false,note:''});
 local.tasks[0].note='学生流程笔记';local.tasks[0].steps[0].completed=true;local.tasks[0].steps[0].note='家长刚发了短信，截图已提交';local.tasks[0].steps[1].note='晚饭后填写';
 const before=structuredClone(local);
 const [restored]=D.backup(D.exportBackup([local]));
 assert.deepEqual(restored.tasks[0].steps,before.tasks[0].steps);assert.equal(restored.tasks[0].note,'学生流程笔记');assert.equal(restored.tasks[0].completed,false);assert.deepEqual(local,before);
 const model=D.analysis(restored);assert.deepEqual(model.tasks[0].steps,a.tasks[0].steps);assert.ok(!Object.hasOwn(model.tasks[0].steps[0],'completed'));assert.ok(!Object.hasOwn(model.tasks[0].steps[0],'note'));
 const bad=structuredClone(local);bad.tasks[0].steps[0].completed='true';assert.throws(()=>D.notice(bad));
 const tooLong=structuredClone(local);tooLong.tasks[0].steps[0].note='字'.repeat(4001);assert.throws(()=>D.notice(tooLong));
});

test('legacy backups gain empty steps and partially stored steps gain default local state',()=>{
 const local=D.create(analysis,'通知原文');delete local.tasks[0].steps;
 for(const version of [1,2,3,4])assert.deepEqual(D.backup({app:'campus-inbox',version,notices:[local]})[0].tasks[0].steps,[]);
 local.tasks[0].steps=[{text:'用户补充的步骤',details:[]}];
 assert.deepEqual(D.notice(local).tasks[0].steps,[{text:'用户补充的步骤',details:[],completed:false,note:''}]);
 const ready={...local,tasks:[{...local.tasks[0],completed:true,steps:[{text:'仍未勾选的旧步骤',details:[],completed:false,note:'保留用户记录'}]}]};
 assert.equal(D.notice(ready).tasks[0].completed,true);assert.equal(D.notice(ready).tasks[0].steps[0].completed,false);
});

test('independent deadline moves to the next unfinished action and event starts remain unranked',()=>{
 const n=D.create(analysis,'原文'),now=Date.parse('2026-10-04T00:00:00Z');
 n.deadline='2026-10-03T12:00:00Z';n.deadlineText='2026年10月3日12:00前';
 n.tasks=[{...n.tasks[0],time:n.deadline,timeText:n.deadlineText,completed:true},{...n.tasks[0],time:'2026-10-06T12:00:00Z',timeText:'2026年10月6日12:00前'}];
 assert.equal(D.priority(n,now).level,'upcoming');assert.equal(D.effectiveDeadline(n),n.tasks[1].time);
 n.tasks[1].timeText='2026年10月6日12:00活动开始';assert.equal(D.priority(n,now).level,'unknown');
});
