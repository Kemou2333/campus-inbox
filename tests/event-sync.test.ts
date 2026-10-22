import {afterEach,expect,test,vi} from 'vitest';
import {createNotice,updateNote} from '../src/domain/notice';
import type {NoticeAnalysis} from '../src/domain/types';
import {LocalRepository} from '../src/infrastructure/local-repository';
import {createCloudSync} from '../src/infrastructure/sync-client';
import {installEventSync} from '../src/infrastructure/event-sync';
import {createPendingJobPolling} from '../src/infrastructure/pending-job-polling';

const analysis:NoticeAnalysis={schemaVersion:4,kind:'information',title:'课程安排',summary:'课程资源已经开放。',deadline:null,deadlineText:'',timeline:[],tasks:[],materials:[],warnings:[],reminders:['查看课程资源。']};
class MemoryStorage {data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}}
async function setup(){
 const storage=new MemoryStorage(),repository=new LocalRepository(storage);repository.load();repository.save([createNotice(analysis,'课程通知')]);
 let revision=0,failed=false;
 const requests:unknown[]=[];
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body));requests.push(body);
  if(failed)throw new TypeError('offline');
  const accepted=body.changes.map((row:{id:string})=>({id:row.id,version:++revision}));
  return Response.json({cursor:revision,accepted,updates:[],conflicts:[],hasMore:false});
 });
 const sync=createCloudSync(repository,'https://example.test/sync',{storage,fetch:fetcher as typeof fetch});await sync.connect('A'.repeat(43));
 return {repository,sync,requests,fetcher,setFailed:(value:boolean)=>{failed=value;}};
}
afterEach(()=>vi.useRealTimers());

test('idle/focus and unchanged or attachment-only saves stay quiet; a real edit uploads once',async()=>{
 const d=await setup();vi.useFakeTimers();const events=new EventTarget(),stop=installEventSync(d.repository,d.sync,events);
 const count=d.fetcher.mock.calls.length;
 events.dispatchEvent(new Event('focus'));events.dispatchEvent(new Event('visibilitychange'));events.dispatchEvent(new Event('online'));
 await vi.advanceTimersByTimeAsync(600_000);expect(d.fetcher).toHaveBeenCalledTimes(count);
 d.repository.save(d.repository.load());
 d.repository.save(d.repository.load().map(n=>({...n,attachments:['device-only-image']})));
 await vi.advanceTimersByTimeAsync(500);expect(d.fetcher).toHaveBeenCalledTimes(count);
 const record=d.repository.load()[0];d.repository.save([updateNote(record,{type:'notice'},'新笔记')]);
 await vi.advanceTimersByTimeAsync(299);expect(d.fetcher).toHaveBeenCalledTimes(count);
 await vi.advanceTimersByTimeAsync(1);expect(d.fetcher).toHaveBeenCalledTimes(count+1);
 expect(d.requests.at(-1)).toMatchObject({changes:[{record:{note:'新笔记',attachments:[]}}]});
 await vi.advanceTimersByTimeAsync(600_000);expect(d.fetcher).toHaveBeenCalledTimes(count+1);stop();
});

test('failed local upload waits for a relevant event; online retries only outstanding data',async()=>{
 const d=await setup();vi.useFakeTimers();const events=new EventTarget(),stop=installEventSync(d.repository,d.sync,events);d.setFailed(true);
 d.repository.save([updateNote(d.repository.load()[0],{type:'notice'},'离线笔记')]);
 await vi.advanceTimersByTimeAsync(300);expect(d.sync.getState().status).toBe('offline');const failedCount=d.fetcher.mock.calls.length;
 await vi.advanceTimersByTimeAsync(600_000);expect(d.fetcher).toHaveBeenCalledTimes(failedCount);
 d.setFailed(false);events.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(300);
 expect(d.fetcher).toHaveBeenCalledTimes(failedCount+1);expect(d.sync.needsSync()).toBe(false);
 events.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(300);expect(d.fetcher).toHaveBeenCalledTimes(failedCount+1);stop();
});

test('a cloud update saved to the repository does not cause an empty echo request',async()=>{
 const d=await setup();vi.useFakeTimers();const events=new EventTarget(),stop=installEventSync(d.repository,d.sync,events);
 const original=d.repository.load()[0];d.fetcher.mockImplementationOnce(async()=>Response.json({cursor:9,accepted:[],updates:[{id:original.id,version:9,record:{...original,note:'其他入口更新',attachments:[]}}],conflicts:[],hasMore:false}));
 await d.sync.syncNow();const count=d.fetcher.mock.calls.length;
 expect(d.repository.load()[0].note).toBe('其他入口更新');await vi.advanceTimersByTimeAsync(600_000);expect(d.fetcher).toHaveBeenCalledTimes(count);stop();
});

test('slow paginated sync uploads an edit made in flight without scheduling an empty rerun',async()=>{
 const d=await setup();vi.useFakeTimers();const stop=installEventSync(d.repository,d.sync,new EventTarget());
 const before=d.fetcher.mock.calls.length,bodies:{changes:{id:string;record:{note:string}}[]}[]=[];let round=0;
 d.fetcher.mockImplementation(async(_url,init)=>{
  const body=JSON.parse(String(init?.body));bodies.push(body);const current=++round;
  if(current===1)return Response.json({cursor:2,accepted:[],updates:[],conflicts:[],hasMore:true});
  if(current<=3)await new Promise(resolve=>setTimeout(resolve,1_000));
  return Response.json({cursor:current===2?3:4,accepted:body.changes.map((change:{id:string})=>({id:change.id,version:4})),updates:[],conflicts:[],hasMore:false});
 });
 const running=d.sync.syncNow();await vi.advanceTimersByTimeAsync(100);
 d.repository.save([updateNote(d.repository.load()[0],{type:'notice'},'同步过程中新增')]);
 await vi.advanceTimersByTimeAsync(2_100);await running;
 expect(bodies).toHaveLength(3);expect(bodies[0].changes).toEqual([]);expect(bodies[1].changes).toEqual([]);
 expect(bodies[2].changes).toMatchObject([{record:{note:'同步过程中新增'}}]);expect(d.sync.needsSync()).toBe(false);
 await vi.advanceTimersByTimeAsync(60_000);expect(d.fetcher).toHaveBeenCalledTimes(before+3);stop();
});

test('job history is read once while idle; only pending work keeps polling',async()=>{
 vi.useFakeTimers();const windowEvents=new EventTarget(),documentEvents=new EventTarget();let visible=true;
 const refresh=vi.fn(async()=>{}),polling=createPendingJobPolling({refresh,visible:()=>visible,windowEvents,documentEvents});polling.start();await vi.advanceTimersByTimeAsync(0);
 expect(refresh).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(600_000);
 for(const kind of ['focus','online'])windowEvents.dispatchEvent(new Event(kind));documentEvents.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0);expect(refresh).toHaveBeenCalledTimes(1);
 polling.setPending(true);await vi.advanceTimersByTimeAsync(5_000);expect(refresh).toHaveBeenCalledTimes(2);
 visible=false;documentEvents.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(60_000);expect(refresh).toHaveBeenCalledTimes(2);
 visible=true;refresh.mockImplementationOnce(async()=>{polling.setPending(false);});documentEvents.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0);expect(refresh).toHaveBeenCalledTimes(3);
 await vi.advanceTimersByTimeAsync(600_000);expect(refresh).toHaveBeenCalledTimes(3);polling.dispose();
});
