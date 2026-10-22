import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {createNotice,exportBackup,MAX_NOTICES} from '../domain/notice';
import type {BackupAttachment,Notice,NoticeAnalysis} from '../domain/types';
import {LocalRepository} from './local-repository';

const analysis:NoticeAnalysis={schemaVersion:4,kind:'task',title:'材料登记',summary:'按要求提交材料。',deadline:null,deadlineText:'',timeline:[],tasks:[{text:'提交材料',assignee:null,scope:'all',condition:'',details:[],steps:[],time:null,timeText:'',location:null}],materials:[],warnings:[],reminders:[]};
const notice=(id='same'):Notice=>({...createNotice(analysis,'原文','2026-10-22T12:00:00Z'),id});
const file=(id='old-file',text='hello',name='材料.txt',type='text/plain'):BackupAttachment=>({id,name,type,size:new TextEncoder().encode(text).length,data:btoa(text)});
class MemoryStorage{data=new Map<string,string>();getItem(key:string){return this.data.get(key)??null;}setItem(key:string,value:string){this.data.set(key,value);}}

beforeEach(()=>{vi.resetModules();vi.stubGlobal('indexedDB',new IDBFactory());});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function fixture(records:Notice[]=[]){
 const repository=new LocalRepository(new MemoryStorage());repository.load();repository.save(records);
 const store=await import('./attachment-store'),{importNoticeBackup}=await import('./backup-import');
 let active=true,protectedRefs:Pick<Notice,'attachments'>[]=[];
 const target={load:()=>repository.load(),save:(next:Notice[])=>repository.save(next),references:()=>[...repository.load(),...protectedRefs],isCurrent:()=>active};
 return {repository,store,target,importNoticeBackup,switchAccount:()=>{active=false;},protect:(refs:Pick<Notice,'attachments'>[])=>{protectedRefs=refs;}};
}

it('restores backup attachments after text sync while preserving newer words, notes and progress; repeat import is a no-op',async()=>{
 const backup={...notice(),attachments:['old-file']},current={...backup,attachments:[],title:'本机新标题',note:'本机新笔记',completed:true,updatedAt:'2026-10-23T00:00:00Z',tasks:backup.tasks.map(task=>({...task,completed:true}))};
 const f=await fixture([current]),data=exportBackup([backup],[file()]);
 expect(await f.importNoticeBackup(data,f.target)).toEqual({added:0,linkedAttachments:1});
 const saved=f.repository.load()[0];expect({...saved,attachments:[]}).toEqual(current);expect(saved.attachments).toHaveLength(1);
 expect(await (await f.store.getFile(saved.attachments[0]))!.blob.text()).toBe('hello');
 expect(await f.importNoticeBackup(data,f.target)).toEqual({added:0,linkedAttachments:0});
 expect(f.repository.load()[0]).toEqual(saved);expect(await f.store.allLocalFiles()).toHaveLength(1);
});

it('partially overlapping IDs and several notices reuse the same restored bytes exactly once, including concurrent imports',async()=>{
 const first={...notice('existing'),attachments:['shared']},second={...notice('new'),attachments:['shared']},third={...notice('also-new'),attachments:['same-bytes-other-id']};
 const f=await fixture([{...first,attachments:[],note:'当前笔记'}]);
 const data=exportBackup([first,second,third],[file('shared'),file('same-bytes-other-id')]);
 const results=await Promise.all([f.importNoticeBackup(data,f.target),f.importNoticeBackup(data,f.target)]);
 expect(results.map(result=>result.added)).toEqual([2,0]);
 const saved=f.repository.load();expect(saved[0].note).toBe('当前笔记');expect(saved).toHaveLength(3);
 expect(new Set(saved.flatMap(record=>record.attachments)).size).toBe(1);expect(await f.store.allLocalFiles()).toHaveLength(1);
});

it('reuses only identical metadata and bytes from referenced candidates; missing legacy IDs are repaired',async()=>{
 const f=await fixture(),[existing]=await f.store.addFiles([new File(['hello'],'材料.txt',{type:'text/plain'})]);
 const current={...notice(),attachments:[existing,'missing-old-id']};f.repository.save([current]);
 const data=exportBackup([{...current,attachments:['different-id','missing-old-id','renamed']}],[file('different-id'),file('missing-old-id','recovered'),file('renamed','hello','另一个名字.txt')]);
 await f.importNoticeBackup(data,f.target);
 const saved=f.repository.load()[0];expect(saved.attachments).toHaveLength(3);expect(saved.attachments).toContain(existing);expect(saved.attachments).not.toContain('missing-old-id');
 expect(await f.store.allLocalFiles()).toHaveLength(3);expect(await (await f.store.getFile(existing))!.blob.text()).toBe('hello');
});

