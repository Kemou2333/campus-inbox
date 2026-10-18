import {describe,expect,test} from 'vitest';
import {readFile} from 'node:fs/promises';
import {auditPublicExamples} from '../scripts/verify-example-privacy.mjs';
import {exampleFingerprint,mergeExamples} from '../src/domain/examples';
import {createNotice,parseBackup} from '../src/domain/notice';
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
  test('a partial reviewed catalog still loads all distinct cards that share one original',async()=>{
    const incoming=parseBackup(JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8')));
    const legacy=JSON.parse(await readFile(new URL('../public/examples-legacy.json',import.meta.url),'utf8'));
    const families=[['example-reading-v26-12','example-reading-v213-1'],['example-reading-v211-0','example-reading-v212-1','example-reading-v213-0'],['example-reading-v211-2','example-reading-v212-2'],['example-reading-v25-8','example-reading-v25-9','example-reading-v25-10']];
    expect((await mergeExamples([],incoming,legacy)).notices).toHaveLength(24);
    for(const family of families){
      const siblings=family.map(id=>incoming.find(n=>n.id===id)!);
      expect(new Set(siblings.map(n=>n.originalText)).size).toBe(1);
      for(const current of siblings){
        const result=await mergeExamples([current],incoming,legacy);
        expect(result.notices.map(n=>n.id).sort()).toEqual(incoming.map(n=>n.id).sort());
        expect(result.notices).toHaveLength(24);
        expect(await mergeExamples(result.notices,incoming,legacy)).toEqual({notices:result.notices,added:0,replaced:0});
      }
    }
  });
  test('an edited or personal owner of a shared source still protects it from catalog duplicates',async()=>{
    const incoming=parseBackup(JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8')));
    const siblings=incoming.filter(n=>['example-reading-v211-0','example-reading-v212-1','example-reading-v213-0'].includes(n.id));
    for(const change of [(n:Notice)=>{n.note='个人笔记';},(n:Notice)=>{n.tasks[0].completed=true;},(n:Notice)=>{n.favorite=true;},(n:Notice)=>{n.attachments=['my-file'];},(n:Notice)=>{n.corrections={updatedAt:'2026-10-18T00:00:00Z',values:[{path:'summary',value:'我的修正'}]};},(n:Notice)=>{n.id='my-personal-source';}]){
      const protectedOwner=structuredClone(siblings[1]);change(protectedOwner);
      expect(await mergeExamples([protectedOwner],siblings,null)).toEqual({notices:[protectedOwner],added:0,replaced:0});
      expect(await mergeExamples([siblings[0],protectedOwner],siblings,null)).toEqual({notices:[siblings[0],protectedOwner],added:0,replaced:0});
    }
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
  test('the catalog retains earlier fingerprints and adds the 13 unredacted 2.10 built-ins without publishing their content',async()=>{
    const previous=JSON.parse(await readFile(new URL('../public/examples-legacy-2.4.json',import.meta.url),'utf8'));
    const current=JSON.parse(await readFile(new URL('../public/examples-legacy.json',import.meta.url),'utf8'));
    expect(current.slice(0,13)).toEqual(previous);expect(current).toHaveLength(52);
    expect(current[13].id).toBe('example-reading-v25-12');
    expect(current[13].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    for(const item of current){expect(Object.keys(item).sort()).toEqual(['fingerprint','id']);expect(item.fingerprint).toMatch(/^[a-f0-9]{64}$/);}
    expect(new Set(current.map((item:{id:string;fingerprint:string})=>item.id+':'+item.fingerprint)).size).toBe(current.length);
  });
  test('upgrading a 2.5 long-notice example preserves the other examples and remains idempotent',async()=>{
    const incoming=parseBackup(JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8')));
    const long=incoming.find(n=>n.id==='example-reading-v26-12')!;
    const original=fresh(long.originalText,'example-reading-v25-12'),others=incoming.filter(n=>n!==long);
    const current=[...others,original];
    const result=await mergeExamples(current,incoming,await registry(original));
    expect(result).toEqual({notices:[...others,long],added:1,replaced:1});
    expect(await mergeExamples(result.notices,incoming,await registry(original))).toEqual({notices:result.notices,added:0,replaced:0});
  });
  test('a modified 2.5 long-notice example protects its progress, attachments, notes and schedule from the upgrade',async()=>{
    const incoming=parseBackup(JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8')));
    const long=incoming.find(n=>n.id==='example-reading-v26-12')!;
    const original=fresh(long.originalText,'example-reading-v25-12'),catalog=await registry(original);
    const changes:Array<(n:Notice)=>void>=[n=>{n.note='自用备注';},n=>{n.completed=true;},n=>{n.localDeadline='2026-10-20T12:00:00';},n=>{n.attachments=['my-file'];},n=>{n.tasks[0].note='个人计划';},n=>{n.tasks[0].completed=true;},n=>{n.tasks[0].localDeadline='2026-10-20T12:00:00';},n=>{n.tasks[0].steps[0].note='我的步骤';},n=>{n.tasks[0].steps[0].completed=true;}];
    for(const change of changes){
      const modified=structuredClone(original);change(modified);
      expect(await mergeExamples([modified],[long],catalog)).toEqual({notices:[modified],added:0,replaced:0});
    }
    const personal={...original,id:'my-long-notice',note:'个人版本'};
    expect(await mergeExamples([personal],[long],catalog)).toEqual({notices:[personal],added:0,replaced:0});
  });
  test('public provenance distinguishes retained r5/r6 results from six selected low first responses',async()=>{
    const provenance=JSON.parse(await readFile(new URL('../public/examples-provenance.json',import.meta.url),'utf8'));
    const examples=parseBackup(JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8')));
    expect(provenance.thinking).toBe('mixed');expect(provenance.promptSha256).toBeUndefined();
    expect(provenance.results).toHaveLength(examples.length);
    expect(provenance.results.filter((r:{revision:string;thinking:string})=>r.revision==='r5'&&r.thinking==='disabled')).toHaveLength(12);
    const low=provenance.results.filter((r:{revision:string;reasoningEffort:string})=>r.revision==='r6'&&r.reasoningEffort==='low');
    expect(low).toHaveLength(1);expect(low[0]).toMatchObject({exampleId:'example-reading-v26-12',revision:'r6',thinking:'enabled',manualWordEdits:true,manualPrivacyEdits:true,manualContentCorrections:false});
    expect(provenance.results.map((r:{exampleId:string})=>r.exampleId)).toEqual(examples.map(n=>n.id));
    for(const result of provenance.results){expect(result.promptSha256).toMatch(/^[a-f0-9]{64}$/);expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/);expect(result.firstProviderContentSha256??result.firstServerRecordSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);expect(!!result.firstProviderContentSha256!==!!result.firstServerRecordSnapshotSha256).toBe(true);}
  });

  test('the six new redacted examples retain honest first-response and free-revalidation provenance',async()=>{
    const provenance=JSON.parse(await readFile(new URL('../public/examples-provenance.json',import.meta.url),'utf8'));
    const examples=parseBackup(JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8')));
    const fresh=examples.filter(n=>n.id.startsWith('example-reading-v211-'));
    expect(examples.length).toBeGreaterThanOrEqual(19);
    expect(examples).toHaveLength(provenance.privacyReview.reviewedNotices);expect(fresh).toHaveLength(6);
    expect(provenance.selectedNewFirstResponses).toBe(6);expect(provenance.paidCallsIn20261012Experiment).toBe(12);
    expect(provenance.experiment20261012).toMatchObject({realProviderCalls:12,selectedFirstResponses:6,providerCallsForPublicExamplePreparation:0,offlineSelectedResponseRevalidations:6,additionalOfflineDateParserReplays:1});
    expect(provenance.catalogDistinctOriginalProviderCalls).toBe(new Set(provenance.results.map((row:{firstProviderContentSha256?:string;firstServerRecordSnapshotSha256?:string})=>row.firstProviderContentSha256??row.firstServerRecordSnapshotSha256)).size);
    expect(provenance.sourceCount).toBe(new Set(provenance.results.map((row:{sourceSha256:string})=>row.sourceSha256)).size);
    const basketball=fresh.find(n=>n.id==='example-reading-v211-1')!;
    expect(basketball.deadlineSpec).toMatchObject({month:10,day:14,year:null,rawText:'10 月14日23:59'});expect(basketball.deadline).toBeNull();
    const math=fresh.find(n=>n.id==='example-reading-v211-0')!;
    expect(math.tasks[0].steps.map(step=>step.details.length)).toEqual([6,4]);
    const origin=provenance.results.find((row:{exampleId:string})=>row.exampleId===math.id);
    expect(origin).toMatchObject({case:'r14-math-01',originalFirstStatus:'failed',originalFailureCode:'AI_FORMAT_INVALID',additionalProviderCallsForRevalidation:0,manualContentCorrections:false});
    expect(origin.firstResponseValidation).toContain('same first response');
    expect(origin.knownLimitations.join(' ')).toContain('omits audio');
    const conflict=math.warnings.find(warning=>warning.includes('不一致'))!;
    expect(conflict).toContain('[平台入口 A]');expect(conflict).toContain('[平台入口 B]');
    for(const notice of fresh){expect(notice.originalText.startsWith('【脱敏示例】')).toBe(false);expect(notice.originalText).not.toContain('（化名）');}
  });
  test('privacy replacement retains edited old records without duplicating a differently redacted original',async()=>{
    const raw=old(),catalog=await registry(raw),redacted={...fresh('【脱敏示例】公开演示原文',raw.id),title:'脱敏示例'};
    expect(await mergeExamples([raw],[redacted],catalog)).toEqual({notices:[redacted],added:1,replaced:1});
    for(const change of [(n:Notice)=>{n.note='我的补充';},(n:Notice)=>{n.tasks[0].completed=true;},(n:Notice)=>{n.attachments=['my-file'];}]){
      const edited=structuredClone(raw);change(edited);
      expect(await mergeExamples([edited],[redacted],catalog)).toEqual({notices:[edited],added:0,replaced:0});
    }
  });

  test('multiple complete reviewed versions of one ID upgrade safely and the newest version is idempotent',async()=>{
    const raw=old(),redacted={...fresh('【脱敏示例】第一版脱敏原文',raw.id)},newer={...redacted,summary:'新版清楚的简介'};
    const catalog=[...await registry(raw),...await registry(redacted),...await registry(raw)];
    expect(await mergeExamples([raw],[newer],catalog)).toEqual({notices:[newer],added:1,replaced:1});
    expect(await mergeExamples([redacted],[newer],catalog)).toEqual({notices:[newer],added:1,replaced:1});
    const finalCatalog=[...catalog,...await registry(newer)];
    expect(await mergeExamples([newer],[newer],finalCatalog)).toEqual({notices:[newer],added:0,replaced:0});
    for(const baseline of [raw,redacted])for(const change of [(n:Notice)=>{n.note='我的笔记';},(n:Notice)=>{n.tasks[0].completed=true;},(n:Notice)=>{n.attachments=['my-file'];}]){
      const edited=structuredClone(baseline);change(edited);
      expect(await mergeExamples([edited],[newer],catalog)).toEqual({notices:[edited],added:0,replaced:0});
    }
  });
  test('every public example matches an explicitly disclosed manual privacy review',async()=>{
    const backup=JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8'));
    const provenance=JSON.parse(await readFile(new URL('../public/examples-provenance.json',import.meta.url),'utf8'));
    expect(auditPublicExamples(backup,provenance)).toEqual([]);
    expect(provenance.privacyReview.manualReview).toBe(true);
    expect(provenance.privacyReview.disclosure).toContain('脱敏');
    expect(provenance.generationMethod).toContain('manual privacy redaction only');
  });
  test('a changed reviewed example, private phone, group or form link blocks publishing without revealing the value',async()=>{
    const backup=JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8'));
    const provenance=JSON.parse(await readFile(new URL('../public/examples-provenance.json',import.meta.url),'utf8'));
    for(const [text,category] of [['联系'+['1','38','0'.repeat(8)].join(''),'phone'],['QQ群：'+'123'.repeat(3),'group_number'],['https://docs.example.invalid/private-form','specific_link']]){
      const changed=structuredClone(backup);changed.notices[0].tasks[0].details.push(text);
      const findings=auditPublicExamples(changed,provenance);
      expect(findings.some((entry:{category:string})=>entry.category===category)).toBe(true);
      expect(findings.some((entry:{category:string})=>entry.category==='reviewed_content_changed')).toBe(true);
      expect(JSON.stringify(findings)).not.toContain(text);
    }
    const unreviewed=structuredClone(provenance);delete unreviewed.privacyReview;
    expect(auditPublicExamples(backup,unreviewed).some((entry:{category:string})=>entry.category==='missing_manual_review')).toBe(true);
  });

});
