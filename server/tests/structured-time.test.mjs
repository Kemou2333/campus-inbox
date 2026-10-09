import test from 'node:test';
import assert from 'node:assert/strict';
import '../contracts/time.js';
import '../contracts/data.js';
const T=globalThis.CampusTime,D=globalThis.CampusData;
import {analyze,groundDates} from '../analyze.mjs';
const basic=(rawText='')=>({schemaVersion:4,kind:'task',title:'登记',summary:'按通知登记。',deadline:null,deadlineText:rawText,tasks:[{text:'提交登记表',assignee:null,scope:'all',condition:'',details:[],steps:[],time:null,timeText:rawText,location:null}],timeline:[],materials:[],warnings:[],reminders:[]});

test('complete timestamp preserves explicit parts; a missing year stays null',()=>{
 assert.deepEqual(T.fromText('2026年10月7日17:00前'),{type:'date_time',year:2026,month:10,day:7,hour:17,minute:0,rawText:'2026年10月7日17:00前'});
 const partial=T.fromText('10月7号17:00前');assert.equal(partial.type,'partial');assert.equal(partial.year,null);assert.equal(partial.month,10);assert.equal(partial.hour,17);assert.equal(T.toISO(partial),null);assert.equal(T.toDate(partial),null);
});
test('date-only is an all-day candidate, not an invented 23:59 cutoff',()=>{
 const date=T.fromText('2026年10月15日前');assert.equal(date.type,'date');assert.equal(date.hour,null);assert.equal(date.minute,null);assert.equal(T.toDate(date),'2026-10-15');assert.equal(T.toISO(date),null);
});
test('relative dates never use creation time or system time as publication time',()=>{
 const relative=T.fromText('明天17:00前');assert.equal(relative.type,'relative');assert.equal(relative.year,null);assert.equal(relative.month,null);assert.equal(relative.day,null);assert.equal(relative.hour,17);assert.equal(T.toISO(relative),null);
 for(const text of ['今天内','明天中午前','周五进行','本周三'])assert.equal(T.fromText(text).type,'relative');
});
test('cohort and school years do not provide a calendar year',()=>{
 assert.equal(T.fromText('2026级新生，10月15日前').year,null);
 assert.equal(T.fromText('2026—2027学年第一学期').type,'unknown');
 assert.equal(T.fromText('2026级新生').type,'unknown');
});
test('ranges and recurrence preserve text without choosing a single timestamp',()=>{
 for(const rawText of ['2026年10月7日至10月9日','2026年10月7日至9日','2026年10月7日09:00—11:00','每周五17:00','10月上旬至中旬','10月7-8日','10-11月','2026-2027年','17至18点']){const s=T.fromText(rawText);assert.equal(s.type,'unknown',rawText);assert.equal(s.rawText,rawText);assert.equal(T.toISO(s),null);}
 assert.equal(T.toISO(T.fromText('截止至2026年10月7日17:00')),'2026-10-07T17:00:00');
});
test('24:00 rolls forward only with a complete explicit date',()=>{
 const s=T.fromText('2026年10月20日24:00');assert.equal(s.hour,24);assert.equal(s.day,20);assert.equal(T.toISO(s),'2026-10-21T00:00:00');assert.equal(T.toDate(s),'2026-10-21');
 assert.equal(T.toISO(T.fromText('2026年12月31日24:00')),'2027-01-01T00:00:00');
 const partial=T.fromText('10月20日24:00');assert.equal(partial.year,null);assert.equal(partial.day,20);assert.equal(T.toISO(partial),null);
});
test('invalid dates and invalid clocks stay unconfirmed',()=>{
 for(const text of ['2026年2月29日17:00','2月30日17:00','2026年13月7日17:00','2026年10月7日24:01','2026年10月7日25:00','2026年10月7日17:61'])assert.equal(T.fromText(text).type,'unknown',text);
 assert.equal(T.toISO(T.fromText('2028年2月29日17:00')),'2028-02-29T17:00:00');assert.equal(T.fromText('2月29日').type,'partial');
});
test('explicit Chinese numbers and whole-hour notation are supported',()=>{
 assert.equal(T.toISO(T.fromText('2026年十月二十日17点')),'2026-10-20T17:00:00');
 assert.equal(T.toISO(T.fromText('2026年10月7日下午3点')),'2026-10-07T15:00:00');
 assert.equal(T.fromText('2026年10月7日晚上12点').type,'unknown');
});
test('normalization rejects extra fields, invented year, mismatched raw text and confidence',()=>{
 const s=T.fromText('10月7日17:00前');
 assert.throws(()=>T.normalize({...s,year:2026,type:'date_time'},s.rawText),/未确认/);
 assert.throws(()=>T.normalize({...s,confidence:0.9},s.rawText),/多余/);
 assert.throws(()=>T.normalize({...s,rawText:'10月8日17:00前'},s.rawText),/不一致/);
 assert.deepEqual(T.normalize(s,s.rawText),s);
});
test('source grounding does not borrow another date or another source',()=>{
 const s=T.fromText('10月7日17:00前'),source='2026级同学须在10月7号17:00前登记。';
 const grounded=T.ground({...s,type:'date_time',year:2026},s.rawText,source);assert.equal(grounded.type,'partial');assert.equal(grounded.year,null);
 assert.equal(T.ground(T.fromText('2026年10月7日17:00前'),'2026年10月7日17:00前',source).type,'unknown');
 assert.equal(T.ground(s,s.rawText,'2026年10月8日17:00前').type,'unknown');
});
test('v4 results and backups without optional specs keep their previous field shape',()=>{
 const n=basic('10月7日17:00前'),before=D.analysis(n,true),created=D.create(n,'请在10月7日17:00前提交登记表。'),restored=D.backup(D.exportBackup([created]))[0];
 assert(!Object.hasOwn(before,'deadlineSpec'));assert(!Object.hasOwn(before.tasks[0],'timeSpec'));assert(!Object.hasOwn(restored,'deadlineSpec'));assert(!Object.hasOwn(restored.tasks[0],'timeSpec'));assert.deepEqual(restored,created);
});
test('optional structured time survives creation and backup, and partial dates do not become urgent',()=>{
 const text='10月7日17:00前',n=basic(text);n.deadlineSpec=T.fromText(text);n.tasks[0].timeSpec=T.fromText(text);n.timeline=[{label:'办理截止',time:null,timeText:text,location:null,timeSpec:T.fromText(text)}];
 const created=D.create(n,'请在10月7日17:00前提交登记表。'),restored=D.backup(D.exportBackup([created]))[0];assert.deepEqual(restored.deadlineSpec,n.deadlineSpec);assert.deepEqual(restored.tasks[0].timeSpec,n.tasks[0].timeSpec);assert.deepEqual(restored.timeline[0].timeSpec,n.timeline[0].timeSpec);assert.equal(D.effectiveDeadline(restored),null);assert.equal(D.priority(restored).level,'unknown');
});
test('backend checks the exact matching time field, without borrowing a cohort year',()=>{
 const text='10月7日17:00前',n=basic(text),s={...T.fromText(text),type:'date_time',year:2026};n.deadlineSpec=s;n.tasks[0].timeSpec=s;
 const grounded=groundDates({schemaVersion:4,notices:[n]},'2026级同学请在10月7号17:00前提交登记表。');
 const parsed=D.batch(grounded,true).notices[0];assert.equal(parsed.deadlineSpec.year,null);assert.equal(parsed.tasks[0].timeSpec.year,null);assert.equal(parsed.deadline,null);
 const other=groundDates({schemaVersion:4,notices:[n]},'请在2026年10月8日17:00前提交登记表。');assert.equal(D.batch(other,true).notices[0].deadlineSpec.type,'unknown');
});
test('one model response can carry date-only specs without an invented timestamp or a retry',async()=>{
 const text='2026年10月15日前',n=basic(text);n.deadlineSpec=T.fromText(text);n.tasks[0].timeSpec=T.fromText(text);let calls=0;
 const output=await analyze({sources:[{text:'请在2026年10月15日前提交登记表。'}]},{apiKey:'test-only-key'},async(_url,options)=>{calls++;const payload=JSON.parse(options.body);assert.equal(payload.thinking.type,'disabled');assert.equal(payload.reasoning_effort,undefined);assert(payload.messages[0].content.includes('deadlineSpec'));return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:4,notices:[n]})}}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200});});
 assert.equal(calls,1);assert.equal(output.result.notices[0].deadline,null);assert.equal(output.result.notices[0].deadlineSpec.type,'date');assert.equal(output.result.notices[0].deadlineSpec.hour,null);
});


