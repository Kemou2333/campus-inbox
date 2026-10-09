import {describe,expect,test} from 'vitest';
import {readFile} from 'node:fs/promises';
import {exampleFingerprint,mergeExamples} from '../src/domain/examples';
import {createNotice} from '../src/domain/notice';
import type {Notice,NoticeAnalysis} from '../src/domain/types';

const analysis:NoticeAnalysis={schemaVersion:4,kind:'task',title:'旧示例',summary:'请办理通知事项。',deadline:null,deadlineText:'',timeline:[],materials:[],warnings:[],reminders:[],tasks:[{text:'提交材料',assignee:null,scope:'all',condition:'',details:[],steps:[{text:'上传材料',details:[]}],time:null,timeText:'',location:null}]};
const old=()=>({...createNotice(analysis,'通知原文','2026-10-04T00:00:00Z'),id:'example-reading-v21-0'});
const fresh=(originalText='通知原文',id='example-reading-v25-0')=>({...createNotice({...analysis,title:'新版示例'},originalText,'2026-10-09T00:00:00Z'),id});
const registry=async(record:Notice)=>[{id:record.id,fingerprint:await exampleFingerprint(record)}];

describe('safe built-in example upgrades',()=>{
  test('canonical SHA256 ignores only record timestamps and object key order',async()=>{
    const original=old(),reordered=Object.fromEntries(Object.entries(original).reverse()) as unknown as Notice;
    reordered.createdAt='2026-10-06T00:00:00Z';reordered.updatedAt='2026-10-07T00:00:00Z';
    expect(await exampleFingerprint(reordered)).toBe(await exampleFingerprint(original));
    expect(await exampleFingerprint(original)).toMatch(/^[a-f0-9]{64}$/);
    reordered.note='个人补充';expect(await exampleFingerprint(reordered)).not.toBe(await exampleFingerprint(original));
  });
  test('a verified untouched old built-in is replaced and the operation becomes idempotent',async()=>{
    const original=old(),newer=fresh(),catalog=await registry(original);
    const result=await mergeExamples([original],[newer],catalog);
    expect(result).toEqual({notices:[newer],added:1,replaced:1});
    expect(await mergeExamples(result.notices,[newer],catalog)).toEqual({notices:[newer],added:0,replaced:0});
  });
  test('notes, completion, applicability, personal schedules and attachments protect modified old built-ins',async()=>{
    const original=old(),catalog=await registry(original);
    const changes:Array<(n:Notice)=>void>=[n=>{n.note='个人笔记';},n=>{n.completed=true;},n=>{n.dismissed=true;},n=>{n.localDeadline='2026-10-20T12:00:00';},n=>{n.attachments=['personal-file'];},n=>{n.audienceOverride='all';},n=>{n.tasks[0].note='事项笔记';},n=>{n.tasks[0].completed=true;},n=>{n.tasks[0].dismissed=true;},n=>{n.tasks[0].localDeadline='2026-10-20T12:00:00';},n=>{n.tasks[0].steps[0].note='步骤笔记';},n=>{n.tasks[0].steps[0].completed=true;}];
    for(const change of changes){
      const modified=structuredClone(original);change(modified);
      const result=await mergeExamples([modified],[fresh()],catalog);
      expect(result).toEqual({notices:[modified],added:0,replaced:0});
    }
  });
  test('reminder-specific notes also protect the old built-in',async()=>{
    const original={...createNotice({...analysis,kind:'reminder',tasks:[],reminders:['记得锁门']},'宿舍安全提醒'),id:'example-reading-v21-1'};
    const catalog=await registry(original),modified=structuredClone(original);modified.reminders[0].note='已经检查';
    expect(await mergeExamples([modified],[fresh(modified.originalText)],catalog)).toEqual({notices:[modified],added:0,replaced:0});
  });
  test('a personal record protects its source without being overwritten by new examples',async()=>{
    const original=old(),personal={...fresh(),id:'my-personal-notice',note:'保留我自己的版本'};
    const result=await mergeExamples([original,personal],[fresh()],await registry(original));
    expect(result).toEqual({notices:[personal],added:0,replaced:1});
  });
  test('several fresh cards from one previously absent original all load together',async()=>{
    const pack=[fresh('合并原文','example-reading-v25-0'),fresh('合并原文','example-reading-v25-1')];
    const result=await mergeExamples([],pack,null);
    expect(result).toEqual({notices:pack,added:2,replaced:0});
    expect(await mergeExamples(pack,pack,null)).toEqual({notices:pack,added:0,replaced:0});
  });
  test('missing or malformed registries retain all existing records while unrelated new examples can load',async()=>{
    const original=old(),catalog=await registry(original),extra=fresh('其他原文','example-reading-v25-1');
    for(const invalid of [null,{},[...catalog,{id:'bad',fingerprint:'invalid'}],[{...catalog[0],originalText:'unexpected'}]]){
      expect(await mergeExamples([original],[fresh(),extra],invalid)).toEqual({notices:[original,extra],added:1,replaced:0});
    }
  });
  test('the published legacy registry contains only 13 built-in IDs and SHA256 fingerprints',async()=>{
    const catalog=JSON.parse(await readFile(new URL('../public/examples-legacy-2.4.json',import.meta.url),'utf8'));
    expect(catalog).toHaveLength(13);
    for(const item of catalog){expect(Object.keys(item).sort()).toEqual(['fingerprint','id']);expect(item.fingerprint).toMatch(/^[a-f0-9]{64}$/);}
  });
});
