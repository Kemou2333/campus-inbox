import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
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
  auth=await createAuthService({signingSecret:secret,allowedOrigins:[origin],stateFile:':memory:',imageCaptcha:false},{provision:sync.provision,now:()=>time});
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
  return {auth,sync,ai,admin,request,job,sessions,syncFile,advance:ms=>{time+=ms;},close:async()=>{await ai.drain();auth.close();sync.close();await rm(folder,{recursive:true,force:true});}};
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
test('other-user content is opt-in with a bounded review window; an administrator can read their own old content',async t=>{
  const s=await setup({contentDays:30});t.after(s.close);
  const old=s.job(),consented=s.job(s.sessions[1],true,'consented-original'),own=s.job(s.sessions[0],false,'owner-original');
  const hidden=await s.request('/admin/jobs/'+old.id);assert.equal(hidden.body.job.contentAvailable,false);assert.equal(Object.hasOwn(hidden.body.job,'sources'),false);assert.equal(Object.hasOwn(hidden.body.job,'result'),false);
  const allowed=await s.request('/admin/jobs/'+consented.id);assert.equal(allowed.body.job.contentAvailable,true);assert.equal(allowed.body.job.sources[0].text,'consented-original');assert.equal(allowed.body.job.result.records[0].title,'独立测试响应');
  s.advance(16*86400000);s.auth.getIdentity(s.sessions[0].key);s.advance(15*86400000);
  const expired=await s.request('/admin/jobs/'+consented.id);assert.equal(expired.body.job.contentAvailable,false);assert.equal(expired.body.job.contentReason,'review_window_expired');
  assert.equal((await s.request('/admin/jobs/'+own.id)).body.job.sources[0].text,'owner-original');
  const checked=new DatabaseSync(s.syncFile);assert.equal(checked.prepare('SELECT COUNT(*) AS count FROM analysis_jobs').get().count,3);checked.close();
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
test('job consent is explicit, strict and idempotent; metrics distinguish cache reuse from provider dispatch',async t=>{
  const s=await setup();t.after(s.close);const key=s.sessions[1].key;
  const call=async(id,consent)=>s.ai(new Request('https://api.example.test/analysis-jobs',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({requestId:id,sources:[{text:'一份校园课程通知。'}],...(consent===undefined?{}:{maintenanceReviewConsent:consent})})}),'test-campus');
  const requestId=randomUUID(),response=await call(requestId);assert.equal(response.status,202);const first=(await response.json()).job;await s.ai.drain();
  const repeated=await call(requestId,true);assert.equal((await repeated.json()).job.id,first.id);assert.equal(s.sync.adminReader.job(first.id,{viewerSubject:s.auth.getIdentity(s.sessions[0].key).subject}).reviewConsent,false);
  const consented=await call(randomUUID(),true);assert.equal(consented.status,202);const second=(await consented.json()).job;assert.equal(s.sync.adminReader.job(second.id,{viewerSubject:s.auth.getIdentity(s.sessions[0].key).subject}).contentAvailable,true);
  assert.equal((await call(randomUUID(),'yes')).status,400);
  const summary=(await s.request()).body;assert.equal(summary.knownProviderCalls,1);assert.equal(summary.knownCacheReuses,1);assert.equal(summary.unknownProviderCalls,0);assert.equal(summary.usage.requests,1);
  const firstRow=s.sync.adminReader.job(first.id,{viewerSubject:s.auth.getIdentity(key).subject});assert.deepEqual(firstRow.tokenUsage,{input:20,output:30,reasoning:10});
});
test('the login shell carries a nonce CSP, no secrets, no external dependency, and no dynamic HTML sinks',async t=>{
  const s=await setup();t.after(s.close);const shell=await s.request('/admin',null,origin,'GET');
  assert.equal(shell.status,200);assert.equal(shell.headers.get('Cache-Control'),'no-store');assert.equal(shell.headers.get('X-Frame-Options'),'DENY');
  assert.match(shell.headers.get('Content-Security-Policy'),/script-src 'nonce-[^']+'/);assert.match(shell.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  for(const forbidden of [s.sessions[0].key,'localStorage','innerHTML','document.write','eval(','https://cdn'])assert.equal(shell.body.includes(forbidden),false);
});
test('backup status exposes only finite health fields, with bounded reads and no file paths or diagnostics',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'campus-admin-backup-'));t.after(()=>rm(folder,{recursive:true,force:true}));const file=join(folder,'status.json');
  assert.deepEqual(await backupSummary(file),{status:'not_configured'});
  await writeFile(file,JSON.stringify({status:'error',lastAttemptAt:'2026-10-14T00:00:00Z',lastSuccessAt:'2026-10-13T00:00:00Z',sizeBytes:1024,errorCode:'BACKUP_CAPACITY',privatePath:'/private/should-not-leave',rawError:'sensitive original'}));
  const valid=await backupSummary(file);assert.equal(valid.status,'error');assert.equal(valid.errorCode,'BACKUP_CAPACITY');assert.equal(JSON.stringify(valid).includes('private'),false);assert.equal(JSON.stringify(valid).includes('sensitive'),false);
  await writeFile(file,JSON.stringify({status:'error',errorCode:'arbitrary raw error',sizeBytes:-1}));const filtered=await backupSummary(file);assert.equal(filtered.errorCode,null);assert.equal(filtered.sizeBytes,null);
  await writeFile(file,'x'.repeat(4097));assert.deepEqual(await backupSummary(file),{status:'unavailable'});
});
test('legacy job migrations preserve payloads and never backfill maintenance consent or provider metrics',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'campus-old-jobs-'));t.after(()=>rm(folder,{recursive:true,force:true}));const file=join(folder,'sync.sqlite');
  let sync=await createSyncService({stateFile:file,signingSecret:secret,allowedOrigins:[origin]}),key=sync.provision({provider:'invite',subject:randomUUID()}).key,account=sync.accountForKey(key);
  const job=sync.jobs.accept(account,randomUUID(),'old-hash',[{text:'old-original-sentinel'}]);sync.jobs.fail(account,job.id,'SERVICE_UNAVAILABLE');sync.close();
  const legacy=new DatabaseSync(file),before=legacy.prepare('SELECT sources,status,created,updated,error_code,bytes FROM analysis_jobs').get();
  for(const name of ['review_consent','provider_called','cache_reuse','token_usage'])legacy.exec('ALTER TABLE analysis_jobs DROP COLUMN '+name);legacy.close();
  sync=await createSyncService({stateFile:file,signingSecret:secret,allowedOrigins:[origin]});t.after(()=>sync.close());
  const check=new DatabaseSync(file);assert.deepEqual(check.prepare('SELECT sources,status,created,updated,error_code,bytes FROM analysis_jobs').get(),before);check.close();
  const metadata=sync.adminReader.jobs()[0];assert.equal(metadata.reviewConsent,false);assert.equal(metadata.providerCalled,null);assert.equal(metadata.tokenUsage,null);
  const detail=sync.adminReader.job(job.id,{viewerSubject:randomUUID()});assert.equal(detail.contentAvailable,false);assert.equal(Object.hasOwn(detail,'sources'),false);
});
