import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSyncService} from '../sync.mjs';

const origin='https://kemou2333.github.io',secret='test-signing-secret-not-a-real-server-credential';
function notice(id='notice-1',title='办理登记'){
  return {schemaVersion:5,id,kind:'task',title,summary:'按通知办理登记。',deadline:null,deadlineText:'',timeline:[],tasks:[{id:'task-1',text:'填写登记',assignee:null,scope:'all',condition:'',details:[],steps:[{id:'step-1',text:'提交资料',details:[],completed:false,note:'步骤笔记'}],time:null,timeText:'',location:null,completed:false,dismissed:false,note:'事项笔记',localDeadline:null}],materials:[],warnings:[],reminders:[],originalText:'请按要求完成登记。',createdAt:'2026-10-06T09:00:00+08:00',updatedAt:'2026-10-06T09:01:00+08:00',completed:false,dismissed:false,note:'通知笔记',localDeadline:null,audienceOverride:'',attachments:[]};
}
function request(path,body,key,from=origin){return new Request('https://api.example.test'+path,{method:'POST',headers:{Origin:from,'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body)});}
async function fixture(options={}){
  const identities=options.identities||new Map();
  const service=await createSyncService({signingSecret:secret,allowedOrigins:[origin],stateFile:options.file||':memory:'},{authenticate:key=>identities.get(key)||null,now:options.now});
  const create=(subject='user-1',ip='network-1')=>{const identity={provider:'invite',subject},result=service.provision(identity,ip);identities.set(result.key,identity);return result.key;};
  const key=options.key||create();
  const post=(body,token=key,ip='network-1')=>service.handle(request('/sync',body,token),ip);
  return {service,identities,key,create,post,close:()=>service.close()};
}

test('public anonymous creation is disabled and a device session must be authenticated',async()=>{
  const f=await fixture();
  try{
    assert.equal((await f.service.handle(request('/sync/accounts',{}))).status,403);
    assert.equal((await f.post({cursor:0,changes:[]},null)).status,401);
    assert.equal((await f.post({cursor:0,changes:[]},'x'.repeat(43))).status,401);
    f.identities.delete(f.key);assert.equal((await f.post({cursor:0,changes:[]})).status,401);
    assert.equal((await f.service.handle(request('/sync',{cursor:0,changes:[]},f.key,'https://untrusted.example'))).status,403);
  }finally{f.close();}
});
test('one verified identity maps multiple devices to one space; different identities stay isolated',async()=>{
  const f=await fixture();
  try{
    const second=f.create(),other=f.create('another-user','network-2');
    const source=notice();
    assert.equal((await f.post({cursor:0,changes:[{id:source.id,baseVersion:0,record:source}]})).status,200);
    const pulled=await (await f.post({cursor:0,changes:[]},second)).json();
    assert.deepEqual(pulled.updates[0].record,source);
    assert.deepEqual((await (await f.post({cursor:0,changes:[]},other)).json()).updates,[]);
    assert.equal(f.service.accountForKey(second).id,f.service.accountForKey(f.key).id);
    f.identities.set(second,{provider:'invite',subject:'another-user'});
    assert.equal((await f.post({cursor:0,changes:[]},second)).status,401);
  }finally{f.close();}
});
test('CAS rejects stale edits but accepts independent cards; it keeps source, IDs and timestamps intact',async()=>{
  const f=await fixture();
  try{
    const a=notice('a'),b=notice('b','另一条通知');
    const first=await (await f.post({cursor:0,changes:[{id:'a',baseVersion:0,record:a}]})).json();
    assert.deepEqual(first.accepted,[{id:'a',version:1}]);assert.deepEqual(first.updates[0].record,a);
    const edited={...a,note:'设备A的新笔记'};
    const next=await (await f.post({cursor:1,changes:[{id:'a',baseVersion:1,record:edited}]})).json();
    assert.equal(next.accepted[0].version,2);
    const stale=await (await f.post({cursor:1,changes:[{id:'a',baseVersion:1,record:{...a,note:'设备B旧笔记'}},{id:'b',baseVersion:0,record:b}]})).json();
    assert.deepEqual(stale.conflicts,[{id:'a',version:2,record:edited}]);
    assert.deepEqual(stale.accepted,[{id:'b',version:3}]);
    assert.deepEqual(stale.updates.find(x=>x.id==='a').record,edited);
  }finally{f.close();}
});
test('deletions are tombstones, stale devices cannot resurrect them, and unknown deletions are no-ops',async()=>{
  const f=await fixture();
  try{
    const record=notice();await f.post({cursor:0,changes:[{id:record.id,baseVersion:0,record}]});
    const deleted=await (await f.post({cursor:1,changes:[{id:record.id,baseVersion:1,record:null}]})).json();
    assert.deepEqual(deleted.updates,[{id:record.id,version:2,record:null}]);
    const stale=await (await f.post({cursor:0,changes:[{id:record.id,baseVersion:1,record}]})).json();
    assert.deepEqual(stale.conflicts,[{id:record.id,version:2,record:null}]);
    const noop=await (await f.post({cursor:2,changes:[{id:'never-synced',baseVersion:0,record:null}]})).json();
    assert.deepEqual(noop.accepted,[{id:'never-synced',version:0}]);assert.equal(noop.cursor,2);
  }finally{f.close();}
});
test('boundary rejects binaries, unknown fields, duplicate IDs, oversized input and future cursors without writing',async()=>{
  const f=await fixture();
  try{
    for(const record of [{...notice(),attachments:['file-1']},{...notice(),blob:'binary'},{...notice(),reminders:[{id:'r',text:'提醒',note:'',data:'binary'}]}]){
      assert.equal((await f.post({cursor:0,changes:[{id:record.id,baseVersion:0,record}]})).status,400);
    }
    assert.equal((await f.post({cursor:1,changes:[]})).status,400);
    assert.equal((await f.post({cursor:0,changes:Array.from({length:101},(_,i)=>({id:'n'+i,baseVersion:0,record:null}))})).status,400);
    assert.equal((await f.post({cursor:0,changes:[{id:'a',baseVersion:0,record:null},{id:'a',baseVersion:0,record:null}]})).status,400);
    const large={...notice(),warnings:Array(40).fill('字'.repeat(2000))};
    assert.equal((await f.post({cursor:0,changes:[{id:large.id,baseVersion:0,record:large}]})).status,413);
    assert.equal((await f.post({cursor:0,changes:[],padding:'x'.repeat(1024*1024)})).status,413);
    assert.deepEqual((await (await f.post({cursor:0,changes:[]})).json()).updates,[]);
  }finally{f.close();}
});
test('parameters keep SQL-like IDs as ordinary text',async()=>{
  const f=await fixture();
  try{
    const record=notice("x'); DROP TABLE accounts; --");
    const out=await (await f.post({cursor:0,changes:[{id:record.id,baseVersion:0,record}]})).json();
    assert.equal(out.updates[0].id,record.id);assert.ok(f.service.accountForKey(f.key));
  }finally{f.close();}
});
test('incremental pages carry accepted acknowledgements and finish without gaps or duplicates',async()=>{
  const f=await fixture();
  try{
    for(let start=0;start<150;start+=50){
      const changes=Array.from({length:50},(_,i)=>{const record=notice('p'+(start+i));return {id:record.id,baseVersion:0,record};});
      const out=await (await f.post({cursor:0,changes})).json();assert.equal(out.accepted.length,50);
    }
    const first=await (await f.post({cursor:0,changes:[]})).json();assert.equal(first.updates.length,100);assert.equal(first.cursor,100);assert.equal(first.hasMore,true);
    const last=await (await f.post({cursor:first.cursor,changes:[]})).json();assert.equal(last.updates.length,50);assert.equal(last.cursor,150);assert.equal(last.hasMore,false);
    assert.equal(new Set([...first.updates,...last.updates].map(x=>x.id)).size,150);
  }finally{f.close();}
});
test('page byte limit also applies when fewer than a hundred large notices are updated',async()=>{
  const f=await fixture();
  try{
    const changes=Array.from({length:40},(_,i)=>{const record={...notice('large'+i),note:'a'.repeat(4000),warnings:Array(8).fill('b'.repeat(2000))};return {id:record.id,baseVersion:0,record};});
    assert.ok(Buffer.byteLength(JSON.stringify({cursor:0,changes}))<1024*1024);
    const first=await (await f.post({cursor:0,changes})).json();assert.equal(first.accepted.length,40);assert.equal(first.hasMore,true);assert.ok(first.updates.length<40);
    assert.ok(Buffer.byteLength(JSON.stringify(first.updates))<513*1024);
    const next=await (await f.post({cursor:first.cursor,changes:[]})).json();assert.equal(next.hasMore,false);assert.equal(first.updates.length+next.updates.length,40);
  }finally{f.close();}
});
test('a capacity failure rolls back the whole valid batch, leaving old records unchanged',async()=>{
  const f=await fixture();
  try{
    for(let start=0;start<999;start+=100){
      const changes=Array.from({length:Math.min(100,999-start)},(_,i)=>{const record=notice('capacity'+(start+i));return {id:record.id,baseVersion:0,record};});
      assert.equal((await f.post({cursor:0,changes})).status,200);
    }
    const changes=['new-a','new-b'].map(id=>({id,baseVersion:0,record:notice(id)}));
    assert.equal((await f.post({cursor:999,changes})).status,507);
    const after=await (await f.post({cursor:999,changes:[]})).json();assert.equal(after.cursor,999);assert.deepEqual(after.updates,[]);
  }finally{f.close();}
});
test('per-account sync rate frees after a minute; independent spaces keep their own rate',async()=>{
  let time=Date.parse('2026-10-06T01:00:00Z');const f=await fixture({now:()=>time});
  try{
    for(let i=0;i<60;i++)assert.equal((await f.post({cursor:0,changes:[]})).status,200);
    assert.equal((await f.post({cursor:0,changes:[]})).status,429);
    const other=f.create('rate-other','network-2');assert.equal((await f.post({cursor:0,changes:[]},other)).status,200);
    time+=60000;assert.equal((await f.post({cursor:0,changes:[]})).status,200);
  }finally{f.close();}
});
test('verified account creation is limited but login to an existing identity does not create another space',async()=>{
  const f=await fixture();
  try{
    for(let i=2;i<=10;i++)f.create('user-'+i);
    assert.throws(()=>f.create('user-11'),error=>error.status===429);
    assert.equal(f.service.accountForKey(f.create('user-1')).id,f.service.accountForKey(f.key).id);
  }finally{f.close();}
});
test('SQLite survives restart and never stores raw bearer keys or raw IPs',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-sync-')),file=join(directory,'sync.sqlite');let f;
  try{
    f=await fixture({file});const key=f.key,identities=f.identities;
    const record=notice();await f.post({cursor:0,changes:[{id:record.id,baseVersion:0,record}]},key,'private-raw-network');f.close();f=null;
    const stored=await readFile(file);assert.equal(stored.includes(Buffer.from(key)),false);assert.equal(stored.includes(Buffer.from('network-1')),false);assert.equal(stored.includes(Buffer.from('private-raw-network')),false);
    f=await fixture({file,key,identities});assert.deepEqual((await (await f.post({cursor:0,changes:[]})).json()).updates[0].record,record);
  }finally{f?.close();await rm(directory,{recursive:true,force:true});}
});
