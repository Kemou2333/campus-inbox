import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
import {boundedText,ServiceError} from './analyze.mjs';

const D=globalThis.CampusData;
const BODY_LIMIT=1024*1024,RECORD_LIMIT=64*1024,ACCOUNT_BYTES=5*1024*1024,GLOBAL_BYTES=256*1024*1024;
const LIVE_LIMIT=1000,HISTORY_LIMIT=5000,ACCOUNT_LIMIT=500,PAGE_LIMIT=100,PAGE_BYTES=512*1024;
const JOB_BYTES=512*1024,ACCOUNT_JOB_BYTES=10*1024*1024,GLOBAL_JOB_BYTES=256*1024*1024,JOB_LIMIT=1000;
const JOB_ERRORS={AI_FORMAT_INVALID:'这次整理结果格式异常，请重新提交。',AI_INCOMPLETE:'这次整理结果未生成完整，请重新提交。',AI_TIMEOUT:'整理服务等待模型超时，请重新提交。',CONTENT_BOUNDARY:'这里只能整理校园通知，请提供原通知中的事项、安全提醒或学习信息。',SERVICE_RESTARTED:'整理服务重启，这次任务未能完成。原文已保留，请重新提交。',JOB_SAVE_FAILED:'结果未能保存到云端。原文已保留，请重新提交。',SERVICE_UNAVAILABLE:'整理服务暂时不可用。原文已保留，请稍后重新提交。'};
const sha=value=>createHash('sha256').update(value).digest('hex');
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
function shape(value,required,optional=[]){
  if(!isObject(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))throw new ServiceError('同步记录字段不完整或含不支持的内容。',400);
}
function id(value){if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>150)throw new ServiceError('同步记录编号不正确。',400);return value;}
function integer(value){if(!Number.isSafeInteger(value)||value<0)throw new ServiceError('同步版本不正确。',400);return value;}
function boolean(value){if(typeof value!=='boolean')throw new ServiceError('同步状态不正确。',400);}
function unique(values){if(new Set(values).size!==values.length)throw new ServiceError('同步记录存在重复编号。',400);}

/** Validate one externally supplied v5 boundary; retain its original text,
 * timestamps and field values. No attachment binaries or unknown fields enter SQLite. */
export function validateCloudNotice(record,expectedID){
  shape(record,['schemaVersion','kind','title','summary','deadline','deadlineText','timeline','tasks','materials','warnings','reminders','id','originalText','createdAt','updatedAt','completed','dismissed','note','localDeadline','audienceOverride','attachments'],['deadlineSpec']);
  if(record.schemaVersion!==5||id(record.id)!==expectedID||!Array.isArray(record.attachments)||record.attachments.length)throw new ServiceError('同步只接受第5版文字记录，附件留在本机。',400);
  boolean(record.dismissed);
  if(!D.date(record.updatedAt))throw new ServiceError('同步记录缺少更新时间。',400);
  if(!Array.isArray(record.tasks)||record.tasks.length>100||!Array.isArray(record.reminders)||record.reminders.length>100||!Array.isArray(record.timeline)||record.timeline.length>100)throw new ServiceError('同步记录项目数量过多。',400);
  for(const task of record.tasks){
    shape(task,['id','completed','dismissed','note','localDeadline','text','assignee','scope','condition','details','steps','time','timeText','location'],['timeSpec']);id(task.id);
    if(!Array.isArray(task.steps)||task.steps.length>10)throw new ServiceError('同步步骤不正确。',400);
    for(const step of task.steps){shape(step,['id','completed','note','text','details']);id(step.id);}
  }
  unique(record.tasks.map(task=>task.id));
  for(const reminder of record.reminders){shape(reminder,['id','text','note']);id(reminder.id);}
  unique(record.reminders.map(reminder=>reminder.id));
  for(const entry of record.timeline)shape(entry,['label','time','timeText','location'],['timeSpec']);
  try{
    D.notice({...record,schemaVersion:4,reminders:record.reminders.map(r=>r.text),reminderNotes:record.reminders.map(r=>r.note)});
  }catch{throw new ServiceError('同步记录的文字、时间或状态格式不正确。',400);}
  const json=JSON.stringify(record),bytes=Buffer.byteLength(json);
  if(bytes>RECORD_LIMIT)throw new ServiceError('单条通知超过64 KB，暂不能云同步。',413);
  return {json,bytes};
}

