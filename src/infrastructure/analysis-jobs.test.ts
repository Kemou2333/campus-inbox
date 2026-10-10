import {describe,it,expect,vi} from 'vitest';
import {AnalysisJobsClient,AnalysisJobJournal,submitAnalysisJob,parseAnalysisJob,attachJobFiles,withoutSubmittedDrafts,pendingAnalysisFiles,type AnalysisJob,type LocalAnalysisSubmission} from './analysis-jobs';
import {createNotice} from '../domain/notice';
import type {NoticeAnalysis} from '../domain/types';

const now='2026-10-10T06:00:00.000Z',requestId='12345678-1234-4234-8234-123456789012';
const metadata=()=>({id:'job-1',requestId,status:'running' as const,createdAt:now,updatedAt:now,noticeIds:[]});
const analysis:NoticeAnalysis={schemaVersion:4,kind:'information',title:'核对材料',summary:'按原文完成。',deadline:null,deadlineText:'',timeline:[],tasks:[],materials:[],warnings:[],reminders:[]};
const submission=():LocalAnalysisSubmission=>({requestId,jobId:'job-1',createdAt:now,sources:[{id:'draft-one',text:' \n原文一\n ',attachments:['file-one']},{id:'draft-two',text:'原文二',attachments:['file-two']}]});
const completed=():AnalysisJob=>({ ...metadata(),status:'completed',noticeIds:['record-one','record-two','record-three'],sourceIndexes:[0,0,1],sources:[{text:'原文一'},{text:'原文二'}],records:['原文一','原文一','原文二'].map((text,i)=>({...createNotice(analysis,text,now),id:['record-one','record-two','record-three'][i]})) });
class MemoryStorage {
 data=new Map<string,string>();get length(){return this.data.size;}key(i:number){return [...this.data.keys()][i]??null;}
 getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}
}

