import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../dist/data.js';
const D=globalThis.CampusData;
const action={text:'办理请假',assignee:'请假学生',scope:'conditional',condition:'需要请假的同学',details:[],time:null,timeText:'',location:null,steps:[{text:'上传截图',details:['发给通知发布者']},{text:'填写办事簿',details:[]}]};
const model={schemaVersion:4,kind:'task',title:'请假通知',summary:'需要请假的同学办理。',deadline:null,deadlineText:'',timeline:[],tasks:[action],materials:[],warnings:[],reminders:[]};
function oldRecord(){const local=D.create(model,'原始通知');local.id='legacy-notice-one';local.tasks[0].steps.forEach(s=>delete s.id);return local;}

test('new model steps receive private random identities without changing model content',()=>{
 const before=structuredClone(model),first=D.create(model,'原始通知'),second=D.create(model,'原始通知');
 const ids=[...first.tasks[0].steps,...second.tasks[0].steps].map(s=>s.id);
 assert.equal(new Set(ids).size,4);assert.ok(ids.every(id=>typeof id==='string'&&id.length>0));
 assert.deepEqual(D.analysis(first).tasks[0].steps,model.tasks[0].steps);assert.deepEqual(model,before);
 assert.ok(!Object.hasOwn(D.analysis(first).tasks[0].steps[0],'id'));
});

test('old v1-v4 backups migrate IDs consistently in independent browser runtimes',()=>{
 const code=readFileSync(new URL('../dist/data.js',import.meta.url),'utf8'),one={},two={};
 vm.runInNewContext(code,one);vm.runInNewContext(code,two);
 const old=oldRecord(),before=structuredClone(old);
 for(const version of [1,2,3,4]){
  const backup={app:'campus-inbox',version,notices:[old]};
  const a=one.CampusData.backup(JSON.parse(JSON.stringify(backup)))[0];
  const b=two.CampusData.backup(JSON.parse(JSON.stringify(backup)))[0];
  assert.deepEqual(Array.from(a.tasks[0].steps,s=>s.id),Array.from(b.tasks[0].steps,s=>s.id));
  assert.ok(a.tasks[0].steps.every(s=>s.id.startsWith('legacy-step-v1-')));
 }
 assert.deepEqual(old,before);
 const differentNotice=D.notice({...old,id:'legacy-notice-two'});
 assert.notEqual(D.notice(old).tasks[0].steps[0].id,differentNotice.tasks[0].steps[0].id);
 const repeated=structuredClone(old);repeated.tasks[0].steps.push({...repeated.tasks[0].steps[0]});
 assert.equal(new Set(D.notice(repeated).tasks[0].steps.map(s=>s.id)).size,3);
 const differentTask=structuredClone(old);differentTask.tasks.push(structuredClone(differentTask.tasks[0]));
 const migrated=D.notice(differentTask);assert.notEqual(migrated.tasks[0].steps[0].id,migrated.tasks[1].steps[0].id);
});

test('persisted IDs survive preceding-step deletion, rename, notes and completion changes',()=>{
 const migrated=D.notice(oldRecord()),lastID=migrated.tasks[0].steps[1].id;
 const persisted=JSON.parse(JSON.stringify(migrated));persisted.tasks[0].steps.shift();
 persisted.tasks[0].steps[0].text='重新填写办事簿';persisted.tasks[0].steps[0].details=['补充详细去向'];
 persisted.tasks[0].steps[0].completed=true;persisted.tasks[0].steps[0].note='已核实';
 const restored=D.notice(persisted);assert.equal(restored.tasks[0].steps[0].id,lastID);
 assert.equal(restored.tasks[0].steps[0].note,'已核实');assert.equal(restored.tasks[0].steps[0].completed,true);
 assert.equal(D.notice(restored).tasks[0].steps[0].id,lastID);
});

test('local manual-step IDs and backup round trips remain unchanged',()=>{
 const local=D.create(model,'原始通知');local.tasks[0].steps.push({id:'manual-step:one',text:'打印凭据',details:[],completed:false,note:'打印两份'});
 const normalized=D.notice(local),exported=D.exportBackup([normalized]);
 assert.equal(exported.version,4);
 const [restored]=D.backup(JSON.parse(JSON.stringify(exported)));
 assert.deepEqual(restored.tasks[0].steps,normalized.tasks[0].steps);
 assert.equal(restored.tasks[0].steps[2].id,'manual-step:one');
});

test('local IDs reject duplicates within a parent and invalid supplied identifiers',()=>{
 const local=D.create(model,'原始通知');
 const duplicate=structuredClone(local);duplicate.tasks[0].steps[1].id=duplicate.tasks[0].steps[0].id;
 assert.throws(()=>D.notice(duplicate),/步骤编号重复/);
 for(const id of ['',null,123,' spaces ','bad/id','<script>','x'.repeat(151)]){
  const invalid=structuredClone(local);invalid.tasks[0].steps[0].id=id;
  assert.throws(()=>D.notice(invalid),/步骤编号格式/);
 }
 const separateParents=structuredClone(local);separateParents.tasks.push(structuredClone(separateParents.tasks[0]));
 assert.doesNotThrow(()=>D.notice(separateParents));
});

test('strict model validation never accepts local step IDs or progress metadata',()=>{
 for(const property of ['id','completed','note']){
  const invalid=structuredClone(model);invalid.tasks[0].steps[0][property]=property==='completed'?false:'local-only';
  assert.throws(()=>D.analysis(invalid,true),/步骤字段/);
  assert.throws(()=>D.batch({schemaVersion:4,notices:[invalid]},true),/步骤字段/);
 }
 const normalized=D.analysis(model,true);assert.deepEqual(normalized.tasks[0].steps,action.steps);
});
