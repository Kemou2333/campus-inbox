import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,modelPayload,ServiceError} from '../analyze.mjs';
import {evidencePaths,parseSourceRefs,segmentSource} from '../contracts/source-evidence.js';

// Deterministic mock envelopes only. These tests make no provider/network requests.
const source='课程学习通知。\n普通班同学须提交视频、音频或文字素材。\n2026年10月20日18:00前提交。\n素材须为本人原创。';
const config={apiKey:'synthetic-unused-provider-key',requireSourceEvidence:true};
function analysis(){
 const n={sourceId:1,schemaVersion:4,kind:'task',title:'课程学习',summary:'普通班提交原创学习素材。',deadline:'2026-10-20T18:00:00',deadlineText:'2026年10月20日18:00',timeline:[],tasks:[{text:'提交学习素材',assignee:'普通班同学',scope:'conditional',condition:'普通班同学',details:['可任选**视频、音频或文字**。'],steps:[{text:'自行制作素材',details:['素材须为本人原创。']}],time:null,timeText:'',location:null}],materials:[],warnings:['素材须为本人原创。'],reminders:[],reminderTitles:[]};
 n.sourceRefs=Object.fromEntries(evidencePaths(n).map(path=>[path,path==='deadlineText'?[3]:path==='title'?[1]:path==='warnings.0'||path.endsWith('steps.0.details.0')?[4]:[2]]));return n;
}
const envelope=n=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:4,notices:[n]})}}],usage:{prompt_tokens:21,completion_tokens:34,completion_tokens_details:{reasoning_tokens:9}}});
const rejected=error=>error instanceof ServiceError&&error.status===502&&error.failureCode==='SCHEMA_INVALID'&&error.usageAvailable&&error.usage.input===21;

