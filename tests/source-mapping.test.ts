import {afterEach,beforeEach,describe,expect,test,vi} from 'vitest';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {useCampus,type CampusController,type Draft} from '../src/app/useCampus';
import {parseAnalysisBatch} from '../src/domain/notice';
import {exampleFingerprint} from '../src/domain/examples';
import {createNotice} from '../src/domain/notice';
import type {NoticeAnalysis} from '../src/domain/types';
import {LocalRepository} from '../src/infrastructure/local-repository';
import {NOTICE_KEY} from '../src/infrastructure/legacy-migration';

// React SSR initializes the real hook without browser effects or a new DOM
// dependency. These are controller/storage tests, not layout or device tests.
vi.mock('../src/platform',()=>({createPlatform:()=>({kind:'browser',ready:Promise.resolve({calendar:false,fileSave:false,shareText:false,localReminders:false,theme:null})})}));

const DRAFT_KEY='campus-inbox:draft:v5',RESULT_KEY='campus-inbox:pending-analysis:v5';
class MemoryStorage implements Storage {
  private data=new Map<string,string>();
  failNoticeWrites=false;
  get length(){return this.data.size;}
  clear(){this.data.clear();}
  key(index:number){return [...this.data.keys()][index]??null;}
  getItem(key:string){return this.data.get(key)??null;}
  removeItem(key:string){this.data.delete(key);}
  setItem(key:string,value:string){if(this.failNoticeWrites&&key===NOTICE_KEY)throw new Error('Device storage full');this.data.set(key,value);}
}
const analysis=(title:string):NoticeAnalysis=>({schemaVersion:4,kind:'task',title,summary:'请按原文办理。',deadline:null,deadlineText:'',tasks:[{text:'办理事项',assignee:null,scope:'all',condition:'',details:[],steps:[{text:'第一步',details:[]},{text:'第二步',details:[]}],time:null,timeText:'',location:null}],timeline:[],materials:[],warnings:[],reminders:[]});
const drafts=():Draft[]=>[{id:'draft-a',text:'第一来源里有两条独立通知。',attachments:['file-a']},{id:'draft-b',text:'第二来源只有一条通知。',attachments:['file-b']}];
const splitBatch=()=>({schemaVersion:4,notices:[analysis('第一来源主题一'),analysis('第一来源主题二'),analysis('第二来源主题')],sourceIndexes:[0,0,1]});
function controller(){let app:CampusController|undefined;function Probe(){app=useCampus();return null;}renderToString(createElement(Probe));if(!app)throw new Error('Controller did not initialize');return app;}
function pending(sources=drafts(),result:unknown=splitBatch()){localStorage.setItem(DRAFT_KEY,JSON.stringify(sources));const raw=JSON.stringify({sources,result});localStorage.setItem(RESULT_KEY,raw);return raw;}
const records=()=>new LocalRepository(localStorage).load();
let storage:MemoryStorage;
beforeEach(()=>{storage=new MemoryStorage();vi.stubGlobal('localStorage',storage);vi.stubGlobal('sessionStorage',new MemoryStorage());vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('No network calls permitted');}));});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('frontend source-index parsing',()=>{
  test('mapped repeated source indexes are kept while AI-local sourceId stays outside the card schema',()=>{
    expect(parseAnalysisBatch(splitBatch()).sourceIndexes).toEqual([0,0,1]);
    expect(()=>parseAnalysisBatch({schemaVersion:4,notices:[{...analysis('非法ID'),sourceId:1}],sourceIndexes:[0]})).toThrow();
  });
  test('wrong lengths, nonintegers and out-of-bounds source indexes are rejected',()=>{
    for(const sourceIndexes of [[],[0,0],[0,0,1,1],[0,-1,1],[0,20,1],[0,0.5,1],[0,'0',1],[0,NaN,1]])expect(()=>parseAnalysisBatch({...splitBatch(),sourceIndexes})).toThrow();
  });
});

