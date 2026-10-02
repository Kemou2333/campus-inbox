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
