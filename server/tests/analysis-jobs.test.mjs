import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createSyncService,validateCloudNotice} from '../sync.mjs';
import {createService} from '../service.mjs';
import {captchaAnswerHash} from '../image-captcha.mjs';

const origin='https://campus.example',secret='job-signing-secret-at-least-twenty-characters';
const requestId='123e4567-e89b-42d3-a456-426614174000';
const info=(title,sourceId)=>({sourceId,schemaVersion:4,kind:'information',title,summary:'原通知中的信息。',deadline:null,deadlineText:'',timeline:[],tasks:[],materials:[],warnings:[],reminders:['请留意原通知。']});
const envelope=notices=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:4,notices})}}],usage:{prompt_tokens:30,completion_tokens:50}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

async function setup(modelFetch,extra={}){
  const directory=await mkdtemp(join(tmpdir(),'campus-durable-jobs-')),syncFile=join(directory,'sync.sqlite'),stateFile=join(directory,'usage.json');
  const identities=new Map(),sync=await createSyncService({signingSecret:secret,allowedOrigins:[origin],stateFile:syncFile},{authenticate:key=>identities.get(key)});
  const owner={provider:'invite',subject:'verified-owner'},other={provider:'invite',subject:'other-owner'};
  const a=sync.provision(owner,'network-owner').key,b=sync.provision(other,'network-other').key;identities.set(a,owner);identities.set(b,other);
  const config={apiKey:'fake-provider-key',accessToken:secret,requireAccess:false,requireIdentity:true,allowedOrigins:[origin],stateFile,...extra};
  const options={modelFetch,accountForToken:key=>identities.has(key)?sync.accountForKey(key):null,jobs:sync.jobs,
    imageCaptcha:id=>({answerHash:captchaAnswerHash(id,'1234'),image:'data:image/png;base64,fake-for-unit-test'})};
  const service=await createService(config,options);
  const jobRequest=(id=requestId,sources=[{text:'学校通知，请按原文办理。'}],key=a,proof,signal)=>new Request('http://localhost/analysis-jobs',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+key,'Content-Type':'application/json',...(proof?{'X-Campus-Proof':JSON.stringify(proof)}:{})},body:JSON.stringify({requestId:id,sources}),...(signal?{signal}:{})});
  const get=(path='/analysis-jobs',key=a)=>new Request('http://localhost'+path,{headers:{Origin:origin,Authorization:'Bearer '+key}});
  const exchange=async(changes=[],cursor=0,key=a)=>{
    const response=await sync.handle(new Request('http://localhost/sync',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({cursor,changes})}));
    return {status:response.status,body:await response.json()};
  };
  return {directory,syncFile,stateFile,identities,sync,config,options,service,a,b,jobRequest,get,exchange,close:async()=>{await service.drain();sync.close();await rm(directory,{recursive:true,force:true});}};
}

test('accepted jobs survive browser disconnect, persist quota before one dispatch and atomically save mapped stable cloud records',async()=>{
  const pending=deferred();let calls=0,providerSignal;
  const setupReady=deferred();
  const s=await setup(async(_url,options)=>{calls++;providerSignal=options.signal;const current=await setupReady.promise;
    const quota=JSON.parse(await readFile(current.stateFile,'utf8'));assert.equal(quota.requests,1);assert(quota.costMicro>0);
    const saved=current.sync.jobs.list(current.sync.accountForKey(current.a)).jobs;assert.equal(saved.length,1);assert.equal(saved[0].status,'running');
    return pending.promise;
  });setupReady.resolve(s);
  try{
    const controller=new AbortController(),sources=[{text:'  第一份学校通知。\n '},{text:'第二份学校通知。'}];
    const response=await s.service(s.jobRequest(requestId,sources,s.a,undefined,controller.signal),'network-1');assert.equal(response.status,202);
    const {job}=await response.json();assert.equal(job.requestId,requestId);assert.equal(job.status,'running');assert.equal(Object.hasOwn(job,'sources'),false);
    controller.abort();assert.equal(providerSignal.aborted,false);
    const duplicate=await s.service(s.jobRequest(requestId,sources),'network-1');assert.equal((await duplicate.json()).job.id,job.id);assert.equal(calls,1);
    pending.resolve(envelope([info('第一来源主题一',1),info('第一来源主题二',1),info('第二来源主题',2)]));await s.service.drain();
    const done=(await (await s.service(s.get('/analysis-jobs/'+job.id))).json()).job;
    assert.equal(done.status,'completed');assert.deepEqual(done.sourceIndexes,[0,0,1]);assert.equal(done.recordsAreSnapshot,true);
    assert.deepEqual(done.sources,sources.map(source=>({text:source.text.trim()})));
    assert.deepEqual(done.records.map(record=>record.originalText),['第一份学校通知。','第一份学校通知。','第二份学校通知。']);
    for(const record of done.records){assert(record.id.startsWith('ai-'+job.id));validateCloudNotice(record,record.id);}
    const cloud=await s.exchange();assert.equal(cloud.status,200);assert.deepEqual(cloud.body.updates.map(update=>update.id),done.noticeIds);
    assert.equal((await s.exchange([],0,s.b)).body.updates.length,0);assert.equal((await s.service(s.get('/analysis-jobs/'+job.id,s.b))).status,404);
    const repeated=await s.service(s.jobRequest(requestId,sources));assert.equal((await repeated.json()).job.status,'completed');assert.equal(calls,1);
    const quota=JSON.parse(await readFile(s.stateFile,'utf8'));assert.equal(quota.requests,1);assert.equal(quota.input,30);assert.equal(quota.output,50);
    assert(!JSON.stringify(quota).includes('学校通知'));assert(!JSON.stringify(quota).includes(s.a));
  }finally{pending.resolve(envelope([info('清理',1)]));await s.close();}
});

