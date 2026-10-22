import {expect,test} from 'vitest';
import {createNotice} from '../src/domain/notice';
import type {NoticeAnalysis} from '../src/domain/types';
import {LocalRepository} from '../src/infrastructure/local-repository';
import {LocalDemoRepository,LOCAL_DEMOS_KEY} from '../src/infrastructure/local-demo-repository';
import {NOTICE_KEY} from '../src/infrastructure/legacy-migration';

class MemoryStorage{
 values=new Map<string,string>();failPersonal=false;
 getItem(key:string){return this.values.get(key)??null;}
 setItem(key:string,value:string){if(this.failPersonal&&key===NOTICE_KEY)throw new Error('quota');this.values.set(key,value);}
 removeItem(key:string){this.values.delete(key);}
}
const analysis:NoticeAnalysis={schemaVersion:4,kind:'information',title:'合成通知',summary:'仅用于并发测试',deadline:null,deadlineText:'',timeline:[],tasks:[],materials:[],warnings:[],reminders:[]};
const record=()=>createNotice(analysis,'合成测试原文','2026-10-23T00:00:00Z');
const repo=(s:MemoryStorage)=>new LocalDemoRepository(new LocalRepository(s),s);

test('an old wrapped snapshot cannot overwrite another tab, including a remote deletion',()=>{
 for(const deleted of [false,true]){
  const storage=new MemoryStorage(),a=repo(storage),b=repo(storage),source=record();a.load();a.save([source]);
  const old=b.load();const latest=deleted?[]:[{...source,note:'标签页A的新笔记'}];a.save(latest);
  expect(()=>b.save(old.map(n=>({...n,favorite:true})))).toThrow('另一标签页');expect(a.load()).toEqual(latest);
 }
});
test('a stale sample write is rejected before any personal write',()=>{
 const storage=new MemoryStorage(),a=repo(storage),b=repo(storage),sample={...record(),id:'local-demo-v1-test'};
 a.load();a.save([sample]);const old=b.load();a.save([{...sample,note:'示例的新笔记'}]);
 expect(()=>b.save([{...record(),note:'不应保存'},...old])).toThrow('另一标签页');
 expect(a.load()).toEqual([{...sample,note:'示例的新笔记'}]);
});
test('a failed personal save rolls back its paired sample edit',()=>{
 const storage=new MemoryStorage(),a=repo(storage),source=record(),sample={...record(),id:'local-demo-v1-test'};
 a.load();a.save([source,sample]);const before=storage.getItem(LOCAL_DEMOS_KEY);storage.failPersonal=true;
 expect(()=>a.save([{...source,note:'新笔记'},{...sample,completed:true}])).toThrow('quota');
 expect(storage.getItem(LOCAL_DEMOS_KEY)).toBe(before);expect(a.load()).toEqual([source,sample]);
});
