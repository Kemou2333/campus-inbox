import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {mkdir,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
import {boundedText,ServiceError} from './analyze.mjs';

const D=globalThis.CampusData;
const BODY_LIMIT=1024*1024,RECORD_LIMIT=64*1024,ACCOUNT_BYTES=5*1024*1024,GLOBAL_BYTES=256*1024*1024;
const LIVE_LIMIT=1000,HISTORY_LIMIT=5000,ACCOUNT_LIMIT=500,PAGE_LIMIT=100,PAGE_BYTES=512*1024;
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
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-4096;
    CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY,identity TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (key_hash TEXT PRIMARY KEY,account INTEGER NOT NULL REFERENCES accounts(id),created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records (account INTEGER NOT NULL REFERENCES accounts(id),id TEXT NOT NULL,version INTEGER NOT NULL,json TEXT,bytes INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account,id));
    CREATE INDEX IF NOT EXISTS records_revision ON records(account,version);
    CREATE TABLE IF NOT EXISTS creation_usage (day TEXT NOT NULL,ip_hash TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(day,ip_hash));`);
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
    pruneCreation:db.prepare('DELETE FROM creation_usage WHERE day<?')
  };
  const now=options.now||Date.now,rates=new Map();
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
  const transaction=operation=>{db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
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
      const usage=stmt.usage.get(account.id);let globalBytes=stmt.global.get().bytes;
      const accepted=[],conflicts=[];
      for(const change of changes){
        const current=stmt.get.get(account.id,change.id),version=current?.version||0;
        if(change.baseVersion!==version){conflicts.push({id:change.id,version,record:current?.json?JSON.parse(current.json):null});continue;}
        if(change.json===null&&!current||current&&current.json===change.json){accepted.push({id:change.id,version});continue;}
        const bytes=usage.bytes-(current?.bytes||0)+change.bytes,live=usage.live-(current?.json!==null&&current?1:0)+(change.json!==null?1:0);
        if(bytes>ACCOUNT_BYTES||live>LIVE_LIMIT)throw new ServiceError('此账号最多同步1,000条通知、5 MB文字，请减少后再同步。',507);
        if(!current&&usage.history>=HISTORY_LIMIT)throw new ServiceError('同步历史记录已达上限，请先备份并联系维护者。',507);
        const nextGlobal=globalBytes-(current?.bytes||0)+change.bytes;
        if(nextGlobal>GLOBAL_BYTES)throw new ServiceError('同步服务容量已满，请联系维护者。',507);
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
  return {handle,provision,accountForKey:key=>typeof key==='string'&&/^[A-Za-z0-9_-]{43}$/.test(key)?stmt.findAccount.get(sha(key))||null:null,close:()=>db.close()};
}