test('same request ID rejects changed content; captcha, daily budget and account identity cannot be bypassed through the job endpoint',async()=>{
  let calls=0;const s=await setup(async()=>{calls++;return envelope([info('通知',1)]);});
  try{
    const first=await s.service(s.jobRequest(),'network-1');assert.equal(first.status,202);await s.service.drain();
    assert.equal((await s.service(s.jobRequest(requestId,[{text:'不同原文'}]),'network-1')).status,409);assert.equal(calls,1);
    assert.equal((await s.service(s.get('/analysis-jobs','wrong-key'))).status,401);
    assert.equal((await s.service(new Request('http://localhost/analysis-jobs',{headers:{Origin:'https://other.example',Authorization:'Bearer '+s.a}}))).status,403);
    const secondId='123e4567-e89b-42d3-a456-426614174001';assert.equal((await s.service(s.jobRequest(secondId,[{text:'第二份原文'}]),'network-1')).status,202);await s.service.drain();
    const thirdId='123e4567-e89b-42d3-a456-426614174002',thirdSources=[{text:'第三份原文'}];
    const challenge=await s.service(s.jobRequest(thirdId,thirdSources),'network-1');assert.equal(challenge.status,428);const body=await challenge.json();assert.equal(calls,2);
    const proof={token:body.challenge.token,answer:'1234'};
    assert.equal((await s.service(s.jobRequest(thirdId,thirdSources,s.b,proof),'network-1')).status,400);assert.equal(calls,2);
    const accepted=await s.service(s.jobRequest(thirdId,thirdSources,s.a,proof),'network-1');assert.equal(accepted.status,202);await s.service.drain();assert.equal(calls,3);
    assert.equal((await s.service(s.jobRequest(thirdId,thirdSources,s.a,proof),'network-1')).status,202);assert.equal(calls,3);
  }finally{await s.close();}
  const lowBudget=await setup(async()=>{calls++;return envelope([info('预算',1)]);},{dailyBudgetRmb:0.001});
  try{const response=await lowBudget.service(lowBudget.jobRequest());assert.equal(response.status,429);assert.equal((await response.json()).code,'DAILY_COST_LIMIT');assert.equal(lowBudget.sync.jobs.list(lowBudget.sync.accountForKey(lowBudget.a)).jobs.length,0);assert.equal(calls,3);}finally{await lowBudget.close();}
});

test('a failed single paid response retains original text and diagnosis without writing cloud records or retrying',async()=>{
  let calls=0;const s=await setup(async()=>{calls++;return envelope([{...info('通知',1),summary:'x'.repeat(141)}]);});
  try{
    const {job}=await (await s.service(s.jobRequest())).json();await s.service.drain();
    const failed=(await (await s.service(s.get('/analysis-jobs/'+job.id))).json()).job;
    assert.equal(failed.status,'failed');assert.equal(failed.code,'AI_FORMAT_INVALID');assert.equal(failed.sources[0].text,'学校通知，请按原文办理。');assert.equal(failed.records,undefined);
    assert.equal((await s.exchange()).body.updates.length,0);
    const repeated=(await (await s.service(s.jobRequest())).json()).job;assert.equal(repeated.id,job.id);assert.equal(repeated.status,'failed');assert.equal(calls,1);
    const quota=JSON.parse(await readFile(s.stateFile,'utf8'));assert.equal(quota.requests,1);assert.equal(quota.lastFailureCode,'SUMMARY');
  }finally{await s.close();}
});

