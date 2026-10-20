import {afterEach,describe,expect,test,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {createNotice} from '../domain/notice';
import type {Notice,NoticeAnalysis} from '../domain/types';
import {MAX_TRASH_ITEMS,restoredTrashNotice} from '../domain/notice-trash';
import {isExampleNotice} from '../domain/examples';
import {NoticeTrash,TRASH_KEY_PREFIX} from './notice-trash';
import {LocalRepository} from './local-repository';
import {CloudSync} from './sync-client';

function memory(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);},key:(index:number)=>[...values.keys()][index]??null,get length(){return values.size;}};}
const analysis:NoticeAnalysis={schemaVersion:4,kind:'task',title:'虚构材料通知',summary:'提交一份材料。',deadline:null,deadlineText:'',timeline:[],tasks:[{text:'交材料',assignee:null,scope:'all',condition:'',details:[],steps:[{text:'上传',details:[]}],time:null,timeText:'',location:null}],warnings:[],materials:[],reminders:[]};
function notice():Notice{const n=createNotice(analysis,'虚构通知原文。','2026-10-18T00:00:00Z');return {...n,id:'own-notice',note:'整条笔记',favorite:true,attachments:['shared-file'],corrections:{updatedAt:'2026-10-18T00:00:00Z',values:[{path:'summary',value:'自己修正的简介'}]},tasks:n.tasks.map(task=>({...task,note:'事项笔记',completed:true,steps:task.steps.map(step=>({...step,completed:true,note:'步骤笔记'}))}))};}
afterEach(()=>{vi.unstubAllGlobals();});
describe('account-separated device recycle bin',()=>{
 test('keeps a complete independent snapshot and isolates account lists and clearing',()=>{
  const storage=memory(),trash=new NoticeTrash(storage,()=>Date.parse('2026-10-18T00:00:00Z')),n=notice(),entry=trash.add('account:one',n,4);
  n.note='later changed';expect(trash.list('account:one')[0].notice.note).toBe('整条笔记');expect(trash.list('account:two')).toEqual([]);
  trash.add('account:two',notice(),0);trash.clear('account:two');expect(trash.list('account:one')[0].id).toBe(entry.id);
  const reopened=new NoticeTrash(storage,()=>Date.parse('2026-10-18T00:00:00Z'));expect(reopened.list('account:one')[0].notice).toMatchObject({favorite:true,attachments:['shared-file'],note:'整条笔记',corrections:{values:[{path:'summary',value:'自己修正的简介'}]}});
 });
 test('explicit restore preserves every field except root ID and update time and leaves the old tombstone identity alone',()=>{
  const trash=new NoticeTrash(memory()),entry=trash.add('device',notice(),0),restored=restoredTrashNotice(entry,'2026-10-18T10:00:00Z',entry.id);
  expect(restored.id).not.toBe(entry.notice.id);expect(restored.id).toBe('restored-'+entry.id);
  const {id:_,updatedAt:__,...before}=entry.notice,{id:___,updatedAt:____,...after}=restored;expect(after).toEqual(before);
  restored.tasks[0].note='modified';expect(entry.notice.tasks[0].note).toBe('事项笔记');
  const builtin={...entry,notice:{...entry.notice,id:'example-reading-v211-1'}};expect(isExampleNotice(restoredTrashNotice(builtin))).toBe(true);
 });
 test('restoration lookup reads only its own entry, respects expiry and keeps other accounts isolated',()=>{
  let now=Date.parse('2026-10-18T00:00:00Z');const storage=memory(),trash=new NoticeTrash(storage,()=>now);
  const entry=trash.add('account:one',notice(),0);trash.add('account:two',notice(),0);
  const read=vi.spyOn(storage,'getItem'),enumerate=vi.spyOn(storage,'key');
  expect(trash.get('account:one',entry.id)?.notice).toEqual(entry.notice);expect(read).toHaveBeenCalledTimes(1);expect(enumerate).not.toHaveBeenCalled();
  expect(trash.get('account:two',entry.id)).toBeNull();
  now+=30*86400_000;expect(trash.get('account:one',entry.id)).toBeNull();
 });
 test('expires at 30 days without automatically touching attachment data',()=>{
  let now=Date.parse('2026-10-18T00:00:00Z');const storage=memory(),trash=new NoticeTrash(storage,()=>now);trash.add('account:one',notice(),0);
  now+=30*86400_000-1;expect(trash.list('account:one')).toHaveLength(1);now++;expect(trash.list('account:one')).toEqual([]);
  expect(trash.attachmentReferences()).toEqual([{attachments:['shared-file']}]);
 });
 test('a full or unwritable recycle bin rejects a new snapshot before deleting anything',()=>{
  const storage=memory(),trash=new NoticeTrash(storage),n=notice();for(let i=0;i<MAX_TRASH_ITEMS;i++)trash.add('device',{...n,id:'notice-'+i},i);
  const snapshot=()=>Array.from({length:storage.length},(_,i)=>{const key=storage.key(i)!;return [key,storage.getItem(key)];});
  const previous=snapshot();expect(()=>trash.add('device',n,0)).toThrow('回收站已满');expect(snapshot()).toEqual(previous);
  const other=memory(),broken=new NoticeTrash(other);other.setItem=()=>{throw new Error('quota');};expect(()=>broken.add('device',n,0)).toThrow('quota');expect(other.length).toBe(0);
 });
 test('interleaved additions from two tabs retain both independent snapshots',()=>{
  const storage=memory(),first=new NoticeTrash(storage),second=new NoticeTrash(storage),write=storage.setItem;
  let other:ReturnType<NoticeTrash['add']>|undefined,interleaved=false;
  storage.setItem=(key,value)=>{if(!interleaved&&key.startsWith(TRASH_KEY_PREFIX)){interleaved=true;other=second.add('account:one',{...notice(),id:'second-notice'},1);}write(key,value);};
  const entry=first.add('account:one',notice(),0);
  expect(first.list('account:one').map(item=>item.id).sort()).toEqual([entry.id,other!.id].sort());
  second.forget('account:one',other!.id);expect(first.list('account:one').map(item=>item.id)).toEqual([entry.id]);
 });
 test('a failed competing main deletion only rolls back its own snapshot',()=>{
  const storage=memory(),firstRepository=new LocalRepository(storage),secondRepository=new LocalRepository(storage),a={...notice(),id:'notice-a'},b={...notice(),id:'notice-b'};
  firstRepository.load();firstRepository.save([a,b]);const firstCurrent=firstRepository.load(),secondCurrent=secondRepository.load();
  const first=new NoticeTrash(storage),second=new NoticeTrash(storage),write=storage.setItem;let firstEntry:ReturnType<NoticeTrash['add']>|undefined,interleaved=false;
  storage.setItem=(key,value)=>{if(!interleaved&&key.startsWith(TRASH_KEY_PREFIX)){interleaved=true;firstEntry=first.add('account:one',a,0);firstRepository.save(firstCurrent.filter(item=>item.id!==a.id));}write(key,value);};
  const secondEntry=second.add('account:one',b,1);
  expect(()=>secondRepository.save(secondCurrent.filter(item=>item.id!==b.id))).toThrow('另一标签页');
  second.forget('account:one',secondEntry.id);
  expect(firstRepository.load().map(item=>item.id)).toEqual([b.id]);expect(first.list('account:one').map(item=>item.id)).toEqual([firstEntry!.id]);expect(first.list('account:one')[0].notice).toEqual(a);
 });
 test('clear removes only captured IDs and preserves a new snapshot added by another tab',()=>{
  const storage=memory(),first=new NoticeTrash(storage),second=new NoticeTrash(storage),old=first.add('account:one',notice(),0),otherScope=second.add('account:two',notice(),0),remove=storage.removeItem;
  let fresh:ReturnType<NoticeTrash['add']>|undefined,interleaved=false;
  storage.removeItem=key=>{if(!interleaved&&key.startsWith(TRASH_KEY_PREFIX)){interleaved=true;fresh=second.add('account:one',{...notice(),id:'new-notice'},1);}remove(key);};
  expect(first.clear('account:one').map(item=>item.id)).toEqual([old.id]);expect(first.list('account:one').map(item=>item.id)).toEqual([fresh!.id]);expect(first.list('account:two').map(item=>item.id)).toEqual([otherScope.id]);
 });
 test('explicit file cleanup protects another account trash reference and a surviving live record',async()=>{
  vi.resetModules();vi.stubGlobal('indexedDB',new IDBFactory());const files=await import('./attachment-store'),storage=memory(),trash=new NoticeTrash(storage);
  const [file]=await files.addFiles([new File(['original bytes'],'original.txt')]);const n={...notice(),attachments:[file]},a=trash.add('account:one',n,0),b=trash.add('account:two',n,0);
  trash.forget('account:one',a.id);await files.cleanupFiles([file],trash.attachmentReferences() as Notice[]);expect(await files.getFile(file)).not.toBeNull();
  trash.forget('account:two',b.id);await files.cleanupFiles([file],[n]);expect(await files.getFile(file)).not.toBeNull();
  await files.cleanupFiles([file],[]);expect(await files.getFile(file)).toBeNull();
 });
 test('restoring synchronizes a new copy without rewriting a deleted cloud record',async()=>{
  const storage=memory(),personal=new LocalRepository(storage),entry=new NoticeTrash(storage).add('account:one',notice(),0),restored=restoredTrashNotice(entry,'2026-10-18T10:00:00Z',entry.id);
  personal.load();personal.save([restored]);const endpoint='https://isolated.example.test/sync';storage.setItem('campus-inbox:sync:v1:'+endpoint,JSON.stringify({version:1,key:'a'.repeat(43),cursor:7,versions:{'own-notice':7},hashes:{'own-notice':null},conflicts:[],lastSyncedAt:null,hasMore:false}));
  let sent:{id:string;record:Notice|null}[]=[];
  const fetcher=vi.fn(async(_url:unknown,options:RequestInit|undefined)=>{const body=JSON.parse(String(options?.body));sent=body.changes;return Response.json({cursor:8,accepted:sent.map(change=>({id:change.id,version:8})),updates:[],conflicts:[],hasMore:false});}) as unknown as typeof fetch;
  await new CloudSync(personal,endpoint,{storage,fetch:fetcher}).syncNow();expect(sent.map(change=>change.id)).toEqual([restored.id]);expect(sent.some(change=>change.id==='own-notice')).toBe(false);
 });
});
