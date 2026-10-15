import {describe,expect,it} from 'vitest';
import {createNotice,exportBackup,parseAnalysis,parseBackup,parseNotice,toggleStep,updateNote} from '../src/domain/notice';
import {effectiveNotice,parseCorrections,restoreAIContent,setCorrections} from '../src/domain/corrections';
import {evidenceFor,segmentSource} from '../src/domain/source-evidence';
import type {NoticeAnalysis} from '../src/domain/types';
import '../server/contracts/time.js';
import '../server/contracts/data.js';

const original='课程学习通知。\n普通班须观看20%的视频并完成课程问答。\n请在2026年10月20日18:00前提交原创素材，可以为视频、音频或文字。';
function fixture():NoticeAnalysis{return {schemaVersion:4,kind:'task',title:'课程学习',summary:'普通班完成线上学习。',deadline:null,deadlineText:'',timeline:[],materials:[],warnings:['素材必须原创。'],reminders:['观看20%的视频并完成课程问答。'],reminderTitles:['线上学习'],tasks:[{text:'提交学习素材',assignee:null,scope:'conditional',condition:'普通班同学',details:['可以为视频或文字。'],steps:[{text:'制作原创素材',details:['保留制作过程。']}],time:null,timeText:'',location:null}]};}
function record(){const analysis=fixture();analysis.sourceRefs={'tasks.0.details.0':[3],'reminders.0':[2],'reminderTitles.0':[2]};return createNotice(analysis,original);}