test('restart marks a dispatched job failed and never dispatches it again; other account records and original quota remain',async()=>{
  const pending=deferred();let calls=0;const s=await setup(async()=>{calls++;return pending.promise;});let restarted;
  try{
    const {job}=await (await s.service(s.jobRequest())).json();assert.equal(calls,1);s.sync.close();
    restarted=await createSyncService({signingSecret:secret,allowedOrigins:[origin],stateFile:s.syncFile},{authenticate:key=>s.identities.get(key)});
    const after=await createService(s.config,{modelFetch:async()=>{calls++;return envelope([info('不应调用',1)]);},accountForToken:key=>s.identities.has(key)?restarted.accountForKey(key):null,jobs:restarted.jobs});
    const view=(await (await after(s.get('/analysis-jobs/'+job.id))).json()).job;assert.equal(view.status,'failed');assert.equal(view.code,'SERVICE_RESTARTED');assert.equal(view.sources.length,1);
    assert.equal((await after(s.jobRequest())).status,202);await after.drain();assert.equal(calls,1);assert(restarted.accountForKey(s.b));
    const quota=JSON.parse(await readFile(s.stateFile,'utf8'));assert.equal(quota.requests,1);assert(quota.costMicro>0);
  }finally{pending.reject(new Error('simulated process exit'));await s.service.drain();restarted?.close();await rm(s.directory,{recursive:true,force:true});}
});

test('job completion is atomic and idempotent; repeated completion cannot overwrite edits or revive a deleted cloud record',async()=>{
  const s=await setup(async()=>envelope([info('通知',1)]));
  try{
    const {job}=await (await s.service(s.jobRequest())).json();await s.service.drain();const account=s.sync.accountForKey(s.a),done=s.sync.jobs.get(account,job.id);
    const cloud=await s.exchange(),update=cloud.body.updates[0],edited={...update.record,note:'保留用户笔记',updatedAt:'2026-10-10T10:00:00Z'};
    const write=await s.exchange([{id:update.id,baseVersion:update.version,record:edited}],cloud.body.cursor);assert.equal(write.status,200);
    s.sync.jobs.complete(account,job.id,{schemaVersion:4,notices:[info('旧结果',1)]});
    const current=await s.exchange();assert.equal(current.body.updates[0].record.note,'保留用户笔记');
    const deletion=await s.exchange([{id:update.id,baseVersion:current.body.updates[0].version,record:null}],current.body.cursor);assert.equal(deletion.status,200);
    s.sync.jobs.complete(account,job.id,{schemaVersion:4,notices:[info('旧结果',1)]});assert.equal((await s.exchange()).body.updates[0].record,null);
    const manual=s.sync.jobs.accept(account,'request-partial-atomic-job','input-hash',[{text:'第一来源'},{text:'第二来源'}]);s.sync.jobs.start(account,manual.id);
    const invalid={...info('第二结果',2),sourceId:undefined,materials:[{}]},valid={...info('第一结果',1),sourceId:undefined};delete valid.sourceId;delete invalid.sourceId;
    assert.throws(()=>s.sync.jobs.complete(account,manual.id,{schemaVersion:4,notices:[valid,invalid],sourceIndexes:[0,1]}));
    assert.equal((await s.exchange()).body.updates.length,1);assert.equal(s.sync.jobs.get(account,manual.id).status,'running');s.sync.jobs.fail(account,manual.id,'JOB_SAVE_FAILED');
    assert.equal(done.records.length,1);
  }finally{await s.close();}
});

