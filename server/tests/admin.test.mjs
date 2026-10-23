import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createAuthService} from '../auth.mjs';
import {createSyncService} from '../sync.mjs';
import {createAdminService,backupSummary} from '../admin.mjs';
import {createService} from '../service.mjs';

const origin='https://app.example.test',secret='admin-test-only-secret-at-least-twenty';
const model={schemaVersion:4,notices:[{sourceId:1,schemaVersion:4,kind:'information',title:'独立测试响应',summary:'仅本地检查。',deadline:null,deadlineText:'',timeline:[],tasks:[],materials:[],warnings:[],reminders:[]}]};
async function setup(config={}){
  let time=Date.parse('2026-10-14T02:00:00Z'),auth;
  const folder=await mkdtemp(join(tmpdir(),'campus-admin-')),syncFile=join(folder,'sync.sqlite');
  const sync=await createSyncService({signingSecret:secret,allowedOrigins:[origin],stateFile:syncFile},{now:()=>time,authenticate:key=>auth.getIdentity(key)});
  auth=await createAuthService({signingSecret:secret,allowedOrigins:[origin],stateFile:join(folder,'auth.sqlite'),imageCaptcha:false},{provision:sync.provision,now:()=>time});
  const sessions=[];
  for(const username of ['kemou','other-student','third-student']){
    const response=await auth.handle(new Request('https://api.example.test/auth/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username,password:'test-only-password',invite:auth.issueInvites(1)[0]})}),'test-campus');
    assert.equal(response.status,200);sessions.push(await response.json());
  }
  const ai=await createService({apiKey:'fake-provider-key',accessToken:secret,requireAccess:false,requireIdentity:true,allowedOrigins:[origin],stateFile:join(folder,'usage.json')},{now:()=>time,accountForToken:key=>auth.getIdentity(key)?sync.accountForKey(key):null,jobs:sync.jobs,modelFetch:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(model)}}],usage:{prompt_tokens:20,completion_tokens:30,completion_tokens_details:{reasoning_tokens:10}}})});
  const admin=createAdminService({usernames:['ＫＥＭＯＵ'],allowedOrigins:[origin],...config},{auth,sync,ai,now:()=>time});
  const request=async(path='/admin/summary',session=sessions[0],requestOrigin=origin,method='POST',body={})=>{
    const response=await admin(new Request('https://api.example.test'+path,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.key}:{})},...(['GET','HEAD'].includes(method)?{}:{body:JSON.stringify(body)})}));
    return {status:response.status,headers:response.headers,body:response.headers.get('Content-Type')?.startsWith('text/html')?await response.text():response.status===204?null:await response.json()};
  };
  const job=(session=sessions[1],consent=false,text='private-original-sentinel')=>{
    const account=sync.accountForKey(session.key),accepted=sync.jobs.accept(account,randomUUID(),'input-'+randomUUID(),[{text}],consent);sync.jobs.start(account,accepted.id);sync.jobs.stage(account,accepted.id,{notices:model.notices.map(({sourceId,...notice})=>notice),sourceIndexes:[0]});sync.jobs.complete(account,accepted.id);return accepted;
  };
  return {auth,sync,ai,admin,request,job,sessions,syncFile,authFile:join(folder,'auth.sqlite'),advance:ms=>{time+=ms;},close:async()=>{await ai.drain();auth.close();sync.close();await rm(folder,{recursive:true,force:true});}};
}
test('only the configured already-existing administrator can read metadata; public/default-disabled routes expose none',async t=>{
  const s=await setup();t.after(s.close);s.job();
  assert.equal((await s.request('/admin/summary',null)).status,401);
  assert.equal((await s.request('/admin/summary',s.sessions[1])).status,403);
  assert.equal((await s.request('/admin/jobs',s.sessions[2])).status,403);
  assert.equal((await s.request('/admin/summary',s.sessions[0],'https://attacker.test')).status,403);
  const valid=await s.request();assert.equal(valid.status,200);assert.equal(valid.body.accounts,3);assert.equal(valid.body.jobs,1);assert.equal(valid.body.readOnly,true);
  const disabled=createAdminService({usernames:[],allowedOrigins:[origin]},{auth:s.auth,sync:s.sync,ai:s.ai});
  assert.equal((await disabled(new Request('https://api.example.test/admin'))).status,404);
});
test('administrator lists omit original text, result, email, session and password material',async t=>{
  const s=await setup();t.after(s.close);s.job();
  for(const path of ['/admin/accounts','/admin/jobs','/admin/summary']){
    const result=await s.request(path);assert.equal(result.status,200);const text=JSON.stringify(result.body);
    for(const sensitive of ['private-original-sentinel','仅本地检查。',s.sessions[0].key,'password_hash','salt','email'])assert.equal(text.includes(sensitive),false);
  }
});
test('reviewed real test runs are administrator-only and never create user jobs or change business totals',async t=>{
  const s=await setup();t.after(s.close);s.job();
  const before=(await s.request('/admin/summary')).body;
  assert.equal((await s.request('/admin/test-runs',null)).status,401);
  assert.equal((await s.request('/admin/test-runs',s.sessions[1])).status,403);
  assert.equal((await s.request('/admin/test-runs',s.sessions[0],'https://attacker.test')).status,403);
  const response=await s.request('/admin/test-runs');assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.body.readOnly,true);assert.equal(response.body.includedInBusinessStatistics,false);
  const rows=response.body.records;assert.equal(rows.length,3);assert.equal(new Set(rows.map(row=>row.id)).size,3);
  assert.deepEqual(rows.map(row=>row.sourceVersion),['2.16.0','2.16.1','2.16.1']);
  assert.deepEqual(rows.map(row=>row.elapsedMs),[8153,5463,10404]);
  const first=JSON.parse(await readFile(new URL('../../docs/NOTICE-QUESTION-EXAMPLE.json',import.meta.url),'utf8'));
  const next=JSON.parse(await readFile(new URL('../../docs/NOTICE-QUESTION-EXAMPLE-2.16.1.json',import.meta.url),'utf8'));
  for(const [index,original] of [first,...next.cases].entries()){assert.equal(rows[index].sourceText,original.sourceText);assert.equal(rows[index].question,original.question);assert.deepEqual({answer:rows[index].answer,evidence:rows[index].evidence},original.result||original.answer);assert.deepEqual(rows[index].usage,original.usage);assert.equal(rows[index].estimatedRmb,original.estimatedRmb);}
  for(const row of rows){assert.equal(row.origin,'direct-provider-test');assert.equal(row.realProviderCall,true);assert.equal(row.sourceAlreadyRedacted,true);assert.equal(row.automaticRetries,0);assert.equal(row.providerInvoiceVerified,false);assert(row.sourceText&&row.question&&row.answer&&row.evidence.length&&row.usage.input&&row.knownLimitations.length);assert(!Object.hasOwn(row,'ownerSubject'));}
  const copied=rows.find(row=>row.title==='本科生评教');assert(copied.sourceText.includes('\u0014\u0014\b'));assert.match(copied.answer,/\*\*现在做什么\*\*/);
  assert.equal((await s.request('/admin/test-runs',s.sessions[0],origin,'POST',{insertJob:true})).status,400);
  assert.deepEqual((await s.request('/admin/summary')).body,before);
  assert.equal((await s.request('/admin/jobs')).body.jobs.length,1);
});
test('registering an allowed-looking name after administrator startup never grants a new account permission',async t=>{
  const s=await setup({usernames:['kemou','late-admin']});t.after(s.close);
  const response=await s.auth.handle(new Request('https://api.example.test/auth/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'late-admin',password:'test-only-password',invite:s.auth.issueInvites(1)[0]})}),'test-campus');
  assert.equal(response.status,200);const late=await response.json();assert.equal((await s.request('/admin/summary',late)).status,403);assert.equal((await s.request('/admin/summary')).status,200);
});
test('administrator reads saved original and result across accounts and ages without legacy consent gates',async t=>{
  const s=await setup();t.after(s.close);
  const old=s.job(),legacy=s.job(s.sessions[1],true,'legacy-flag-original');
  const legacyDB=new DatabaseSync(s.syncFile);legacyDB.prepare('UPDATE analysis_jobs SET review_consent=1 WHERE id=?').run(legacy.id);legacyDB.close();
  for(const job of [old,legacy]){const detail=await s.request('/admin/jobs/'+job.id);assert.equal(detail.body.job.contentAvailable,true);assert(detail.body.job.sources.length);assert.equal(detail.body.job.result.records[0].title,'独立测试响应');assert.equal((await s.request('/admin/jobs/'+job.id,s.sessions[1])).status,403);}
  s.advance(16*86400000);s.auth.getIdentity(s.sessions[0].key);s.advance(15*86400000);
  const afterThirtyDays=await s.request('/admin/jobs/'+old.id);assert.equal(afterThirtyDays.body.job.sources[0].text,'private-original-sentinel');
  const checked=new DatabaseSync(s.syncFile);assert.equal(checked.prepare('SELECT COUNT(*) AS count FROM analysis_jobs').get().count,2);assert.equal(checked.prepare('SELECT review_consent FROM analysis_jobs WHERE id=?').get(legacy.id).review_consent,1);checked.close();
});
test('read-only endpoints reject write bodies, unsupported verbs and malformed pagination',async t=>{
  const s=await setup();t.after(s.close);
  assert.equal((await s.request('/admin/accounts',s.sessions[0],origin,'DELETE',{})).status,405);
  assert.equal((await s.request('/admin/accounts',s.sessions[0],origin,'POST',{makeAdmin:true})).status,400);
  assert.equal((await s.request('/admin/accounts?offset=-1')).status,400);
  assert.equal((await s.request('/admin/jobs?account='+encodeURIComponent("' OR 1=1"))).status,400);
  assert.equal((await s.request('/admin/jobs?before='+Buffer.from('["x","x"]').toString('base64url'))).status,400);
  assert.equal((await s.request('/admin/jobs/'+randomUUID())).status,404);
});
test('job pages have stable cursors without retrieving payloads and preserve every record',async t=>{
  const s=await setup();t.after(s.close);
  const owner=s.sync.accountForKey(s.sessions[1].key);
  for(let i=0;i<23;i++){
    const job=s.sync.jobs.accept(owner,randomUUID(),'input-'+i,[{text:'pagination-original-'+i}]);s.sync.jobs.fail(owner,job.id,'SERVICE_UNAVAILABLE');s.advance(1000);
  }
  const first=await s.request('/admin/jobs');assert.equal(first.body.jobs.length,20);assert.equal(first.body.hasMore,true);
  const second=await s.request('/admin/jobs?before='+first.body.nextBefore);assert.equal(second.body.jobs.length,3);assert.equal(second.body.hasMore,false);
  assert.equal(new Set([...first.body.jobs,...second.body.jobs].map(job=>job.id)).size,23);assert(!JSON.stringify(first.body).includes('pagination-original'));
});
test('legacy consent input is compatible without access gates; idempotency and provider/cache metrics remain',async t=>{
  const s=await setup();t.after(s.close);const key=s.sessions[1].key;
  const call=async(id,consent)=>s.ai(new Request('https://api.example.test/analysis-jobs',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({requestId:id,sources:[{text:'一份校园课程通知。'}],...(consent===undefined?{}:{maintenanceReviewConsent:consent})})}),'test-campus');
  const requestId=randomUUID(),response=await call(requestId);assert.equal(response.status,202);const first=(await response.json()).job;await s.ai.drain();
  const repeated=await call(requestId,true);assert.equal((await repeated.json()).job.id,first.id);assert.equal(s.sync.adminReader.job(first.id).contentAvailable,true);
  const consented=await call(randomUUID(),true);assert.equal(consented.status,202);const second=(await consented.json()).job;assert.equal(s.sync.adminReader.job(second.id,{viewerSubject:s.auth.getIdentity(s.sessions[0].key).subject}).contentAvailable,true);
  assert.equal((await call(randomUUID(),'yes')).status,400);
  const summary=(await s.request()).body;assert.equal(summary.knownProviderCalls,1);assert.equal(summary.knownCacheReuses,1);assert.equal(summary.unknownProviderCalls,0);assert.equal(summary.usage.requests,1);assert.equal(summary.usage.organizingRequests,1);assert.equal(summary.usage.questionRequests,0);assert.equal(summary.usage.dailyRequestLimit,50);assert.equal(summary.usage.dailyQuestionLimit,40);
  const firstRow=s.sync.adminReader.job(first.id,{viewerSubject:s.auth.getIdentity(key).subject});assert.deepEqual(firstRow.tokenUsage,{input:20,output:30,reasoning:10});
});
test('the login shell carries a nonce CSP, a single trusted product preview origin, no secrets and no dynamic HTML sinks',async t=>{
  const s=await setup();t.after(s.close);const shell=await s.request('/admin',null,origin,'GET');
  assert.equal(shell.status,200);assert.equal(shell.headers.get('Cache-Control'),'no-store');assert.equal(shell.headers.get('X-Frame-Options'),'DENY');
  assert.match(shell.headers.get('Content-Security-Policy'),/script-src 'nonce-[^']+'/);assert.match(shell.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  assert.match(shell.headers.get('Content-Security-Policy'),/frame-src https:\/\/kemou2333\.github\.io;/);
  assert.match(shell.body,/event\.origin!==previewOrigin\|\|event\.source!==state\.frame\.contentWindow/);
  assert.match(shell.body,/postMessage\(state\.payload,previewOrigin\)/);
  for(const forbidden of [s.sessions[0].key,'localStorage','innerHTML','document.write','eval(','https://cdn'])assert.equal(shell.body.includes(forbidden),false);
});
test('dashboard dates use Shanghai submission days, distinguish analysis success from task progress, and retain unknown legacy metrics',async t=>{
  const s=await setup();t.after(s.close);const prior=s.job(),today=s.job(),undated=s.job(),older=s.job(),owner=s.sync.accountForKey(s.sessions[1].key);
  const failed=s.sync.jobs.accept(owner,randomUUID(),'failed-'+randomUUID(),[{text:'本地失败测试'}]);s.sync.jobs.fail(owner,failed.id,'SERVICE_UNAVAILABLE');
  const pending=s.sync.jobs.accept(owner,randomUUID(),'pending-'+randomUUID(),[{text:'本地等待测试'}]);
  const db=new DatabaseSync(s.syncFile);for(const [id,created] of [[prior.id,'2026-10-13T15:59:59.999Z'],[today.id,'2026-10-13T16:00:00.000Z'],[undated.id,'unknown-legacy-date'],[older.id,'2026-09-01T00:00:00.000Z']])db.prepare('UPDATE analysis_jobs SET created=? WHERE id=?').run(created,id);db.close();
  const output=(await s.request()).body;assert.equal(output.daily.timeZone,'Asia/Shanghai');assert.equal(output.daily.day,'2026-10-14');assert.equal(output.daily.days.length,14);
  assert.deepEqual(output.daily.today,{day:'2026-10-14',total:3,successful:1,failed:1,pending:1});assert.deepEqual(output.daily.days.find(row=>row.day==='2026-10-13'),{day:'2026-10-13',total:1,successful:1,failed:0,pending:0});
  assert.equal(output.daily.unrecognizedDates,1);assert.equal(output.jobs,6);assert.equal(output.unknownProviderCalls,6);assert.equal(output.notices,4);
  const detail=(await s.request('/admin/jobs/'+today.id)).body.job;assert.equal(detail.result.records[0].completed,false);assert.equal((await s.request('/admin/jobs/'+pending.id)).body.job.status,'accepted');
});
test('backup status exposes only finite health fields, with bounded reads and no file paths or diagnostics',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'campus-admin-backup-'));t.after(()=>rm(folder,{recursive:true,force:true}));const file=join(folder,'status.json');
  assert.deepEqual(await backupSummary(file),{status:'not_configured'});
  await writeFile(file,JSON.stringify({status:'error',lastAttemptAt:'2026-10-14T00:00:00Z',lastSuccessAt:'2026-10-13T00:00:00Z',sizeBytes:1024,errorCode:'BACKUP_CAPACITY',privatePath:'/private/should-not-leave',rawError:'sensitive original'}));
  const valid=await backupSummary(file);assert.equal(valid.status,'error');assert.equal(valid.errorCode,'BACKUP_CAPACITY');assert.equal(JSON.stringify(valid).includes('private'),false);assert.equal(JSON.stringify(valid).includes('sensitive'),false);
  await writeFile(file,JSON.stringify({status:'error',errorCode:'arbitrary raw error',sizeBytes:-1}));const filtered=await backupSummary(file);assert.equal(filtered.errorCode,null);assert.equal(filtered.sizeBytes,null);
  await writeFile(file,'x'.repeat(4097));assert.deepEqual(await backupSummary(file),{status:'unavailable'});
});
test('legacy job migrations preserve payloads and unused legacy columns without inventing provider metrics',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'campus-old-jobs-'));t.after(()=>rm(folder,{recursive:true,force:true}));const file=join(folder,'sync.sqlite');
  let sync=await createSyncService({stateFile:file,signingSecret:secret,allowedOrigins:[origin]}),key=sync.provision({provider:'invite',subject:randomUUID()}).key,account=sync.accountForKey(key);
  const job=sync.jobs.accept(account,randomUUID(),'old-hash',[{text:'old-original-sentinel'}]);sync.jobs.fail(account,job.id,'SERVICE_UNAVAILABLE');sync.close();
  const legacy=new DatabaseSync(file),before=legacy.prepare('SELECT sources,status,created,updated,error_code,bytes FROM analysis_jobs').get();
  for(const name of ['review_consent','provider_called','cache_reuse','token_usage'])legacy.exec('ALTER TABLE analysis_jobs DROP COLUMN '+name);legacy.close();
  sync=await createSyncService({stateFile:file,signingSecret:secret,allowedOrigins:[origin]});t.after(()=>sync.close());
  const check=new DatabaseSync(file);assert.deepEqual(check.prepare('SELECT sources,status,created,updated,error_code,bytes FROM analysis_jobs').get(),before);check.close();
  const metadata=sync.adminReader.jobs()[0];assert.equal(Object.hasOwn(metadata,'reviewConsent'),false);assert.equal(metadata.providerCalled,null);assert.equal(metadata.tokenUsage,null);
  const detail=sync.adminReader.job(job.id,{viewerSubject:randomUUID()});assert.equal(detail.contentAvailable,true);assert.equal(detail.sources[0].text,'old-original-sentinel');
});
function cloudRecord(id='imported/cloud%record'){
  const value=globalThis.CampusData.create({schemaVersion:4,kind:'task',title:'虚构导入通知',summary:'核对资料后提交。',deadline:null,deadlineText:'',timeline:[],materials:[],warnings:[],reminders:[],tasks:[{text:'提交虚构材料',assignee:'同学',scope:'all',condition:'',details:[],steps:[{text:'核对资料',details:[]}],time:null,timeText:'',location:null}]},'虚构校内通知原文。');
  const {reminderNotes,...record}=value;
  return {...record,schemaVersion:5,id,updatedAt:'2026-10-14T00:00:00Z',dismissed:false,note:'导入后补充的笔记',attachments:[],tasks:record.tasks.map((task,index)=>({...task,id:id+'-t-'+index,completed:true,note:'事项已确认',steps:task.steps.map(step=>({...step,completed:true,note:'步骤笔记'}))}))};
}
async function syncChanges(s,session,changes,cursor=0){
  const response=await s.sync.handle(new Request('https://api.example.test/sync',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+session.key},body:JSON.stringify({cursor,changes})}));assert.equal(response.status,200);return response.json();
}
test('administrator opens current imported/edited cloud records including progress and notes; ordinary accounts cannot use admin routes',async t=>{
  const s=await setup();t.after(s.close);const owner=s.auth.getIdentity(s.sessions[1].key).subject,other=s.auth.getIdentity(s.sessions[2].key).subject,record=cloudRecord();
  const first=await syncChanges(s,s.sessions[1],[{id:record.id,baseVersion:0,record}]);
  const root='/admin/accounts/'+owner+'/records';
  assert.equal((await s.request(root,null)).status,401);assert.equal((await s.request(root,s.sessions[1])).status,403);assert.equal((await s.request(root+'/'+encodeURIComponent(record.id),s.sessions[2])).status,403);
  const list=await s.request(root);assert.equal(list.body.records[0].title,record.title);assert(!JSON.stringify(list.body).includes(record.originalText));assert(!JSON.stringify(list.body).includes(record.note));
  const detail=await s.request(root+'/'+encodeURIComponent(record.id));assert.deepEqual(detail.body.record,record);assert.equal(detail.body.record.tasks[0].steps[0].completed,true);
  const updated={...record,note:'后续修改的新笔记',updatedAt:'2026-10-14T01:00:00Z'};
  await syncChanges(s,s.sessions[1],[{id:record.id,baseVersion:first.accepted[0].version,record:updated}],first.cursor);
  assert.equal((await s.request(root+'/'+encodeURIComponent(record.id))).body.record.note,'后续修改的新笔记');assert.equal((await s.request('/admin/accounts/'+other+'/records/'+encodeURIComponent(record.id))).status,404);
  const accounts=(await s.request('/admin/accounts')).body.accounts;assert.equal(accounts.find(account=>account.id===owner).notices,1);
});
test('cloud record pagination is account-scoped and deleted markers never revive notification content',async t=>{
  const s=await setup();t.after(s.close);const owner=s.auth.getIdentity(s.sessions[1].key).subject,records=Array.from({length:23},(_,i)=>cloudRecord('imported-'+i));
  const accepted=await syncChanges(s,s.sessions[1],records.map(record=>({id:record.id,baseVersion:0,record}))),root='/admin/accounts/'+owner+'/records';
  const first=(await s.request(root)).body;assert.equal(first.records.length,20);assert.equal(first.hasMore,true);
  const second=(await s.request(root+'?before='+first.nextBefore)).body;assert.equal(second.records.length,3);assert.equal(new Set([...first.records,...second.records].map(row=>row.id)).size,23);
  const gone=records[0].id;await syncChanges(s,s.sessions[1],[{id:gone,baseVersion:accepted.accepted.find(row=>row.id===gone).version,record:null}],accepted.cursor);
  assert.equal((await s.request(root+'/'+encodeURIComponent(gone))).status,404);assert.equal((await s.request(root+'?before=invalid')).status,400);assert.equal((await s.request(root+'/invalid%')).status,400);
  const db=new DatabaseSync(s.syncFile);assert.equal(db.prepare('SELECT json FROM records WHERE id=?').get(gone).json,null);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM records').get().count,23);db.close();
});
test('verified email is confined to protected account metadata and credentials never enter any admin response',async t=>{
  const s=await setup();t.after(s.close);const subject=s.auth.getIdentity(s.sessions[1].key).subject,record=cloudRecord('safe-notice');await syncChanges(s,s.sessions[1],[{id:record.id,baseVersion:0,record}]);
  const db=new DatabaseSync(s.authFile);db.prepare('INSERT INTO email_identities(email,user) VALUES(?,?)').run('private-fixture-mailbox@163.com',subject);const credentials=db.prepare('SELECT password_hash,salt FROM invite_users WHERE id=?').get(subject);db.close();assert.equal(s.auth.getIdentity(s.sessions[1].key).email,'private-fixture-mailbox@163.com');
  for(const path of ['/admin/accounts','/admin/jobs','/admin/summary','/admin/accounts/'+subject+'/records','/admin/accounts/'+subject+'/records/'+record.id]){
    const output=JSON.stringify((await s.request(path)).body);for(const secret of [s.sessions[1].key,credentials.password_hash,credentials.salt])assert(!output.includes(secret));if(path!=='/admin/accounts'&&path!=='/admin/jobs')assert(!output.includes('private-fixture-mailbox@163.com'));
  }
});

