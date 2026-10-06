import test from 'node:test';
import assert from 'node:assert/strict';
import {modelInput,analyze} from '../analyze.mjs';
import {createService} from '../service.mjs';
const token='test-access-code-at-least-twenty-characters',origin='https://kemou2333.github.io';
const config={apiKey:'test-key',accessToken:token,allowedOrigins:[origin]};
const item=title=>({schemaVersion:4,kind:'information',title,summary:'原文信息。',deadline:null,deadlineText:'',timeline:[],tasks:[],materials:[],warnings:[],reminders:['原文信息']});
const result=n=>({schemaVersion:4,notices:Array.from({length:n},(_,i)=>item('通知'+(i+1)))});
const request=body=>new Request('http://local/analyze',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
const envelope=n=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result(n))}}],usage:{prompt_tokens:20,completion_tokens:30}});
test('explicit modules preserve literal separator lines within each original',()=>{
 const sources=[{text:'第一条\n---\n正文继续'},{text:'第二条'}];
 assert.deepEqual(modelInput({sources}),{sources:sources.map((s,i)=>({sourceId:i+1,text:s.text}))});
 assert.equal(modelInput(sources.map(s=>s.text).join('\n---\n')).sources.length,3);
});
test('module input is bounded and excludes attachments and local identifiers',()=>{
 for(const body of [{sources:[]},{sources:Array.from({length:21},()=>({text:'原文'}))},{sources:[{text:' '.repeat(2)}]},{sources:[{text:'a',id:'local-id'}]},{sources:[{text:'a',attachments:['file']}]},{sources:[{text:'a'}],notice:'a'},{sources:[{text:'a'.repeat(2001)},{text:'b'.repeat(2000)}]}])assert.throws(()=>modelInput(body));
 assert.equal(modelInput({sources:[{text:'a'.repeat(2000)},{text:'b'.repeat(2000)}]}).sources.length,2);
});
test('one module batch makes one upstream call without duplicating originals',async()=>{
 const sources=[{text:'甲\n---\n继续'},{text:'乙'}];let calls=0;
 const r=await analyze({sources},config,async(_,opts)=>{calls++;const user=JSON.parse(JSON.parse(opts.body).messages[1].content);assert.deepEqual(user,{sources:sources.map((s,i)=>({sourceId:i+1,text:s.text}))});assert.equal(Object.hasOwn(user,'notice'),false);return envelope(2);});
 assert.equal(r.result.notices.length,2);assert.equal(calls,1);
});
test('module preflight rejects invalid body before paid request and daily quota',async()=>{
 let calls=0;const handler=await createService({...config,dailyLimit:1},{modelFetch:async()=>{calls++;return envelope(1);}});
 for(const [i,body]of [{sources:[]},{sources:[{text:'x',id:'secret'}]},{sources:[{text:'x'.repeat(4001)}]},{sources:Array.from({length:21},()=>({text:'x'}))}].entries())assert.equal((await handler(request(body),'invalid-'+i)).status,400);
 assert.equal(calls,0);assert.equal((await handler(request({notice:'合法原文'}),'valid')).status,200);assert.equal(calls,1);
});
test('cache distinguishes explicit source boundaries and honors source order',async()=>{
 let calls=0;const handler=await createService(config,{modelFetch:async(_,opts)=>{calls++;const user=JSON.parse(JSON.parse(opts.body).messages[1].content);return envelope(user.sources?.length||1);}});
 const sources=[{text:'甲\n---\n乙'},{text:'丙'}];
 assert.equal((await handler(request({sources}),'one')).status,200);
 assert.equal((await handler(request({sources}),'two')).status,200);assert.equal(calls,1);
 assert.equal((await handler(request({notice:sources.map(s=>s.text).join('\n---\n')}),'three')).status,200);assert.equal(calls,2);
 assert.equal((await handler(request({sources:[...sources].reverse()}),'four')).status,200);assert.equal(calls,3);
});
test('module timestamps stay grounded in their own source',async()=>{
 const sources=[{text:'第一条：2026年10月20日12:00截止'},{text:'第二条：10月20日12:00截止'}];const output=result(2);
 for(const n of output.notices){n.deadline='2026-10-20T12:00:00';n.deadlineText='2026年10月20日12:00';}
 const r=await analyze({sources},config,async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}));
 assert.equal(r.result.notices[0].deadline,'2026-10-20T12:00:00');assert.equal(r.result.notices[1].deadline,null);
});