test('stable owner-scoped pagination never omits jobs created in the same millisecond; capacity rejects before model fees',async()=>{
  let calls=0;const s=await setup(async()=>{calls++;return envelope([info('不会调用',1)]);});
  try{
    const account=s.sync.accountForKey(s.a),other=s.sync.accountForKey(s.b),ids=[];
    for(let index=0;index<23;index++){const job=s.sync.jobs.accept(account,'pagination-request-'+String(index).padStart(4,'0'),'hash-'+index,[{text:'通知原文'}]);ids.push(job.id);s.sync.jobs.fail(account,job.id,'SERVICE_UNAVAILABLE');}
    const hidden=s.sync.jobs.accept(other,'pagination-other-request','other-hash',[{text:'其他账号私密原文'}]);s.sync.jobs.fail(other,hidden.id,'SERVICE_UNAVAILABLE');
    const first=await (await s.service(s.get())).json();assert.equal(first.jobs.length,20);assert.equal(first.hasMore,true);
    const second=await (await s.service(s.get('/analysis-jobs?before='+encodeURIComponent(first.nextBefore)))).json();assert.equal(second.jobs.length,3);
    assert.deepEqual(new Set([...first.jobs,...second.jobs].map(job=>job.id)),new Set(ids));assert(!JSON.stringify(first).includes(hidden.id));assert(!JSON.stringify(first).includes('通知原文'));
    const db=new DatabaseSync(s.syncFile);db.prepare('UPDATE analysis_jobs SET bytes=? WHERE account=?').run(11*1024*1024,account.id);db.close();
    const rejected=await s.service(s.jobRequest());assert.equal(rejected.status,507);assert.equal(calls,0);
  }finally{await s.close();}
});

test('concurrent identical submissions share one durable ACK and one quota reservation, even before the first ACK arrives',async()=>{
  const pending=deferred();let calls=0;const s=await setup(async()=>{calls++;return pending.promise;});
  try{
    const responses=await Promise.all(Array.from({length:8},()=>s.service(s.jobRequest(),'same-network')));
    for(const response of responses)assert.equal(response.status,202);
    const jobs=await Promise.all(responses.map(response=>response.json()));assert.equal(new Set(jobs.map(value=>value.job.id)).size,1);
    assert.equal(calls,1);const quota=JSON.parse(await readFile(s.stateFile,'utf8'));assert.equal(quota.requests,1);
    pending.resolve(envelope([info('通知',1)]));await s.service.drain();assert.equal(s.sync.jobs.list(s.sync.accountForKey(s.a)).jobs.length,1);
  }finally{pending.resolve(envelope([info('通知',1)]));await s.close();}
});

test('a valid result survives a cloud-save failure and can be saved later without another provider request',async()=>{
  let calls=0;const s=await setup(async()=>{calls++;return envelope([info('保存结果',1)]);});
  const service=await createService(s.config,{...s.options,jobs:{...s.sync.jobs,complete:()=>{throw new Error('simulated transient cloud write failure');}}});
  try{
    const {job}=await (await service(s.jobRequest())).json();await service.drain();
    const failed=s.sync.jobs.get(s.sync.accountForKey(s.a),job.id);assert.equal(failed.status,'failed');assert.equal(failed.code,'JOB_SAVE_FAILED');assert.equal(failed.recoverableResult,true);assert.equal(failed.records.length,1);
    assert.equal((await s.exchange()).body.updates.length,0);
    const save=(key=s.a)=>new Request('http://localhost/analysis-jobs/'+job.id+'/save',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:'{}'});
    assert.equal((await s.service(save(s.b))).status,404);
    const restored=await s.service(save());assert.equal(restored.status,202);assert.equal((await restored.json()).job.status,'completed');assert.equal(calls,1);
    assert.equal((await s.service(save())).status,202);assert.equal(calls,1);assert.equal((await s.exchange()).body.updates.length,1);
    const quota=JSON.parse(await readFile(s.stateFile,'utf8'));assert.equal(quota.requests,1);assert.equal(quota.input,30);assert.equal(quota.output,50);
  }finally{await service.drain();await s.close();}
});

