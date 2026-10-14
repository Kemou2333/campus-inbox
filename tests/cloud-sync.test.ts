import {describe,expect,test} from 'vitest';
import {createNotice,updateNote} from '../src/domain/notice';
import type {Notice,NoticeAnalysis} from '../src/domain/types';
import {LocalRepository} from '../src/infrastructure/local-repository';
import {createCloudSync} from '../src/infrastructure/sync-client';

class MemoryStorage{
 data=new Map<string,string>();
 getItem(key:string){return this.data.get(key)??null;}
 setItem(key:string,value:string){this.data.set(key,value);}
 removeItem(key:string){this.data.delete(key);}
}
type Row={id:string;version:number;record:Notice|null};
type Body={cursor:number;changes:{id:string;baseVersion:number;record:Notice|null}[]};
const analysis:NoticeAnalysis={schemaVersion:4,kind:'information',title:'关闭前保存检查',summary:'虚构通知，仅测试本机保存与云端确认。',deadline:null,deadlineText:'',timeline:[],tasks:[],materials:[],warnings:[],reminders:[]};
const record=()=>createNotice(analysis,'虚构校内通知。','2026-10-14T00:00:00Z');
class AcknowledgementServer{
 key='B'.repeat(43);revision=0;rows=new Map<string,Row>();requests:{body:Body;keepalive:boolean|undefined;bytes:number;characters:number}[]=[];
 dropNextReply=false;beforeReply:(()=>void|Promise<void>)|null=null;
 fetch=(async(_input:RequestInfo|URL,init?:RequestInit)=>{
  const raw=String(init?.body),body=JSON.parse(raw) as Body;
  this.requests.push({body:structuredClone(body),keepalive:init?.keepalive,bytes:new TextEncoder().encode(raw).length,characters:raw.length});
  const accepted:{id:string;version:number}[]=[],conflicts:Row[]=[];
  for(const change of body.changes){
   const old=this.rows.get(change.id);
   if(change.baseVersion!==(old?.version??0)){conflicts.push(structuredClone(old!));continue;}
   const next={id:change.id,version:++this.revision,record:structuredClone(change.record)};
   this.rows.set(change.id,next);accepted.push({id:next.id,version:next.version});
  }
  const reply={cursor:this.revision,accepted,conflicts,hasMore:false,updates:[...this.rows.values()].filter(row=>row.version>body.cursor).map(row=>structuredClone(row))};
  const hook=this.beforeReply;this.beforeReply=null;await hook?.();
  if(this.dropNextReply){this.dropNextReply=false;throw new TypeError('Synthetic connection closed after durable acceptance');}
  return Response.json(reply);
 }) as typeof fetch;
}
function device(server:AcknowledgementServer,records:Notice[]=[]){
 const storage=new MemoryStorage(),repository=new LocalRepository(storage);repository.load();repository.save(records);
 const sync=createCloudSync(repository,'https://isolated.example.test/sync',{storage,fetch:server.fetch});
 return {storage,repository,sync};
}

describe('closing and acknowledgement boundaries',()=>{
 test('small text changes opt into keepalive after removing device-only attachments',async()=>{
  const server=new AcknowledgementServer(),n={...record(),attachments:['device-only-large-file']},d=device(server,[n]);await d.sync.connect(server.key);
  expect(server.requests[0].keepalive).toBe(true);expect(server.requests[0].bytes).toBeLessThanOrEqual(60_000);
  expect(server.requests[0].body.changes[0].record?.attachments).toEqual([]);expect(d.repository.load()[0].attachments).toEqual(['device-only-large-file']);
  expect(d.sync.getState()).toMatchObject({status:'idle',pendingChanges:0});
 });
 test('UTF-8 size disables keepalive for a valid record above the browser exit budget',async()=>{
  const server=new AcknowledgementServer(),large=createNotice({...analysis,warnings:Array(9).fill('中'.repeat(1990))},'文'.repeat(2000),'2026-10-14T00:00:00Z'),d=device(server,[large]);await d.sync.connect(server.key);
  const sent=server.requests[0];expect(sent.characters).toBeLessThan(60_000);expect(sent.bytes).toBeGreaterThan(60_000);expect(new TextEncoder().encode(JSON.stringify(sent.body.changes[0].record)).length).toBeLessThan(65_536);
  expect(sent.keepalive).toBe(false);expect(d.repository.load()[0].originalText).toBe(large.originalText);expect(d.sync.getState().pendingChanges).toBe(0);
 });
 test('a durable server write with a lost ACK converges after reopening without duplicating or losing progress',async()=>{
  const server=new AcknowledgementServer(),d=device(server);await d.sync.connect(server.key);
  const n={...updateNote(record(),{type:'notice'},'关闭前保存的笔记'),attachments:['local-file']};d.repository.save([n]);server.dropNextReply=true;await d.sync.syncNow();
  expect(d.sync.getState()).toMatchObject({status:'offline',pendingChanges:1});expect(server.rows.size).toBe(1);expect(server.revision).toBe(1);
  const reopenedRepository=new LocalRepository(d.storage);reopenedRepository.load();const reopened=createCloudSync(reopenedRepository,'https://isolated.example.test/sync',{storage:d.storage,fetch:server.fetch});
  await reopened.syncNow();expect(reopened.getState()).toMatchObject({status:'idle',pendingChanges:0,conflicts:[]});expect(server.rows.size).toBe(1);expect(server.revision).toBe(1);
  expect(reopenedRepository.load()[0]).toMatchObject({id:n.id,note:'关闭前保存的笔记',originalText:n.originalText,attachments:['local-file']});
 });
 test('editing after an unknown ACK retains the new local note as an explicit conflict after reopening',async()=>{
  const server=new AcknowledgementServer(),d=device(server);await d.sync.connect(server.key);const n=record();d.repository.save([n]);server.dropNextReply=true;await d.sync.syncNow();
  const latest=updateNote(d.repository.load()[0],{type:'notice'},'未收到确认后追加的笔记');d.repository.save([latest]);
  const repository=new LocalRepository(d.storage);repository.load();const reopened=createCloudSync(repository,'https://isolated.example.test/sync',{storage:d.storage,fetch:server.fetch});await reopened.syncNow();
  expect(repository.load()[0].note).toBe(latest.note);expect(reopened.getState().conflicts).toHaveLength(1);expect(server.rows.get(n.id)?.record?.note).toBe('');
  await reopened.resolveConflict(n.id,'local');expect(server.rows.get(n.id)?.record?.note).toBe(latest.note);expect(server.rows.size).toBe(1);expect(reopened.getState().conflicts).toEqual([]);
 });
 test('a late response after disconnect cannot reattach a session or replace a newer local edit',async()=>{
  const server=new AcknowledgementServer(),d=device(server);await d.sync.connect(server.key);const n=record();d.repository.save([n]);
  let release!:()=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{started=resolve;});server.beforeReply=async()=>{started();await waiting;};
  const request=d.sync.syncNow();await entered;d.repository.save([updateNote(n,{type:'notice'},'退出后保留在本机的修改')]);d.sync.disconnect();release();await request;
  expect(d.sync.getKey()).toBeNull();expect(d.sync.getState().connected).toBe(false);expect(d.repository.load()[0].note).toBe('退出后保留在本机的修改');
  const reopened=createCloudSync(d.repository,'https://isolated.example.test/sync',{storage:d.storage,fetch:server.fetch});expect(reopened.getKey()).toBeNull();
 });
});