describe('real pending-result controller recovery',()=>{
  test('one original can save multiple unique cards with the correct original text and local attachments',()=>{
    const sources=drafts();pending(sources);controller().recoverResult();
    const saved=records();
    expect(saved.map(n=>n.id)).toEqual(['ai-draft-a','ai-draft-a-1','ai-draft-b']);
    expect(new Set(saved.flatMap(n=>[n.id,...n.tasks.flatMap(t=>[t.id,...t.steps.map(s=>s.id)])])).size).toBe(12);
    expect(saved.map(n=>n.originalText)).toEqual([sources[0].text,sources[0].text,sources[1].text]);
    expect(saved.map(n=>n.attachments)).toEqual([['file-a'],['file-a'],['file-b']]);
    expect(localStorage.getItem(RESULT_KEY)).toBeNull();expect(fetch).not.toHaveBeenCalled();
  });
  test('recovery after refresh is idempotent and preserves existing notes and child identities',()=>{
    pending();controller().recoverResult();
    const repository=new LocalRepository(storage),saved=repository.load();
    saved[1].note='已经补充自己的笔记';saved[1].tasks[0].steps[0].completed=true;repository.save(saved);
    const before=records();pending();controller().recoverResult();
    expect(records()).toEqual(before);expect(records()).toHaveLength(3);expect(fetch).not.toHaveBeenCalled();
  });
  test('partial previously saved split result fills only missing cards without overwriting the existing one',()=>{
    pending();controller().recoverResult();
    const repository=new LocalRepository(storage),saved=repository.load();
    const existing={...saved[0],note:'保留先前的修改'};repository.save([existing]);
    pending();controller().recoverResult();
    const completed=records();expect(completed).toHaveLength(3);expect(completed[0]).toEqual(existing);
    expect(completed.map(n=>n.id)).toEqual(['ai-draft-a','ai-draft-a-1','ai-draft-b']);
  });
  test('uncovered sources, reordered indexes and references outside the actual draft count retain pending results',()=>{
    for(const sourceIndexes of [[0,0,0],[0,1,0],[0,0,2]]){
      storage.clear();const raw=pending(drafts(),{...splitBatch(),sourceIndexes});controller().recoverResult();
      expect(records()).toEqual([]);expect(localStorage.getItem(RESULT_KEY)).toBe(raw);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  test('failed device write preserves the returned AI result for a later free recovery',()=>{
    const raw=pending();storage.failNoticeWrites=true;controller().recoverResult();
    expect(localStorage.getItem(RESULT_KEY)).toBe(raw);expect(records()).toEqual([]);
    storage.failNoticeWrites=false;controller().recoverResult();expect(records()).toHaveLength(3);expect(localStorage.getItem(RESULT_KEY)).toBeNull();expect(fetch).not.toHaveBeenCalled();
  });
  test('legacy one-to-one batches remain recoverable without optional sourceIndexes',()=>{
    pending(drafts(),{schemaVersion:4,notices:[analysis('第一条'),analysis('第二条')]});controller().recoverResult();
    expect(records().map(n=>n.id)).toEqual(['ai-draft-a','ai-draft-b']);
    expect(records().map(n=>n.attachments)).toEqual([['file-a'],['file-b']]);
  });
  test('loadExamples uses the safe upgrade helper and saves multiple cards belonging to one original',async()=>{
    const old={...createNotice(analysis('旧示例'),'示例来源'),id:'example-reading-v21-0'};
    const newer=[{...createNotice(analysis('新版一'),'示例来源'),id:'example-reading-v25-0'},{...createNotice(analysis('新版二'),'示例来源'),id:'example-reading-v25-1'}];
    const repository=new LocalRepository(storage);repository.save([old]);
    const catalog=[{id:old.id,fingerprint:await exampleFingerprint(old)}];
    const fetchMock=vi.fn(async(url:string)=>Response.json(url==='./examples.json'?{app:'campus-inbox',version:5,notices:newer}:catalog));vi.stubGlobal('fetch',fetchMock);
    await controller().loadExamples();expect(records()).toEqual(newer);expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  test('registry failure during actual loadExamples leaves old and personal records intact',async()=>{
    const old={...createNotice(analysis('旧示例'),'示例来源'),id:'example-reading-v21-0'},newer={...createNotice(analysis('新版示例'),'示例来源'),id:'example-reading-v25-0'};
    const repository=new LocalRepository(storage);repository.save([old]);
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url==='./examples-legacy-2.4.json')throw new Error('offline');return Response.json({app:'campus-inbox',version:5,notices:[newer]});}));
    await controller().loadExamples();expect(records()).toEqual([old]);
  });
  test('a personal edit while fingerprints are calculated prevents an outdated example replacement',async()=>{
    const old={...createNotice(analysis('旧示例'),'示例来源'),id:'example-reading-v21-0'},newer={...createNotice(analysis('新版示例'),'示例来源'),id:'example-reading-v25-0'};
    const repository=new LocalRepository(storage);repository.save([old]);
    const catalog=[{id:old.id,fingerprint:await exampleFingerprint(old)}];
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url==='./examples.json'?{app:'campus-inbox',version:5,notices:[newer]}:catalog)));
    let announce:()=>void=()=>{},release:()=>void=()=>{};
    const started=new Promise<void>(resolve=>{announce=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
    const digest=crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle,'digest').mockImplementation(async(algorithm,data)=>{announce();await gate;return digest(algorithm,data);});
    const loading=controller().loadExamples();await started;
    const live=repository.load();live[0].note='载入期间补充的笔记';repository.save(live);release();
    await expect(loading).rejects.toThrow('通知正在更新');expect(records()).toEqual(live);
  });
});