test('concurrent cloud growth and free result recovery cannot consume another accepted job reservation',async()=>{
  const pending=deferred();const s=await setup(async()=>pending.promise);
  function record(index,materials){return {schemaVersion:5,kind:'information',title:'模拟云通知',summary:'只用于空间回归。',deadline:null,deadlineText:'',timeline:[],tasks:[],materials,warnings:[],reminders:[],id:'space-notice-'+index,originalText:'模拟通知原文',createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z',completed:false,dismissed:false,note:'',localDeadline:null,audienceOverride:'',attachments:[]};}
  try{
    const account=s.sync.accountForKey(s.a),old=s.sync.jobs.accept(account,'old-result-save-recovery','old-source-hash',[{text:'旧通知原文'}]);
    const savedNotice=info('保留的旧结果');delete savedNotice.sourceId;savedNotice.materials=['x'.repeat(1800)];
    s.sync.jobs.stage(account,old.id,{schemaVersion:4,notices:[savedNotice]});s.sync.jobs.fail(account,old.id,'JOB_SAVE_FAILED');
    const target=5*1024*1024-512*1024-1000,records=[];let used=0;
    for(let index=0;;index++){
      const value=record(index,Array(30).fill('x'.repeat(1900))),size=Buffer.byteLength(JSON.stringify(value));
      const tailBytes=Buffer.byteLength(JSON.stringify(record(index+1,[])));
      if(used+size+tailBytes>target)break;records.push(value);used+=size;
    }
    const tail=record(records.length,[]),available=target-used-Buffer.byteLength(JSON.stringify(tail));let left=available;
    while(left>5){const size=Math.min(1900,left-3);tail.materials.push('x'.repeat(size));left-=size+3;}
    while(used+Buffer.byteLength(JSON.stringify(tail))>target)tail.materials[tail.materials.length-1]=tail.materials.at(-1).slice(0,-1);
    records.push(tail);let firstVersion;
    for(let offset=0;offset<records.length;offset+=10){
      const saved=await s.exchange(records.slice(offset,offset+10).map(value=>({id:value.id,baseVersion:0,record:value})));assert.equal(saved.status,200);if(offset===0)firstVersion=saved.body.accepted[0].version;
    }
    const accepted=await s.service(s.jobRequest());assert.equal(accepted.status,202);const {job}=await accepted.json();
    const growth=await s.exchange([{id:records[0].id,baseVersion:firstVersion,record:{...records[0],note:'y'.repeat(2000)}}]);assert.equal(growth.status,507);
    assert.throws(()=>s.sync.jobs.checkCapacity(account),error=>error.status===507);
    assert.throws(()=>s.sync.jobs.retrySave(account,old.id),error=>error.status===507);
    assert.equal(s.sync.jobs.get(account,old.id).recoverableResult,true);
    pending.resolve(envelope([info('后台成功结果',1)]));await s.service.drain();assert.equal(s.sync.jobs.get(s.sync.accountForKey(s.a),job.id).status,'completed');
    assert.equal(s.sync.jobs.retrySave(account,old.id).status,'completed');
    const firstPage=await s.exchange();assert.equal(firstPage.body.updates.find(update=>update.id===records[0].id).record.note,'');
  }finally{pending.resolve(envelope([info('清理',1)]));await s.close();}
});

test('bounded valid provider output keeps a compact durable snapshot when repeated originals and local step IDs expand past the reservation',async()=>{
  const task={text:'事项',assignee:null,scope:'all',condition:'',details:[],steps:Array.from({length:10},()=>({text:'步骤',details:[]})),time:null,timeText:'',location:null};
  const notices=Array.from({length:20},()=>({...info('通知',1),kind:'task',tasks:Array.from({length:15},()=>task),reminders:[]}));
  const wire=envelope(notices),body=await wire.text();assert(Buffer.byteLength(body)<200000);
  let calls=0;const s=await setup(async()=>{calls++;return new Response(body,{headers:{'Content-Type':'application/json'}});});
  try{
    const text='中'.repeat(4000),{job}=await (await s.service(s.jobRequest(requestId,[{text}]))).json();await s.service.drain();
    const detail=s.sync.jobs.get(s.sync.accountForKey(s.a),job.id);assert.equal(detail.status,'completed');assert.equal(detail.records.length,20);assert.equal(calls,1);
    assert(Buffer.byteLength(JSON.stringify(detail.records))>512*1024);for(const record of detail.records){assert.equal(record.originalText,text);validateCloudNotice(record,record.id);}
    const db=new DatabaseSync(s.syncFile),row=db.prepare('SELECT result,bytes FROM analysis_jobs WHERE id=?').get(job.id);db.close();
    assert(row.bytes<=512*1024);assert.equal(JSON.parse(row.result).notices.length,20);
    const first=await s.exchange(),second=await s.exchange([],first.body.cursor);assert.equal(first.body.hasMore,true);assert.equal(first.body.updates.length+second.body.updates.length,20);
  }finally{await s.close();}
});
