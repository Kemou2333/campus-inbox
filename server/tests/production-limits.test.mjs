import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createService} from '../service.mjs';
import {createAuthService} from '../auth.mjs';
import {APK_DOWNLOAD_LIMITS} from '../apk-downloads.mjs';
import {limitStandards} from '../admin.mjs';
const source=await readFile(new URL('../index.mjs',import.meta.url),'utf8');
const fields=['accountFiveHourLimit','accountThreeDayLimit','ipFiveHourLimit','questionAccountFiveHourLimit','questionAccountThreeDayLimit','questionIPFiveHourLimit','questionDailyLimit'];
const configured=Object.fromEntries(fields.map(name=>{const match=source.match(new RegExp('\\b'+name+':(\\d+)'));assert(match,name);return [name,Number(match[1])];}));
configured.dailyLimit=Number(source.match(/Number\(env\.DAILY_REQUEST_LIMIT\)\|\|(\d+)/)?.[1]);
const origin='https://app.example.test',secret='only-offline-production-limit-test-secret';
const production={...configured,apiKey:'not-a-real-key',accessToken:secret,requireAccess:false,requireIdentity:true,thinkingMode:'low',captchaMode:'image',dailyBudgetRmb:3,allowedOrigins:[origin],oneNoticePerSource:true};
const model=()=>({schemaVersion:4,notices:[{schemaVersion:4,sourceId:1,kind:'information',title:'课程材料提交',summary:'本次课程安排提交相关材料。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:[]}]});
async function fixture(){
 let now=Date.parse('2026-10-27T01:00:00Z'),calls=0;const records=new Map();
 const questions={findRequest:(_a,id)=>records.get(id),accept:(_a,id,hash)=>records.set(id,{hash,status:'running',response:null}),complete:(_a,id,response)=>{records.get(id).response=response;records.get(id).status='finished';}};
 const ai=await createService(production,{now:()=>now,accountForToken:key=>({id:key}),questions,modelFetch:async(_url,options)=>{calls++;const body=JSON.parse(options.body),question=body.messages[0].content.includes('原文问答助手');return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(question?{answer:'可以参加。',evidence:['男女同学均可参加。']}:model())}}],usage:{prompt_tokens:1,completion_tokens:1}});}});
 const request=async(kind,n,key='a'.repeat(43),ip='same-network')=>{
  const body=kind==='question'?{requestId:randomUUID(),sourceText:'本活动男女同学均可参加。',question:'是否可以参加？问题编号'+n}:{sources:[{text:'课程通知：请提交本次材料，编号'+n+'。'}]};
  const response=await ai(new Request('https://api.example.test/'+(kind==='question'?'notice-question':'analyze'),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body)}),ip);
  return {status:response.status,body:await response.json()};
 };
 return {ai,request,advance:ms=>{now+=ms;},calls:()=>calls};
}
test('production settings retain the approved new thresholds and unchanged shared safety budgets',async()=>{
 assert.deepEqual(configured,{accountFiveHourLimit:10,accountThreeDayLimit:30,ipFiveHourLimit:10,questionAccountFiveHourLimit:10,questionAccountThreeDayLimit:15,questionIPFiveHourLimit:10,questionDailyLimit:80,dailyLimit:100});
 const auth=await createAuthService({stateFile:':memory:',signingSecret:secret},{sendCode:async()=>{throw Error('no mail');}}),f=await fixture();
 try{const policy=limitStandards({ai:f.ai,auth});assert.equal(policy.groups.flatMap(x=>x.rows).length,86);assert.equal(policy.effective.ai.dailyBudgetRmb,3);assert.equal(policy.effective.ai.imageRefreshMs,10000);assert.equal(policy.effective.auth.imageRefreshMs,10000);assert.equal(policy.effective.auth.email.resendMs,60000);assert.equal(policy.effective.download.captchaRefreshMs,10000);assert.equal(APK_DOWNLOAD_LIMITS.dailyBytes,500000000);assert.equal(APK_DOWNLOAD_LIMITS.ipDownloadsPerHour,8);assert.equal(APK_DOWNLOAD_LIMITS.ipConcurrent,1);assert.equal(APK_DOWNLOAD_LIMITS.globalConcurrent,8);assert.equal(APK_DOWNLOAD_LIMITS.bytesPerSecond,2000000);assert.equal(APK_DOWNLOAD_LIMITS.captchaLifetimeMs,300000);assert.equal(f.calls(),0);}finally{auth.close();await f.ai.drain();}
});
test('production organizing admits ten per five hours and thirty per72h without clearing counters',async()=>{
 const f=await fixture();
 for(let batch=0;batch<3;batch++){
  for(let i=0;i<10;i++){const r=await f.request('organize',batch*10+i);assert.equal(r.status,200,JSON.stringify(r.body));f.advance(180001);}
  if(batch===0){const r=await f.request('organize','blocked-11');assert.equal(r.status,429);assert.equal(r.body.code,'ACCOUNT_FIVE_HOUR_LIMIT');assert.equal(f.calls(),10);}
  f.advance(5*3600000+1);
 }
 const r=await f.request('organize','blocked-31');assert.equal(r.status,429);assert.equal(r.body.code,'ACCOUNT_THREE_DAY_LIMIT');assert.equal(f.calls(),30);
});
test('different accounts still share the production ten perIP five-hour limit',async()=>{
 const f=await fixture();for(let i=0;i<10;i++){const key=String(i).padStart(43,'a');const r=await f.request('organize',i,key);assert.equal(r.status,200);f.advance(180001);}
 const r=await f.request('organize','blocked-other-account','z'.repeat(43));assert.equal(r.status,429);assert.equal(r.body.code,'IP_FIVE_HOUR_LIMIT');assert.equal(f.calls(),10);
});
test('production question allowance permits ten then only five more within72h',async()=>{
 const f=await fixture();for(let i=0;i<10;i++){const r=await f.request('question',i);assert.equal(r.status,200,JSON.stringify(r.body));f.advance(180001);}
 const early=await f.request('question','blocked-11');assert.equal(early.status,429);assert.equal(early.body.code,'ACCOUNT_FIVE_HOUR_LIMIT');
 f.advance(5*3600000+1);for(let i=10;i<15;i++){const r=await f.request('question',i);assert.equal(r.status,200,JSON.stringify(r.body));f.advance(180001);}
 const r=await f.request('question','blocked-16');assert.equal(r.status,429);assert.equal(r.body.code,'ACCOUNT_THREE_DAY_LIMIT');assert.equal(f.calls(),15);
});
test('independent production site pools stop at100 organize and80 question with no provider call on rejection',async()=>{
 const f=await fixture();for(let i=0;i<100;i++){const r=await f.request('organize',i,String(i).padStart(43,'a'),'network-'+i);assert.equal(r.status,200,JSON.stringify(r.body));}
 const organize=await f.request('organize','blocked-101','z'.repeat(43),'new-org-network');assert.equal(organize.status,429);assert.equal(organize.body.code,'DAILY_LIMIT');assert.equal(f.calls(),100);
 for(let i=0;i<80;i++){const r=await f.request('question',i,String(i).padStart(43,'b'),'question-network-'+i);assert.equal(r.status,200,JSON.stringify(r.body));}
 const question=await f.request('question','blocked-81','q'.repeat(43),'new-question-network');assert.equal(question.status,429);assert.equal(question.body.code,'QUESTION_DAILY_LIMIT');assert.equal(f.calls(),180);assert.equal(f.ai.adminSummary().dailyBudgetRmb,3);assert(f.ai.adminSummary().estimatedCostRmb<0.1);
});