export async function createSyncService(config,options={}){
  const file=config.stateFile||'/var/lib/campus-inbox/sync.sqlite';
  if(!config.signingSecret||config.signingSecret.length<20)throw new Error('Sync signing secret is missing');
  if(file!==':memory:')await mkdir(dirname(file),{recursive:true,mode:0o700});
  const db=new DatabaseSync(file,{timeout:1000});
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA cache_size=-4096;
    CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY,identity TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (key_hash TEXT PRIMARY KEY,account INTEGER NOT NULL REFERENCES accounts(id),created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records (account INTEGER NOT NULL REFERENCES accounts(id),id TEXT NOT NULL,version INTEGER NOT NULL,json TEXT,bytes INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account,id));
    CREATE INDEX IF NOT EXISTS records_revision ON records(account,version);
    CREATE TABLE IF NOT EXISTS creation_usage (day TEXT NOT NULL,ip_hash TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(day,ip_hash));
    CREATE TABLE IF NOT EXISTS analysis_jobs (id TEXT PRIMARY KEY,account INTEGER NOT NULL REFERENCES accounts(id),request_id TEXT NOT NULL,input_hash TEXT NOT NULL,sources TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,result TEXT,error_code TEXT,bytes INTEGER NOT NULL,UNIQUE(account,request_id));
    CREATE INDEX IF NOT EXISTS jobs_owner_created ON analysis_jobs(account,created DESC,id DESC);`);
  if(file!==':memory:')await chmod(file,0o600);
  const stmt={
    findAccount:db.prepare('SELECT accounts.id,accounts.identity,accounts.revision FROM sessions JOIN accounts ON accounts.id=sessions.account WHERE sessions.key_hash=?'),
    findIdentity:db.prepare('SELECT id,revision FROM accounts WHERE identity=?'),
    accountCount:db.prepare('SELECT COUNT(*) AS count FROM accounts'),
    insertAccount:db.prepare('INSERT INTO accounts(identity) VALUES (?)'),
    insertSession:db.prepare('INSERT INTO sessions(key_hash,account,created) VALUES (?,?,?)'),
    pruneSessions:db.prepare('DELETE FROM sessions WHERE account=? AND key_hash NOT IN (SELECT key_hash FROM sessions WHERE account=? ORDER BY created DESC,rowid DESC LIMIT 20)'),
    account:db.prepare('SELECT revision FROM accounts WHERE id=?'),
    setRevision:db.prepare('UPDATE accounts SET revision=? WHERE id=?'),
    get:db.prepare('SELECT version,json,bytes FROM records WHERE account=? AND id=?'),
    write:db.prepare('INSERT INTO records(account,id,version,json,bytes) VALUES (?,?,?,?,?) ON CONFLICT(account,id) DO UPDATE SET version=excluded.version,json=excluded.json,bytes=excluded.bytes'),
    usage:db.prepare('SELECT COUNT(*) AS history,COUNT(json) AS live,COALESCE(SUM(bytes),0) AS bytes FROM records WHERE account=?'),
    global:db.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM records'),
    page:db.prepare('SELECT id,version,json FROM records WHERE account=? AND version>? ORDER BY version LIMIT ?'),
    creation:db.prepare('SELECT count FROM creation_usage WHERE day=? AND ip_hash=?'),
    countCreation:db.prepare('INSERT INTO creation_usage(day,ip_hash,count) VALUES (?,?,1) ON CONFLICT(day,ip_hash) DO UPDATE SET count=count+1'),
    pruneCreation:db.prepare('DELETE FROM creation_usage WHERE day<?'),
    jobRequest:db.prepare('SELECT * FROM analysis_jobs WHERE account=? AND request_id=?'),
    job:db.prepare('SELECT * FROM analysis_jobs WHERE account=? AND id=?'),
    jobs:db.prepare('SELECT * FROM analysis_jobs WHERE account=? ORDER BY created DESC,id DESC LIMIT 21'),
    jobsBefore:db.prepare('SELECT * FROM analysis_jobs WHERE account=? AND (created<? OR (created=? AND id<?)) ORDER BY created DESC,id DESC LIMIT 21'),
    jobUsage:db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(bytes),0) AS bytes,COALESCE(SUM(CASE WHEN status IN ('accepted','running') THEN 1 ELSE 0 END),0) AS pending FROM analysis_jobs WHERE account=?"),
    globalJobUsage:db.prepare("SELECT COALESCE(SUM(bytes),0) AS bytes,COALESCE(SUM(CASE WHEN status IN ('accepted','running') THEN 1 ELSE 0 END),0) AS pending FROM analysis_jobs"),
    insertJob:db.prepare("INSERT INTO analysis_jobs(id,account,request_id,input_hash,sources,status,created,updated,bytes) VALUES(?,?,?,?,?,'accepted',?,?,?)"),
    startJob:db.prepare("UPDATE analysis_jobs SET status='running',updated=? WHERE account=? AND id=? AND status='accepted'"),
    finishJob:db.prepare("UPDATE analysis_jobs SET status='completed',result=?,updated=?,bytes=?,error_code=NULL WHERE account=? AND id=? AND status IN ('accepted','running')"),
    stageJob:db.prepare("UPDATE analysis_jobs SET result=?,updated=?,bytes=? WHERE account=? AND id=? AND status IN ('accepted','running')"),
    restoreJob:db.prepare("UPDATE analysis_jobs SET status='running',updated=?,error_code=NULL WHERE account=? AND id=? AND status='failed' AND result IS NOT NULL"),
    failJob:db.prepare("UPDATE analysis_jobs SET status='failed',error_code=?,updated=? WHERE account=? AND id=? AND status IN ('accepted','running')"),
    recoverJobs:db.prepare("UPDATE analysis_jobs SET status='failed',error_code='SERVICE_RESTARTED',updated=? WHERE status IN ('accepted','running')")
  };
  const now=options.now||Date.now,rates=new Map();
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
  const transaction=operation=>{db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  // A dispatched provider request may have been charged before a process exit.
  // Preserve its text and mark it failed; startup must never send it again.
  transaction(()=>stmt.recoverJobs.run(new Date(now()).toISOString()));
  const update=row=>({id:row.id,version:row.version,record:row.json===null?null:JSON.parse(row.json)});
  // Only an internal, already verified login/invitation can provision a space.
  // This is not reachable by passing a provider/id in an HTTP request body.
  function provision(identity,ip='unknown'){
    if(!identity||identity.provider!=='invite'||typeof identity.subject!=='string'||!identity.subject.trim()||identity.subject.length>150)throw new Error('A verified account identity is required');
    const owner=identity.provider+':'+identity.subject;
    const day=today(),network=createHmac('sha256',config.signingSecret).update('sync-create:'+day+':'+ip).digest('hex');
    return transaction(()=>{
      let account=stmt.findIdentity.get(owner);
      if(!account){
        if((stmt.creation.get(day,network)?.count||0)>=10||(stmt.creation.get(day,'global')?.count||0)>=50)throw new ServiceError('今日同步空间创建次数已达上限，请明天再试。',429);
        if(stmt.accountCount.get().count>=ACCOUNT_LIMIT)throw new ServiceError('同步服务容量已满，请联系维护者。',507);
        const result=stmt.insertAccount.run(owner);account={id:Number(result.lastInsertRowid)};
        stmt.countCreation.run(day,network);stmt.countCreation.run(day,'global');stmt.pruneCreation.run(day);
      }
      const key=randomBytes(32).toString('base64url');
      stmt.insertSession.run(sha(key),account.id,now());stmt.pruneSessions.run(account.id,account.id);
      return {key};
    });
  }
  function exchange(account,body){
    shape(body,['cursor','changes']);integer(body.cursor);
    if(!Array.isArray(body.changes)||body.changes.length>100)throw new ServiceError('每次最多同步100条变更。',400);
    unique(body.changes.map(change=>id(change?.id)));
    const changes=body.changes.map(change=>{
      shape(change,['id','baseVersion','record']);integer(change.baseVersion);
      return {...change,...(change.record===null?{json:null,bytes:0}:validateCloudNotice(change.record,change.id))};
    });
    return transaction(()=>{
      let revision=stmt.account.get(account.id).revision;
      if(body.cursor>revision)throw new ServiceError('同步位置不正确，请退出后重新登录。',400);
      const usage=stmt.usage.get(account.id),reservedJobs=stmt.jobUsage.get(account.id).pending,globalReservedJobs=stmt.globalJobUsage.get().pending;let globalBytes=stmt.global.get().bytes;
      const accepted=[],conflicts=[];
      for(const change of changes){
        const current=stmt.get.get(account.id,change.id),version=current?.version||0;
        if(change.baseVersion!==version){conflicts.push({id:change.id,version,record:current?.json?JSON.parse(current.json):null});continue;}
        if(change.json===null&&!current||current&&current.json===change.json){accepted.push({id:change.id,version});continue;}
        const bytes=usage.bytes-(current?.bytes||0)+change.bytes,live=usage.live-(current?.json!==null&&current?1:0)+(change.json!==null?1:0);
        if(bytes+reservedJobs*JOB_BYTES>ACCOUNT_BYTES||live+reservedJobs*20>LIVE_LIMIT)throw new ServiceError('此账号最多同步1,000条通知、5 MB文字，正在整理的任务已预留空间。',507);
        if(!current&&usage.history+reservedJobs*20>=HISTORY_LIMIT)throw new ServiceError('同步历史记录已达上限，请先备份并联系维护者。',507);
        const nextGlobal=globalBytes-(current?.bytes||0)+change.bytes;
        if(nextGlobal+globalReservedJobs*JOB_BYTES>GLOBAL_BYTES)throw new ServiceError('同步服务容量已满，请联系维护者。',507);
        revision++;stmt.write.run(account.id,change.id,revision,change.json,change.bytes);
        usage.bytes=bytes;usage.live=live;if(!current)usage.history++;globalBytes=nextGlobal;accepted.push({id:change.id,version:revision});
      }
      stmt.setRevision.run(revision,account.id);
      const rows=stmt.page.all(account.id,body.cursor,PAGE_LIMIT+1),updates=[];let used=0,cursor=body.cursor;
      for(const row of rows){
        const item=update(row),size=Buffer.byteLength(JSON.stringify(item));
        if(updates.length>=PAGE_LIMIT||updates.length&&used+size>PAGE_BYTES)break;
        updates.push(item);used+=size;cursor=row.version;
      }
      const hasMore=rows.length>updates.length;
      return {cursor:hasMore?cursor:revision,updates,conflicts,accepted,hasMore};
    });
  }
  function jobView(row,detail=false){
    if(!row)return null;
    const output=row.result?JSON.parse(row.result):null;
    const view={id:row.id,requestId:row.request_id,status:row.status,createdAt:row.created,updatedAt:row.updated,
      noticeIds:output?(output.records?output.records.map(record=>record.id):output.notices.map((_,index)=>`ai-${row.id}-${index}`)):[],...(output?{sourceIndexes:output.sourceIndexes}:{}),...(row.status==='failed'&&output?{recoverableResult:true}:{})};
    if(row.error_code){view.code=Object.hasOwn(JOB_ERRORS,row.error_code)?row.error_code:'SERVICE_UNAVAILABLE';view.error=output&&row.status==='failed'?'整理结果已保留，但未保存到云端。可以重试保存，无需再次调用AI。':JOB_ERRORS[view.code];}
    // This is the original completed snapshot. Current user edits/deletions are
    // authoritative in /sync; clients must never restore this snapshot over them.
    if(detail){view.sources=JSON.parse(row.sources);if(output){view.records=output.records||jobResult(row,output).records;view.recordsAreSnapshot=true;}}
    return view;
  }
  function findJobRequest(account,requestID,inputHash){
    const row=stmt.jobRequest.get(account.id,requestID);
    if(row&&row.input_hash!==inputHash)throw new ServiceError('同一任务编号不能提交不同原文，请重新创建任务。',409);
    return jobView(row);
  }
  function acceptJob(account,requestID,inputHash,sources){
    return transaction(()=>{
      const existing=findJobRequest(account,requestID,inputHash);if(existing)return existing;
      checkJobCapacity(account);
      const id=randomUUID(),created=new Date(now()).toISOString(),json=JSON.stringify(sources),bytes=Buffer.byteLength(json);
      stmt.insertJob.run(id,account.id,requestID,inputHash,json,created,created,bytes);
      return jobView(stmt.job.get(account.id,id));
    });
  }
  function checkJobCapacity(account){
    const usage=stmt.jobUsage.get(account.id),global=stmt.globalJobUsage.get();
    if(usage.count>=JOB_LIMIT||usage.bytes+(usage.pending+1)*JOB_BYTES>ACCOUNT_JOB_BYTES||global.bytes+(global.pending+1)*JOB_BYTES>GLOBAL_JOB_BYTES)throw new ServiceError('整理任务保存空间已满，请联系维护者。',507);
    const cloud=stmt.usage.get(account.id);
    if(cloud.bytes+(usage.pending+1)*JOB_BYTES>ACCOUNT_BYTES||cloud.live+(usage.pending+1)*20>LIVE_LIMIT||cloud.history+(usage.pending+1)*20>HISTORY_LIMIT||stmt.global.get().bytes+(global.pending+1)*JOB_BYTES>GLOBAL_BYTES)throw new ServiceError('云通知空间不足，暂不能接收新的整理任务。',507);
  }
  function startJob(account,jobID){
    return transaction(()=>{
      const result=stmt.startJob.run(new Date(now()).toISOString(),account.id,jobID);
      if(result.changes!==1)throw new ServiceError('任务状态已改变，未重复调用AI。',409);
      return jobView(stmt.job.get(account.id,jobID));
    });
  }
  function jobResult(row,result){
      const sources=JSON.parse(row.sources),indexes=result.sourceIndexes||result.notices.map((_,index)=>sources.length===1?0:index);
      if(!Array.isArray(result.notices)||!result.notices.length||indexes.length!==result.notices.length||indexes.some((index,position)=>!Number.isSafeInteger(index)||index<0||index>=sources.length||position>0&&index<indexes[position-1])||new Set(indexes).size!==sources.length)throw new ServiceError('整理结果无法对应原文，未保存到云端。',502);
      const records=result.notices.map((notice,index)=>{
        const local=D.create(notice,sources[indexes[index]].text),id=`ai-${row.id}-${index}`;
        const {reminderNotes,...content}=local;
        return {...content,schemaVersion:5,id,createdAt:row.created,updatedAt:row.created,dismissed:false,
          tasks:local.tasks.map((task,taskIndex)=>({...task,id:`${id}-t-${taskIndex}`,steps:task.steps.map((step,stepIndex)=>({...step,id:`${id}-t-${taskIndex}-s-${stepIndex}`}))})),
          reminders:local.reminders.map((text,reminderIndex)=>({id:`${id}-r-${reminderIndex}`,text,note:''}))};
      });
      let output=JSON.stringify({records,sourceIndexes:indexes}),bytes=Buffer.byteLength(row.sources)+Buffer.byteLength(output);
      // Repeated originals and local progress/identity fields can expand an
      // otherwise valid, bounded provider result. Preserve its compact model
      // snapshot first; the same stable v5 records are rebuilt for /sync saving.
      if(bytes>JOB_BYTES){output=JSON.stringify({notices:result.notices,sourceIndexes:indexes});bytes=Buffer.byteLength(row.sources)+Buffer.byteLength(output);}
      if(bytes>JOB_BYTES)throw new ServiceError('整理结果过大，未保存到云端。',413);
      return {output,bytes,records};
  }
  function stageJob(account,jobID,result){
    return transaction(()=>{
      const row=stmt.job.get(account.id,jobID);
      if(!row)throw new ServiceError('整理任务不存在。',404);
      if(row.status==='completed'||row.result)return jobView(row);
      if(!['accepted','running'].includes(row.status))throw new ServiceError('整理任务已结束，未重复保存。',409);
      const {output,bytes}=jobResult(row,result);
      stmt.stageJob.run(output,new Date(now()).toISOString(),bytes,account.id,jobID);
      return jobView(stmt.job.get(account.id,jobID));
    });
  }
  function completeJob(account,jobID,result){
    return transaction(()=>{
      const row=stmt.job.get(account.id,jobID);
      if(!row)throw new ServiceError('整理任务不存在。',404);
      if(row.status==='completed')return jobView(row);
      if(!['accepted','running'].includes(row.status))throw new ServiceError('整理任务已结束，未重复保存。',409);
      const saved=row.result?JSON.parse(row.result):null;
      const prepared=saved?(saved.records?{output:row.result,bytes:row.bytes,records:saved.records}:jobResult(row,saved)):jobResult(row,result);
      const {output,bytes,records}=prepared;
      const values=records.map(record=>({...validateCloudNotice(record,record.id),id:record.id}));
      const usage=stmt.usage.get(account.id),otherPending=stmt.jobUsage.get(account.id).pending-1,otherGlobalPending=stmt.globalJobUsage.get().pending-1;
      let globalBytes=stmt.global.get().bytes,revision=stmt.account.get(account.id).revision;
      for(const value of values){
        // Never overwrite a user-created, modified or deleted cloud record.
        if(stmt.get.get(account.id,value.id))throw new ServiceError('云通知编号已存在，未覆盖已有内容。',409);
        if(usage.bytes+value.bytes+otherPending*JOB_BYTES>ACCOUNT_BYTES||usage.live+1+otherPending*20>LIVE_LIMIT||usage.history+1+otherPending*20>HISTORY_LIMIT||globalBytes+value.bytes+otherGlobalPending*JOB_BYTES>GLOBAL_BYTES)throw new ServiceError('云通知空间不足，结果未保存。',507);
        revision++;stmt.write.run(account.id,value.id,revision,value.json,value.bytes);usage.bytes+=value.bytes;usage.live++;usage.history++;globalBytes+=value.bytes;
      }
      stmt.setRevision.run(revision,account.id);
      stmt.finishJob.run(output,new Date(now()).toISOString(),bytes,account.id,jobID);
      return jobView(stmt.job.get(account.id,jobID));
    });
  }
  function retryJobSave(account,jobID){
    const row=stmt.job.get(account.id,jobID);
    if(!row)throw new ServiceError('整理任务不存在。',404);
    if(row.status==='completed')return jobView(row);
    if(row.status!=='failed'||!row.result)throw new ServiceError('此任务没有可恢复的整理结果。',409);
    transaction(()=>stmt.restoreJob.run(new Date(now()).toISOString(),account.id,jobID));
    try{return completeJob(account,jobID);}catch(error){failJob(account,jobID,'JOB_SAVE_FAILED');throw error;}
  }
  function failJob(account,jobID,code){
    const safeCode=Object.hasOwn(JOB_ERRORS,code)?code:'SERVICE_UNAVAILABLE';
    return transaction(()=>{stmt.failJob.run(safeCode,new Date(now()).toISOString(),account.id,jobID);return jobView(stmt.job.get(account.id,jobID));});
  }
  function listJobs(account,before){
    let rows;
    if(before){
      let cursor;try{if(before.length>500)throw 0;cursor=JSON.parse(Buffer.from(before,'base64url').toString());if(!Array.isArray(cursor)||cursor.length!==2||!D.date(cursor[0])||typeof cursor[1]!=='string'||!/^[0-9a-f-]{36}$/.test(cursor[1]))throw 0;}catch{throw new ServiceError('整理任务分页位置不正确。',400);}
      rows=stmt.jobsBefore.all(account.id,cursor[0],cursor[0],cursor[1]);
    }else rows=stmt.jobs.all(account.id);
    const hasMore=rows.length>20,jobs=rows.slice(0,20),last=jobs.at(-1);
    return {jobs:jobs.map(row=>jobView(row)),hasMore,...(hasMore?{nextBefore:Buffer.from(JSON.stringify([last.created,last.id])).toString('base64url')}:{})};
  }
  const jobs={findRequest:findJobRequest,checkCapacity:checkJobCapacity,accept:acceptJob,start:startJob,stage:stageJob,complete:completeJob,retrySave:retryJobSave,fail:failJob,list:listJobs,get:(account,id)=>jobView(stmt.job.get(account.id,id),true)};
  async function handle(request,ip='unknown'){
    const origin=request.headers.get('Origin'),accepted=(config.allowedOrigins||[]).includes(origin),path=new URL(request.url).pathname;
    const reply=(body,status=200,headers={})=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(accepted?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Expose-Headers':'Retry-After','Access-Control-Max-Age':'600'}:{}),...headers}});
    if(!['/sync','/sync/accounts'].includes(path))return reply({error:'接口不存在。'},404);
    if(!accepted)return reply({error:'此应用未获准同步。'},403);
    if(request.method==='OPTIONS')return reply({},204);
    if(request.method!=='POST')return reply({error:'请使用POST同步。'},405);
    if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return reply({error:'同步请求必须使用JSON。'},415);
    try{
      let account;
      if(path==='/sync'){
        const key=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
        const identity=key&&options.authenticate?await options.authenticate(key):null;
        account=identity?.provider==='invite'?stmt.findAccount.get(sha(key)):null;
        if(account&&account.identity!=='invite:'+identity.subject)account=null;
        if(!account)return reply({error:'登录状态已失效，请重新登录后同步。'},401);
        const t=now(),times=(rates.get(account.id)||[]).filter(time=>t-time<60000);
        if(times.length>=60)return reply({error:'同步过于频繁，请稍后再试。'},429,{'Retry-After':String(Math.max(1,Math.ceil((times[0]+60000-t)/1000)))});
        times.push(t);rates.set(account.id,times);
        for(const [id,entries] of rates)if(!entries.some(time=>t-time<60000))rates.delete(id);
      }
      let body;
      try{body=JSON.parse(await boundedText(request.body,path==='/sync/accounts'?1024:BODY_LIMIT));}catch(error){if(error.status===413)throw new ServiceError('同步内容过大，请分批同步。',413);throw new ServiceError('同步请求不是有效JSON。',400);}
      if(path==='/sync/accounts')return reply({error:'请先通过已验证的登录或邀请连接同步，不能匿名创建空间。'},403);
      return reply(exchange(account,body));
    }catch(error){return reply({error:error instanceof ServiceError?error.message:'同步暂时不可用，请稍后重试。'},error.status||503);}
  }
  return {handle,provision,jobs,accountForKey:key=>typeof key==='string'&&/^[A-Za-z0-9_-]{43}$/.test(key)?stmt.findAccount.get(sha(key))||null:null,close:()=>db.close()};
}