describe('原文出处与人工纠错边界',()=>{
 it('分段原文位置是准确UTF16切片，trim和重载后编号稳定',()=>{
  const input='  通知😀。\r\n'+ '长句'.repeat(180)+'\n截止。  ',source=input.trim(),segments=segmentSource(input);
  expect(segments.length).toBeGreaterThan(3);expect(segments.map(s=>s.index)).toEqual(segments.map((_,i)=>i+1));
  for(const segment of segments)expect(source.slice(segment.start,segment.end)).toBe(segment.text);
  expect(segmentSource(source)).toEqual(segments);
 });
 it('来源段号保存/恢复且只对原文定位，不将文字匹配当语义核实',()=>{
  const n=record(),restored=parseNotice(n),evidence=evidenceFor(restored,'tasks.0.details.0');
  expect(restored.sourceRefs).toEqual(n.sourceRefs);expect(evidence.segments[0].text).toContain('音频');expect(evidence.inferred).toBe(false);
  expect(evidence.status).toBe('原文出处');expect(evidenceFor(n,'summary').segments).toEqual([]);
 });
 it.each([{'tasks.99.text':[1]},{'__proto__.polluted':[1]},{'summary':[0]},{'summary':[-1]},{'summary':[1.5]},{'summary':[1,1]},{'summary':Array.from({length:9},(_,i)=>i+1)}])('拒绝未知路径或无效段号 %j',refs=>{expect(()=>parseAnalysis({...fixture(),sourceRefs:refs})).toThrow();});
 it('创建时拒绝超出原文段数的出处，不能让虚假引用变成高亮',()=>{expect(()=>createNotice({...fixture(),sourceRefs:{summary:[4]}},original)).toThrow();});
 it('旧通知无出处仍可读取，不猜测或把重复文字误当出处',()=>{
  const n=createNotice(fixture(),original);expect(parseNotice(n).sourceRefs).toBeUndefined();
  expect(evidenceFor(n,'reminders.0').segments).toEqual([]);expect(evidenceFor(n,'reminders.0').inferred).toBe(false);expect(evidenceFor(n,'summary').status).toBe('未关联');
 });
 it('可补漏项、修改标题/步骤/提醒，AI与原文/进度/笔记/附件/本地日期不变',()=>{
  let n=record();n.attachments=['local-file'];n.localDeadline='2026-10-21T18:00:00';n=toggleStep(n,n.tasks[0].id,n.tasks[0].steps[0].id);n=updateNote(n,{type:'task',taskId:n.tasks[0].id},'我的进度');
  const before=structuredClone(n),corrected=setCorrections(n,[{path:'tasks.0.details.0',value:'可以为视频、音频或文字。'},{path:'title',value:'课程学习安排'},{path:'tasks.0.steps.0.text',value:'自行制作素材'},{path:'reminders.0',value:'观看至少20%视频，完成课程问答。'}]);
  expect(corrected.tasks).toEqual(before.tasks);expect(corrected.originalText).toBe(before.originalText);expect(corrected.title).toBe(before.title);
  const shown=effectiveNotice(corrected);expect(shown.tasks[0].details[0]).toContain('音频');expect(shown.title).toBe('课程学习安排');expect(shown.tasks[0].steps[0].completed).toBe(true);expect(shown.tasks[0].note).toBe('我的进度');expect(shown.attachments).toEqual(before.attachments);expect(shown.localDeadline).toBe(before.localDeadline);
  expect(evidenceFor(corrected,'tasks.0.details.0').edited).toBe(true);expect(effectiveNotice(parseBackup(exportBackup([corrected]))[0])).toEqual(shown);
  const restored=restoreAIContent(corrected);expect(restored.tasks).toEqual(before.tasks);expect(restored.corrections).toBeUndefined();expect(restored.sourceRefs).toEqual(before.sourceRefs);
 });
 it('修正时间只在显示层解析，不借原年份补猜；原AI日期和本地覆盖保留',()=>{
  const n=record();n.tasks[0].time='2026-10-20T18:00:00';n.tasks[0].timeText='2026年10月20日18:00';n.tasks[0].localDeadline='2026-10-22T18:00:00';
  const corrected=setCorrections(n,[{path:'tasks.0.timeText',value:'10月21日'}]),shown=effectiveNotice(corrected);
  expect(corrected.tasks[0].time).toBe(n.tasks[0].time);expect(shown.tasks[0].time).toBeNull();expect(shown.tasks[0].timeSpec?.year).toBeNull();expect(shown.tasks[0].localDeadline).toBe(n.tasks[0].localDeadline);
 });
 it.each(['originalText','tasks.0.id','tasks.0.completed','sourceRefs','tasks.9.text','__proto__.text'])('修正不能改变受保护字段 %s',path=>{expect(()=>setCorrections(record(),[{path,value:'覆盖'}])).toThrow();});
 it('空必填、重复路径、错误标题与大内容均拒绝',()=>{
  const n=record();expect(()=>setCorrections(n,[{path:'title',value:''}])).toThrow();expect(()=>setCorrections(n,[{path:'title',value:'甲'},{path:'title',value:'乙'}])).toThrow();expect(()=>setCorrections(n,[{path:'reminderTitles.0',value:'长'.repeat(17)}])).toThrow();expect(()=>setCorrections(n,[{path:'reminderTitles.0',value:'短'}])).toThrow();
  expect(()=>parseCorrections({updatedAt:'无效',values:[]},n)).toThrow();expect(()=>setCorrections(n,[{path:'tasks.0.steps.0.text',value:'长'.repeat(61)}])).toThrow();
 });
 it('适用范围与对象条件可以一起纠正，组合须有效，AI原字段仍保留',()=>{
  const n=record();expect(()=>setCorrections(n,[{path:'tasks.0.scope',value:'role'}])).toThrow();
  const corrected=setCorrections(n,[{path:'tasks.0.scope',value:'role'},{path:'tasks.0.assignee',value:'班级负责人'},{path:'tasks.0.condition',value:''}]);
  expect(effectiveNotice(corrected).tasks[0].scope).toBe('role');expect(effectiveNotice(corrected).tasks[0].assignee).toBe('班级负责人');expect(corrected.tasks[0].scope).toBe('conditional');
  expect(parseNotice(corrected).corrections).toEqual(corrected.corrections);expect(()=>setCorrections(n,[{path:'tasks.0.scope',value:'administrator'}])).toThrow();
 });
 it('实际云端文字合同与隔离SQLite往返保留出处/修正/初稿与状态，恢复也能同步',async()=>{
  const runtimeModule='../server/sync.mjs', {createSyncService}=await import(runtimeModule);
  const identity={provider:'invite',subject:'synthetic-source-test'},origin='https://example.test';
  const service=await createSyncService({signingSecret:'synthetic-not-a-real-secret-source',allowedOrigins:[origin],stateFile:':memory:'},{authenticate:()=>identity});
  try{
   const key=service.provision(identity,'synthetic-network').key;
   const post=(body:unknown)=>service.handle(new Request(origin+'/sync',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body)}),'synthetic-network');
   let n=record();n=updateNote(n,{type:'notice'},'同步测试笔记');n=toggleStep(n,n.tasks[0].id,n.tasks[0].steps[0].id);
   const corrected=setCorrections(n,[{path:'tasks.0.details.0',value:'视频、音频或文字均可。'},{path:'tasks.0.scope',value:'role'},{path:'tasks.0.assignee',value:'班级负责人'}]);
   const uploaded=await post({cursor:0,changes:[{id:n.id,baseVersion:0,record:corrected}]});expect(uploaded.status).toBe(200);
   const reply=await uploaded.json(),received=parseNotice(reply.updates[0].record);
   expect(received).toEqual(corrected);expect(effectiveNotice(received).tasks[0].details[0]).toContain('音频');
   const restored=restoreAIContent(received),saved=await post({cursor:reply.cursor,changes:[{id:n.id,baseVersion:reply.accepted[0].version,record:restored}]});expect(saved.status).toBe(200);
   const fresh=await (await post({cursor:0,changes:[]})).json(),again=parseNotice(fresh.updates[0].record);
   expect(again.corrections).toBeUndefined();expect(again.sourceRefs).toEqual(n.sourceRefs);expect(again.tasks).toEqual(n.tasks);expect(again.originalText).toBe(original);expect(again.note).toBe(n.note);
  }finally{service.close();}
 });
});