describe('cloud analysis jobs',()=>{
 it('submits one stable request and excludes local attachments, notes and credentials from the body',async()=>{
  const fetcher=vi.fn(async()=>Response.json({job:metadata()},{status:202}));
  const sources=[{text:'原文',attachments:['file'],note:'private'}];
  expect(await submitAnalysisJob(sources,requestId,{endpoint:'https://example.test/analyze',sessionKey:'session',fetcher})).toEqual(metadata());
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://example.test/analysis-jobs');
  expect(JSON.parse(String(init.body))).toEqual({requestId,sources:[{text:'原文'}]});expect(new Headers(init.headers).get('Authorization')).toBe('Bearer session');
 });
 it('reuses the stable request through verification without an automatic paid retry',async()=>{
  let paid=0;const challenge={type:'image',token:'signed',image:'data:image/png;base64,iVBORw0KGgoAAA==',expires:Date.now()+120000};
  const fetcher=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
   if(!new Headers(init?.headers).has('X-Campus-Proof'))return Response.json({code:'VERIFICATION_REQUIRED',challenge},{status:428});
   paid++;return Response.json({job:metadata()},{status:202});
  });
  await submitAnalysisJob([{text:'原文'}],requestId,{endpoint:'https://example.test/analyze',sessionKey:'key',fetcher,onHumanVerification:async()=> '0123'});
  expect(paid).toBe(1);expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
 });
 it('never automatically resubmits after an uncertain network acceptance or provider error',async()=>{
  for(const fetcher of [vi.fn(async()=>{throw new TypeError('network disconnected');}),vi.fn(async()=>Response.json({error:'暂时失败',code:'SERVICE_ERROR'},{status:503}))]){
   await expect(submitAnalysisJob([{text:'原文'}],requestId,{endpoint:'https://example.test/analyze',fetcher})).rejects.toBeInstanceOf(Error);expect(fetcher).toHaveBeenCalledTimes(1);
  }
 });
 it('all recovery reads are authenticated GETs and preserve the opaque pagination cursor',async()=>{
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>String(url).includes('/job-1')?Response.json({job:completed()}):Response.json({jobs:[metadata()],hasMore:true,nextBefore:'opaque /+ token'}));
  const client=new AnalysisJobsClient('https://example.test/analyze?discard=secret',fetcher);
  await client.list('current-key','opaque /+ token');await client.read('current-key','job-1');
  for(const [,init] of fetcher.mock.calls as unknown as [string,RequestInit][]){expect(init.method).toBe('GET');expect(init.body).toBeUndefined();expect(init.headers).toEqual({Authorization:'Bearer current-key'});}
  expect(String(fetcher.mock.calls[0][0])).toContain('before=opaque%20%2F%2B%20token');expect(String(fetcher.mock.calls[0][0])).not.toContain('discard');
 });
 it('strictly rejects a successful record with mismatched source, mapping, attachments or id',()=>{
  expect(parseAnalysisJob(completed(),true).sourceIndexes).toEqual([0,0,1]);
  const badSource=completed();badSource.records![0].originalText='其他来源';
  const badMapping=completed();badMapping.sourceIndexes=[0,1,0];
  const badFiles=completed();badFiles.records![0].attachments=['server-file'];
  const badId=completed();badId.records![0].id='unrelated';
  for(const v of [badSource,badMapping,badFiles,badId,{...completed(),sourceIndexes:undefined}])expect(()=>parseAnalysisJob(v,true)).toThrow();
 });
 it('recognizes a validated result awaiting storage and saves it without submitting source text again',async()=>{
  const snapshot={...completed(),status:'failed',code:'JOB_SAVE_FAILED',recoverableResult:true,recordsAreSnapshot:true};
  expect(parseAnalysisJob(snapshot,true).records).toHaveLength(3);
  const fetcher=vi.fn(async()=>Response.json({job:{...completed(),records:undefined,sources:undefined}},{status:202}));
  await new AnalysisJobsClient('https://example.test/analyze',fetcher).saveResult('device-key','job-1');
  const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://example.test/analysis-jobs/job-1/save');
  expect(init.method).toBe('POST');expect(init.body).toBe('{}');expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('journal persists an unknown ACK across reload and isolates accounts and endpoints without storing session keys',()=>{
  const storage=new MemoryStorage(),a=new AnalysisJobJournal('https://example.test/analyze',' Alice ',storage);a.put({...submission(),jobId:null});
  expect(new AnalysisJobJournal('https://example.test/analysis-jobs','alice',storage).all()[0].jobId).toBeNull();
  expect(new AnalysisJobJournal('https://example.test/analyze','bob',storage).all()).toEqual([]);expect(new AnalysisJobJournal('https://other.test/analyze','alice',storage).all()).toEqual([]);
  expect([...storage.data.values()].join()).not.toContain('session');a.dismiss('job-1');expect(new AnalysisJobJournal('https://example.test/analyze','alice',storage).dismissed('job-1')).toBe(true);
 });
 it('consumes only the exact submitted draft and preserves a later edit or attachment change',()=>{
  const old=submission().sources;const modified=[{...old[0],text:'新编辑'},{...old[1],attachments:['new-file']},{id:'another',text:'下一条',attachments:[]}];
  expect(withoutSubmittedDrafts(modified,old)).toEqual(modified);expect(withoutSubmittedDrafts([...old,modified[2]],old)).toEqual([modified[2]]);
 });
 it('attaches same-source split cards idempotently after edge-space normalization and preserves newer edits',()=>{
  const job=completed(),records=job.records!.map(n=>({...n,note:'新笔记',completed:true,attachments:n.id==='record-one'?['existing-file']:[]}));
  const next=attachJobFiles(records,job,submission());expect(next.map(n=>n.attachments)).toEqual([['existing-file','file-one'],['file-one'],['file-two']]);
  expect(next.every(n=>n.note==='新笔记'&&n.completed)).toBe(true);expect(attachJobFiles(next,job,submission())).toEqual(next);
 });
 it('never recreates a completed job notice after the user deleted it or the cloud returned a tombstone',()=>{
  expect(attachJobFiles([],completed(),submission())).toEqual([]);
  const one=completed().records!.slice(1);expect(attachJobFiles(one,completed(),submission()).map(n=>n.id)).toEqual(['record-two','record-three']);
 });
 it('does not associate files from another job or changed source body',()=>{
  expect(()=>attachJobFiles(completed().records!,completed(),{...submission(),jobId:'other-job'})).toThrow();
  const changed=submission();changed.sources[0].text='别的原文';expect(()=>attachJobFiles(completed().records!,completed(),changed)).toThrow();
 });
 it('protects pending file bytes even while another account is logged in, until intent is resolved',()=>{
  const storage=new MemoryStorage(),a=new AnalysisJobJournal('https://example.test/analyze','alice',storage),b=new AnalysisJobJournal('https://example.test/analyze','bob',storage);
  a.put(submission());b.put({...submission(),sources:[{id:'another',text:'其他原文',attachments:['bob-file']}]});expect(pendingAnalysisFiles(storage).sort()).toEqual(['bob-file','file-one','file-two']);
  a.remove(requestId);expect(pendingAnalysisFiles(storage)).toEqual(['bob-file']);
 });
});