test('an empty partial label cannot discard a paid result or invent a date',()=>{
 const unknown={type:'partial',year:null,month:null,day:null,hour:null,minute:null,rawText:'课程结束前'};
 assert.equal(T.ground(unknown,'课程结束前','请在课程结束前完成评教').type,'unknown');
 const month={...unknown,rawText:'十月中旬'};
 const grounded=T.ground(month,'十月中旬','预计十月中旬完成入账');
 assert.equal(grounded.type,'partial');assert.equal(grounded.month,10);assert.equal(grounded.day,null);assert.equal(T.toISO(grounded),null);
 assert.throws(()=>T.ground({...unknown,extra:'not allowed'},'课程结束前','课程结束前'));
 assert.throws(()=>T.ground({...unknown,day:35},'课程结束前','课程结束前'));
});

test('month ranges and whole Chinese link delimiters do not become exact dates',()=>{
 for(const text of ['2026年5月-8月','2026年5月—8月','5月至8月'])assert.equal(T.fromText(text).type,'unknown',text);
 const n=basic('2026年6月1日15:00');const result=groundDates({schemaVersion:4,notices:[n]},'报名截止时间：2026年6月1日15:00');
 assert.equal(result.notices[0].deadlineSpec.type,'date_time');assert.equal(result.notices[0].tasks[0].timeSpec.hour,15);
});