test('source segments are exact stable slices and never split an emoji UTF16 pair at the long boundary',()=>{
 const original='  '+ '甲'.repeat(319)+'😀'+ '乙'.repeat(321)+'。\r\n带空格\t的说明。  ',trimmed=original.trim(),segments=segmentSource(original);
 assert.deepEqual(segmentSource(trimmed),segments);assert.equal(segments[0].text.endsWith('😀'),true);
 for(const [i,segment] of segments.entries()){assert.equal(segment.index,i+1);assert.equal(trimmed.slice(segment.start,segment.end),segment.text);assert.equal(segment.text.isWellFormed(),true);}
 assert.equal(segments.map(s=>s.text).join('').includes('😀'),true);
});
test('provider receives only numbered source segments, never a duplicate complete text or device fields',()=>{
 const payload=modelPayload({sources:[{text:source},{text:'宿舍通知😀。'}]},{thinkingMode:'low'}),body=JSON.parse(payload.messages[1].content);
 assert.deepEqual(Object.keys(body),['sources']);assert.deepEqual(body.sources.map(s=>Object.keys(s)),[['sourceId','segments'],['sourceId','segments']]);
 for(const [i,entry] of body.sources.entries()){assert.equal(entry.sourceId,i+1);assert.deepEqual(entry.segments,segmentSource(i? '宿舍通知😀。':source).map(s=>({id:s.index,text:s.text})));}
 assert.equal(payload.messages[0].content.includes('sourceRefs'),true);assert.equal(payload.reasoning_effort,'low');
});
test('valid path coverage survives strict source analysis and strips only transport sourceId',async()=>{
 const n=analysis(),before=structuredClone(n);let calls=0;
 const output=await analyze({sources:[{text:source}]},config,async()=>{calls++;return envelope(n);});
 assert.equal(calls,1);assert.deepEqual(n,before);assert.deepEqual(output.result.notices[0].sourceRefs,n.sourceRefs);assert.deepEqual(output.result.notices[0].reminderTitles,[]);
 assert.equal(Object.hasOwn(output.result.notices[0],'sourceId'),false);assert.equal(output.result.notices[0].deadline,'2026-10-20T18:00:00');
 assert.equal(evidencePaths(output.result.notices[0]).every(path=>Object.hasOwn(n.sourceRefs,path)),true);
 assert.equal(evidencePaths(n).some(path=>path.endsWith('.scope')||path==='kind'||path==='deadline'),false);
});
test('task group citations expand for each sentence and specific citations override regardless of object order',async()=>{
 const n=analysis(),refs={title:[1],summary:[2],deadlineText:[3],'warnings.0':[4],'tasks.0.steps.0.details.0':[4],'tasks.0':[2]};
 n.sourceRefs=refs;
 const result=(await analyze(source,config,async()=>envelope(n))).result.notices[0];
 for(const path of evidencePaths(n).filter(path=>path.startsWith('tasks.0.')))assert.deepEqual(result.sourceRefs[path],path.endsWith('steps.0.details.0')?[4]:[2]);
 assert.equal(Object.hasOwn(result.sourceRefs,'tasks.0'),false);assert.deepEqual(n.sourceRefs,refs);
 const reversed=Object.fromEntries(Object.entries(refs).reverse());assert.deepEqual(parseSourceRefs(reversed,n,source),parseSourceRefs(refs,n,source));
});
test('timeline groups remain within actual items and expansion cannot exceed the storage bound',()=>{
 const n=analysis();n.timeline=[{label:'截止',timeText:'10月20日',location:'教室'}];
 assert.deepEqual(parseSourceRefs({'timeline.0':[3]},n,source),{'timeline.0.label':[3],'timeline.0.timeText':[3],'timeline.0.location':[3]});
 for(const refs of [{'tasks.01':[2]},{'tasks.1':[2]},{'tasks.0':[5]},{'timeline.1':[3]},{'tasks.0':[1,2,3,4,5,6,7,8,9]}])assert.throws(()=>parseSourceRefs(refs,n,source));
 const large={...n,tasks:Array.from({length:100},()=>n.tasks[0])};
 assert.throws(()=>parseSourceRefs(Object.fromEntries(large.tasks.map((_,i)=>[`tasks.${i}`,[2]])),large,source));
});
test('step citations override task citations and a sentence overrides both without inventing nonexistent steps',()=>{
 const n=analysis(),refs={'tasks.0.steps.0.details.0':[4],'tasks.0.steps.0':[3],'tasks.0':[2]};
 const parsed=parseSourceRefs(refs,n,source);
 assert.deepEqual(parsed['tasks.0.text'],[2]);assert.deepEqual(parsed['tasks.0.steps.0.text'],[3]);assert.deepEqual(parsed['tasks.0.steps.0.details.0'],[4]);
 assert.deepEqual(parsed,parseSourceRefs(Object.fromEntries(Object.entries(refs).reverse()),n,source));
 for(const key of ['tasks.0.steps.1','tasks.0.steps.00','tasks.1.steps.0','tasks.0.steps.__proto__'])assert.throws(()=>parseSourceRefs({[key]:[1]},n,source));
});
test('strict mode rejects every missing prose mapping after one mock call, including nested step details',async()=>{
 for(const path of evidencePaths(analysis())){
  const n=analysis();delete n.sourceRefs[path];let calls=0;
  await assert.rejects(analyze(source,config,async()=>{calls++;return envelope(n);}),rejected);assert.equal(calls,1);
 }
});
test('legacy model envelopes are accepted only when the production evidence requirement is disabled',async()=>{
 const legacy=analysis();delete legacy.sourceRefs;delete legacy.reminderTitles;
 const accepted=await analyze(source,{...config,requireSourceEvidence:false},async()=>envelope(legacy));assert.equal(accepted.result.notices.length,1);assert.equal(accepted.result.notices[0].sourceRefs,undefined);
 await assert.rejects(analyze(source,config,async()=>envelope(legacy)),rejected);
});
test('unknown field/prototype paths, empty refs, string/float/negative IDs and repeated IDs are invalid',()=>{
 const n=analysis();
 for(const refs of [{'tasks.99.text':[1]},{'tasks.0.id':[1]},{'kind':[1]},{'tasks.0.scope':[1]},{'title':[]},{'title':['1']},{'title':[0]},{'title':[-1]},{'title':[1.5]},{'title':[1,1]},{'title':[1,2,3,4,5,6,7,8,9]},JSON.parse('{"__proto__.polluted":[1]}')])assert.throws(()=>parseSourceRefs(refs,n,source));
});
test('a paragraph number beyond the actual mapped original is rejected even if another source has that paragraph',async()=>{
 const first={...analysis(),sourceId:1},second={...analysis(),sourceId:2};
 const sources=[{text:source},{text:'只有一段的校园信息。'}];
 await assert.rejects(analyze({sources},config,async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:4,notices:[first,second]})}}],usage:{prompt_tokens:21,completion_tokens:34}})),rejected);
 const bad=analysis();bad.sourceRefs.title=[5];await assert.rejects(analyze(source,config,async()=>envelope(bad)),rejected);
});
test('mapping cardinality is bounded, not an unrestricted model-controlled object',()=>{
 const n=analysis();assert.throws(()=>parseSourceRefs(Object.fromEntries(Array.from({length:181},(_,i)=>[`materials.${i}`,[1]])),{...n,materials:Array(181).fill('材料')},source));
});
test('reminder topic titles and body each require their own source map; a topic name is not a quote',async()=>{
 const n={sourceId:1,schemaVersion:4,kind:'information',title:'课程信息',summary:'留意课程学习要求。',deadline:null,deadlineText:'',timeline:[],tasks:[],materials:[],warnings:[],reminders:['需完成**20%**的视频观看。'],reminderTitles:['线上学习'],sourceRefs:{title:[1],summary:[1],'reminders.0':[1],'reminderTitles.0':[1]}};
 const output=await analyze('线上学习需完成不少于20%的视频观看。',config,async()=>envelope(n));assert.equal(output.result.notices[0].reminderTitles[0],'线上学习');
 const missing=structuredClone(n);delete missing.sourceRefs['reminderTitles.0'];await assert.rejects(analyze(source,config,async()=>envelope(missing)),rejected);
 const absent=structuredClone(n);delete absent.reminderTitles;delete absent.sourceRefs['reminderTitles.0'];await assert.rejects(analyze(source,config,async()=>envelope(absent)),rejected);
});