test('explicit administrator UUIDs preserve permission independently of a display credential and reject other users',async t=>{
 const s=await setup();t.after(s.close);
 const owner=s.auth.getIdentity(s.sessions[1].key).subject;
 const admin=createAdminService({usernames:[],userIDs:[owner],allowedOrigins:[origin]},{auth:s.auth,sync:s.sync,ai:s.ai});
 const call=async(session)=>admin(new Request('https://api.example.test/admin/summary',{method:'GET',headers:{Origin:origin,Authorization:'Bearer '+session.key}}));
 assert.equal((await call(s.sessions[1])).status,200);assert.equal((await call(s.sessions[0])).status,403);
 const db=new DatabaseSync(s.authFile);db.prepare('UPDATE invite_users SET username=? WHERE id=?').run('new-internal-label',owner);db.close();
 assert.equal((await call(s.sessions[1])).status,200);
 const missing=createAdminService({usernames:[],userIDs:[randomUUID()],allowedOrigins:[origin]},{auth:s.auth,sync:s.sync,ai:s.ai});
 const rejected=await missing(new Request('https://api.example.test/admin/summary',{method:'GET',headers:{Origin:origin,Authorization:'Bearer '+s.sessions[1].key}}));assert.equal(rejected.status,403);
 assert.throws(()=>createAdminService({userIDs:['not-an-id']},{auth:s.auth,sync:s.sync,ai:s.ai}));
});

test('only the authorized backend shows a verified email while record selections retain UUIDs',async t=>{
 const s=await setup();t.after(s.close);
 const owner=s.auth.getIdentity(s.sessions[1].key).subject,address='student@163.com';
 const db=new DatabaseSync(s.authFile);db.prepare('INSERT INTO email_identities(email,user) VALUES (?,?)').run(address,owner);db.close();s.job();
 const accounts=(await s.request('/admin/accounts')).body.accounts;
 const row=accounts.find(account=>account.id===owner);assert.equal(row.email,address);assert.equal(row.accountLabel,address);
 const old=accounts.find(account=>account.id!==owner);assert.equal(old.accountLabel,'旧账号');
 const jobs=(await s.request('/admin/jobs')).body.jobs;assert.equal(jobs[0].email,address);assert.equal(jobs[0].accountLabel,address);assert.equal(jobs[0].ownerSubject,owner);
 const denied=await s.request('/admin/accounts',s.sessions[1]);assert.equal(denied.status,403);assert(!JSON.stringify(denied.body).includes(address));
 const html=(await s.request('/admin',null,origin,'GET')).body;assert(html.includes('function accountLabel(account)'));assert(!html.includes('[account.username,dates'));
});
