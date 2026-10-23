import {afterEach,describe,expect,test,vi} from 'vitest';
import {createGuestDemoNotice,GUEST_DEMO_MARKER,GUEST_DEMO_SOURCE,GUEST_DEMO_SOURCES,isGuestDemoDraft,nextGuestDemoSource,waitForGuestDemo} from './guest-demo';
import {LocalDemoRepository,LOCAL_DEMOS_KEY} from './local-demo-repository';
import {LocalRepository} from './local-repository';
import {CloudSync} from './sync-client';
import {isLocalDemoNotice} from '../domain/local-demo';
import primaryDemo from '../features/onboarding/demo-notice.json';
import extraDemos from '../features/onboarding/guest-demo-notices.json';

const memory=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};};
afterEach(()=>vi.useRealTimers());
describe('explicit guest sample',()=>{
 test('requires the exact filled text, explicit marker, and no attachments',()=>{
  const draft={text:GUEST_DEMO_SOURCE,attachments:[],demo:GUEST_DEMO_MARKER};
  expect(isGuestDemoDraft(draft)).toBe(true);
  expect(isGuestDemoDraft({...draft,text:`${draft.text}新增条件`})).toBe(false);
  expect(isGuestDemoDraft({...draft,attachments:['local-file']})).toBe(false);
  expect(isGuestDemoDraft({text:GUEST_DEMO_SOURCE,attachments:[]})).toBe(false);
 });
 test('starts with evaluation and cycles all eight reviewed originals without repeats',()=>{
  const storage=memory(),sources=Array.from({length:GUEST_DEMO_SOURCES.length},()=>nextGuestDemoSource(storage,()=>.5));
  expect(sources[0]).toBe(GUEST_DEMO_SOURCE);
  expect(new Set(sources)).toEqual(new Set(GUEST_DEMO_SOURCES));
  expect(GUEST_DEMO_SOURCES).toHaveLength(8);
  expect(nextGuestDemoSource(storage,()=>.5)).not.toBe(sources.at(-1));
  expect(GUEST_DEMO_SOURCES.map((text,index)=>{
   expect(isGuestDemoDraft({text,attachments:[],demo:GUEST_DEMO_MARKER})).toBe(true);
   expect(isGuestDemoDraft({text,attachments:[]})).toBe(false);
   const result=createGuestDemoNotice(String(index),text);expect(result.originalText).toBe(text);return result.title;
  })).toEqual(['本科生评教','篮球队招新','SRTP项目申报','军训宿舍安全','助学贷款入账','操作系统训练营','班干部竞选面试','高数II-1网课']);
  expect(()=>createGuestDemoNotice('edited','已修改的示例')).toThrow('示例已修改');
 });
 test('exact previously filled samples remain free while personal edits and attachments do not match',()=>{
  for(const fixture of [primaryDemo,...extraDemos])for(const old of fixture.legacyOriginalTexts){
   const draft={text:old.text,attachments:[],demo:GUEST_DEMO_MARKER};
   expect(isGuestDemoDraft(draft)).toBe(true);
   expect(createGuestDemoNotice('old-draft',old.text).originalText).toBe(fixture.notice.originalText);
   expect(isGuestDemoDraft({...draft,demo:undefined})).toBe(false);
   expect(isGuestDemoDraft({...draft,text:old.text+' 我的补充'})).toBe(false);
   expect(isGuestDemoDraft({...draft,attachments:['user-file']})).toBe(false);
  }
 });
 test('persists its remaining deck, respects the old next sample, and works without storage',()=>{
  const storage=memory();storage.setItem('campus-inbox:guest-demo-next:v1','1');
  expect(nextGuestDemoSource(storage,()=>.1)).toBe(GUEST_DEMO_SOURCES[1]);
  const reopened={getItem:storage.getItem,setItem:storage.setItem};
  const remaining=Array.from({length:GUEST_DEMO_SOURCES.length-1},()=>nextGuestDemoSource(reopened,()=>.1));
  expect(remaining).not.toContain(GUEST_DEMO_SOURCES[1]);expect(new Set(remaining).size).toBe(7);
  const restricted={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
  const session=Array.from({length:GUEST_DEMO_SOURCES.length},()=>nextGuestDemoSource(restricted,()=>.1));
  expect(session[0]).toBe(GUEST_DEMO_SOURCE);expect(new Set(session).size).toBe(8);
  const damaged=memory();damaged.setItem('campus-inbox:guest-demo-cycle:v2','{"remaining":[999],"last":1}');
  expect(nextGuestDemoSource(damaged)).toBe(GUEST_DEMO_SOURCE);
 });
 test('waits three seconds with no request and supports cancellation',async()=>{
  vi.useFakeTimers();let complete=false;const pending=waitForGuestDemo(new AbortController().signal).then(()=>{complete=true;});
  await vi.advanceTimersByTimeAsync(2_999);expect(complete).toBe(false);
  await vi.advanceTimersByTimeAsync(1);await pending;expect(complete).toBe(true);
  const controller=new AbortController(),cancelled=expect(waitForGuestDemo(controller.signal)).rejects.toMatchObject({name:'AbortError'});
  controller.abort();await cancelled;expect(vi.getTimerCount()).toBe(0);
 });
 test('creates an isolated reviewed result without changing the reusable fixture',()=>{
  const first=createGuestDemoNotice('draft-one'),second=createGuestDemoNotice('draft-two');
  expect(first.originalText).toBe(GUEST_DEMO_SOURCE);expect(first.title).toBe('本科生评教');expect(isLocalDemoNotice(first)).toBe(true);
  first.tasks[0].completed=true;first.note='my note';
  expect(second.tasks[0].completed).toBe(false);expect(second.note).toBe('');expect(second.id).not.toBe(first.id);
 });
});
describe('device-only sample storage',()=>{
 test('keeps progress after reopening while personal records remain separate',()=>{
  const storage=memory(),personal=new LocalRepository(storage),repository=new LocalDemoRepository(personal,storage);
  const sample=createGuestDemoNotice('one'),real={...createGuestDemoNotice('personal-template'),id:'personal-notice',originalText:'My own notice'};
  repository.save([real,sample]);sample.tasks[0].completed=true;sample.note='keep sample note';repository.save([real,sample]);
  expect(personal.load()).toEqual([real]);expect(storage.getItem(LOCAL_DEMOS_KEY)).toContain('keep sample note');
  const reopened=new LocalDemoRepository(new LocalRepository(storage),storage).load();
  expect(reopened.find(n=>n.id===sample.id)?.tasks[0].completed).toBe(true);
  expect(reopened.find(n=>n.id===sample.id)?.note).toBe('keep sample note');
 });
 test('sample edits, import identity and deletion never enter cloud payloads',async()=>{
  const storage=memory(),personal=new LocalRepository(storage),repository=new LocalDemoRepository(personal,storage);
  const sample=createGuestDemoNotice('one'),real={...createGuestDemoNotice('template'),id:'personal-notice',originalText:'My own notice'};
  repository.save([real,sample]);const sent:unknown[]=[];
  const fetcher=vi.fn(async(_url:unknown,options:RequestInit|undefined)=>{
   const body=JSON.parse(String(options?.body));sent.push(body);
   return new Response(JSON.stringify({cursor:sent.length,accepted:body.changes.map((change:{id:string})=>({id:change.id,version:1})),updates:[],conflicts:[],hasMore:false}),{status:200});
  }) as unknown as typeof fetch;
  const cloud=new CloudSync(personal,'https://example.test/sync',{storage,fetch:fetcher});await cloud.connect('a'.repeat(43));
  sample.tasks[0].completed=true;sample.note='local sample update';repository.save([real,sample]);await cloud.syncNow();
  repository.save([real]);await cloud.syncNow();
  expect(sent).toHaveLength(3);expect(JSON.stringify(sent)).not.toContain(sample.id);expect(JSON.stringify(sent)).not.toContain('local sample update');
  expect((sent[0] as {changes:{id:string}[]}).changes.map(change=>change.id)).toEqual(['personal-notice']);
  expect((sent[1] as {changes:unknown[]}).changes).toEqual([]);expect((sent[2] as {changes:unknown[]}).changes).toEqual([]);
 });
 test('incoming personal sync updates preserve current local sample notes',()=>{
  const storage=memory(),personal=new LocalRepository(storage),repository=new LocalDemoRepository(personal,storage),sample=createGuestDemoNotice('one');
  sample.note='keep';repository.save([sample]);let visible=repository.load();const unsubscribe=repository.subscribe(notices=>{visible=notices;});
  const remote={...createGuestDemoNotice('remote'),id:'remote-personal'};personal.save([remote]);
  expect(visible.map(n=>n.id)).toEqual([remote.id,sample.id]);expect(visible.find(n=>n.id===sample.id)?.note).toBe('keep');unsubscribe();
 });
 test('a saved snapshot preserves its read baseline and emits one detached copy',()=>{
  const storage=memory(),personal=new LocalRepository(storage),repository=new LocalDemoRepository(personal,storage);
  repository.load();const load=vi.spyOn(personal,'load'),listener=vi.fn(),unsubscribe=repository.subscribe(listener),sample=createGuestDemoNotice('one');
  repository.save([sample]);
  expect(load).not.toHaveBeenCalled();expect(listener).toHaveBeenCalledTimes(1);expect(listener.mock.calls[0][0]).toEqual([sample]);
  sample.note='changed after save';expect(listener.mock.calls[0][0][0].note).toBe('');unsubscribe();
 });
});