it('rolls back only newly created unreferenced files when notification persistence fails, allowing a clean retry',async()=>{
 const f=await fixture(),[existing]=await f.store.addFiles([new File(['keep'],'已有.txt')]);
 f.repository.save([{...notice('existing'),attachments:[existing]}]);
 const backup=exportBackup([{...notice('new'),attachments:['old-file']}],[file()]);
 const failed={...f.target,save:()=>{throw new Error('localStorage quota exceeded');}};
 await expect(f.importNoticeBackup(backup,failed)).rejects.toThrow('quota');
 expect((await f.store.allLocalFiles()).map(record=>record.id)).toEqual([existing]);expect(f.repository.load()).toHaveLength(1);
 expect(await f.importNoticeBackup(backup,f.target)).toEqual({added:1,linkedAttachments:1});expect(await f.store.allLocalFiles()).toHaveLength(2);
});

it('rollback protects new IDs already referenced by notices, drafts, pending work or trash, without retaining an orphan',async()=>{
 const f=await fixture(),files=Array.from({length:5},(_,index)=>file('backup-'+index,'data-'+index));
 const backup=exportBackup([{...notice(),attachments:files.map(value=>value.id)}],files);
 const failed={...f.target,save:(next:Notice[])=>{
  const [live,draft,pending,trash]=next[0].attachments;
  f.repository.save([{...notice('other-notice'),attachments:[live]}]);
  f.protect([{attachments:[draft]},{attachments:[pending]},{attachments:[trash]}]);
  throw new Error('injected failure after another writer retained references');
 }};
 await expect(f.importNoticeBackup(backup,failed)).rejects.toThrow('injected');
 const kept=new Set(f.target.references().flatMap(record=>record.attachments));
 expect(kept.size).toBe(4);expect(new Set((await f.store.allLocalFiles()).map(record=>record.id))).toEqual(kept);
});

it('keeps count and combined per-notice attachment limits, cleaning new files when a merge would exceed them',async()=>{
 const f=await fixture(),ids=await f.store.addFiles(Array.from({length:10},(_,index)=>new File(['local-'+index],'本机-'+index+'.txt')));
 const current={...notice(),attachments:ids};f.repository.save([current]);
 await expect(f.importNoticeBackup(exportBackup([{...current,attachments:['extra']}],[file('extra')]),f.target)).rejects.toThrow('10');
 expect(f.repository.load()).toEqual([current]);expect(await f.store.allLocalFiles()).toHaveLength(10);
 const full=Array.from({length:MAX_NOTICES},(_,index)=>notice('notice-'+index));f.repository.save(full);
 await expect(f.importNoticeBackup(exportBackup([{...notice('another'),attachments:['extra']}],[file('extra')]),f.target)).rejects.toThrow(String(MAX_NOTICES));
 expect(await f.store.allLocalFiles()).toHaveLength(10);
});

it('checks the combined byte size after merging into an existing notice, not only the backup by itself',async()=>{
 const f=await fixture(),ids=await f.store.addFiles(Array.from({length:4},(_,index)=>new File([new Uint8Array(f.store.MAX_FILE_BYTES)],'大文件-'+index)));
 const current={...notice(),attachments:ids};f.repository.save([current]);
 await expect(f.importNoticeBackup(exportBackup([{...current,attachments:['extra']}],[file('extra','x')]),f.target)).rejects.toThrow('20 MB');
 expect(f.repository.load()).toEqual([current]);expect(await f.store.allLocalFiles()).toHaveLength(4);
});

it('account switching during an attachment await aborts and cleans the new unreferenced bytes',async()=>{
 const f=await fixture(),digest=crypto.subtle.digest.bind(crypto.subtle);
 vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{f.switchAccount();return digest(...args);});
 await expect(f.importNoticeBackup(exportBackup([{...notice(),attachments:['old-file']}],[file()]),f.target)).rejects.toThrow('账号已切换');
 expect(f.repository.load()).toEqual([]);expect(await f.store.allLocalFiles()).toEqual([]);
});

it('preserves notification edits arriving during file restoration and rejects later stale saves',async()=>{
 const original={...notice(),attachments:[]},f=await fixture([original]),digest=crypto.subtle.digest.bind(crypto.subtle);
 vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{f.repository.save([{...original,note:'恢复文件期间的新笔记'}]);return digest(...args);});
 const backup=exportBackup([{...original,attachments:['old-file']}],[file()]);
 await f.importNoticeBackup(backup,f.target);expect(f.repository.load()[0].note).toBe('恢复文件期间的新笔记');
 const second=exportBackup([{...original,attachments:['another']}],[file('another','new bytes')]);let reads=0;
 const concurrent={...f.target,load:()=>{if(++reads===3)f.repository.save(f.repository.load().map(record=>({...record,note:'另一次新修改'})));return f.repository.load();}};
 await expect(f.importNoticeBackup(second,concurrent)).rejects.toThrow('已有新修改');
 expect(f.repository.load()[0].note).toBe('另一次新修改');expect(await f.store.allLocalFiles()).toHaveLength(1);
});
