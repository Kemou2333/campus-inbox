import { analyzeSources, AnalysisError, type AnalysisSource, type AnalyzeOptions } from './ai-client';
import { parseNotice } from '../domain/notice';
import type { Notice } from '../domain/types';

export type AnalysisJobStatus = 'accepted' | 'running' | 'completed' | 'failed';
export interface AnalysisJob {
  id: string; requestId: string; status: AnalysisJobStatus; createdAt: string; updatedAt: string;
  noticeIds: string[]; sourceIndexes?: number[]; sources?: AnalysisSource[]; records?: Notice[];
  error?: string; code?: string;
  recoverableResult?: boolean; recordsAreSnapshot?: boolean;
}
export interface AnalysisJobPage { jobs: AnalysisJob[]; hasMore: boolean; nextBefore?: string }
export interface JobDraft { id: string; text: string; attachments: string[] }
export interface LocalAnalysisSubmission { requestId: string; sources: JobDraft[]; jobId: string | null; createdAt: string }
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(v);
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const invalid = () => new AnalysisError('云端整理状态暂时无法读取，原文仍然保留。', 'INVALID_JOB_RESPONSE');
export function normalizeJobEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw invalid();
  url.pathname = `${url.pathname.replace(/\/(?:analyze|analysis-jobs|sync)\/?$/, '').replace(/\/$/, '')}/analysis-jobs`;
  url.search = ''; url.hash = ''; url.username = ''; url.password = '';
  return url.href;
}
export function parseAnalysisJob(value: unknown, detailed = false): AnalysisJob {
  const o = value as Partial<AnalysisJob> | null;
  if (!o || !id(o.id) || !id(o.requestId) || !['accepted','running','completed','failed'].includes(o.status ?? '')
    || !instant(o.createdAt) || !instant(o.updatedAt) || !Array.isArray(o.noticeIds) || o.noticeIds.length > 20
    || !o.noticeIds.every(id) || new Set(o.noticeIds).size !== o.noticeIds.length) throw invalid();
  const job: AnalysisJob = { id:o.id, requestId:o.requestId, status:o.status!, createdAt:o.createdAt, updatedAt:o.updatedAt, noticeIds:[...o.noticeIds] };
  if (o.sourceIndexes !== undefined) {
    if (!Array.isArray(o.sourceIndexes) || o.sourceIndexes.length !== o.noticeIds.length
      || o.sourceIndexes.some((n, i) => !Number.isSafeInteger(n) || n < 0 || n > 19 || i > 0 && n < o.sourceIndexes![i - 1])) throw invalid();
    job.sourceIndexes = [...o.sourceIndexes];
  }
  if (o.error !== undefined) { if (typeof o.error !== 'string' || !o.error.trim() || o.error.length > 500) throw invalid(); job.error=o.error; }
  if (o.code !== undefined) { if (typeof o.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/.test(o.code)) throw invalid(); job.code=o.code; }
  for(const field of ['recoverableResult','recordsAreSnapshot'] as const){if(o[field]!==undefined){if(typeof o[field]!=='boolean')throw invalid();job[field]=o[field];}}
  if ((o.status === 'completed'||job.recoverableResult) && (!job.noticeIds.length || !job.sourceIndexes)) throw invalid();
  if (detailed) {
    if (!Array.isArray(o.sources) || !o.sources.length || o.sources.length > 20 || o.sources.some(s => !s || typeof s.text !== 'string' || !s.text.trim())
      || o.sources.reduce((n,s)=>n+s.text.length,0)>4000) throw invalid();
    job.sources=o.sources.map(s=>({text:s.text}));
    if (job.status==='completed'||job.recoverableResult) {
      if (!Array.isArray(o.records) || o.records.length!==job.noticeIds.length || job.sourceIndexes!.some(n=>n>=job.sources!.length)
        || new Set(job.sourceIndexes).size!==job.sources.length) throw invalid();
      try { job.records=o.records.map(parseNotice); } catch { throw invalid(); }
      if (job.records.some((r,i)=>r.id!==job.noticeIds[i] || r.attachments.length || r.originalText.trim()!==job.sources![job.sourceIndexes![i]].text.trim())) throw invalid();
    }
  }
  return job;
}
/** POST only happens on explicit submission. Status reads never invoke the model. */
export async function submitAnalysisJob(sources: AnalysisSource[], requestId: string, options: AnalyzeOptions): Promise<AnalysisJob> {
  if (!id(requestId)) throw new AnalysisError('提交信息无效，请重新整理。','INVALID_REQUEST_ID');
  const result = await analyzeSources(sources, { ...options, requestId, endpoint:normalizeJobEndpoint(options.endpoint!), timeoutMs:options.timeoutMs ?? 15_000 });
  return parseAnalysisJob((result as {job?:unknown})?.job);
}
export class AnalysisJobsClient {
  readonly endpoint: string;
  constructor(endpoint: string, private fetcher: typeof fetch = fetch) { this.endpoint=normalizeJobEndpoint(endpoint);this.fetcher=fetcher.bind(globalThis); }
  private async request(path: string, key: string, signal?: AbortSignal, method:'GET'|'POST'='GET'): Promise<Record<string,unknown>> {
    const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,15_000);
    if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});
    try {
      const response=await this.fetcher(`${this.endpoint}${path}`,{method,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store',signal:controller.signal,headers:{Authorization:`Bearer ${key}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});
      const text=await response.text();if(text.length>2_000_000)throw invalid();
      let value:Record<string,unknown>;try{value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();}catch{throw invalid();}
      if(!response.ok)throw new AnalysisError(typeof value.error==='string'?value.error:'暂时无法查看整理结果，请稍后回来。',typeof value.code==='string'?value.code:'JOB_STATUS_ERROR',response.status);
      return value;
    } catch(error) {
      if(error instanceof TypeError || error instanceof Error&&error.name==='AbortError')throw new AnalysisError('暂时无法连接云端，已提交的整理会继续。','JOB_STATUS_UNAVAILABLE');
      throw error;
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async list(key:string, before?:string, signal?:AbortSignal):Promise<AnalysisJobPage>{
    const value=await this.request(before?`?before=${encodeURIComponent(before)}`:'',key,signal);
    if(!Array.isArray(value.jobs)||value.jobs.length>20||typeof value.hasMore!=='boolean'
      ||value.nextBefore!==undefined&&(typeof value.nextBefore!=='string'||!value.nextBefore||value.nextBefore.length>500)
      ||value.hasMore&&!value.nextBefore)throw invalid();
    const jobs=value.jobs.map(v=>parseAnalysisJob(v));if(new Set(jobs.map(j=>j.id)).size!==jobs.length)throw invalid();
    return {jobs,hasMore:value.hasMore,...(typeof value.nextBefore==='string'?{nextBefore:value.nextBefore}:{})};
  }
  async read(key:string, jobID:string, signal?:AbortSignal):Promise<AnalysisJob>{
    if(!id(jobID))throw invalid();const job=parseAnalysisJob((await this.request(`/${encodeURIComponent(jobID)}`,key,signal)).job,true);
    if(job.id!==jobID)throw invalid();return job;
  }
  /** Replays a persisted result into cloud storage only; this endpoint cannot dispatch the model. */
  async saveResult(key:string,jobID:string,signal?:AbortSignal):Promise<AnalysisJob>{
    if(!id(jobID))throw invalid();const job=parseAnalysisJob((await this.request(`/${encodeURIComponent(jobID)}/save`,key,signal,'POST')).job);
    if(job.id!==jobID)throw invalid();return job;
  }
}

/** Device-only attachment references and submission intent are scoped to one account. No session keys are stored here. */
export class AnalysisJobJournal {
  private key:string;
  constructor(endpoint:string, account:string, private storage:StoragePort=localStorage){
    if(!account.trim())throw invalid();this.key=`campus-inbox:analysis-jobs:v1:${normalizeJobEndpoint(endpoint)}:${encodeURIComponent(account.trim().toLowerCase())}`;
  }
  private read():{version:1;submissions:LocalAnalysisSubmission[];dismissed:string[]}{
    const raw=this.storage.getItem(this.key);if(!raw)return{version:1,submissions:[],dismissed:[]};
    try{
      const v=JSON.parse(raw);if(v.version!==1||!Array.isArray(v.submissions)||v.submissions.length>100||!Array.isArray(v.dismissed)||!v.dismissed.every(id))throw invalid();
      for(const s of v.submissions){if(!id(s.requestId)||s.jobId!==null&&!id(s.jobId)||!instant(s.createdAt)||!Array.isArray(s.sources)||!s.sources.length||s.sources.length>20
        ||s.sources.some((d:JobDraft)=>!id(d.id)||typeof d.text!=='string'||!d.text.trim()||!Array.isArray(d.attachments)||!d.attachments.every(id)))throw invalid();}
      return v;
    }catch{throw new AnalysisError('本机的待整理记录暂时无法读取，请保留原文。','INVALID_JOB_JOURNAL');}
  }
  all():LocalAnalysisSubmission[]{return structuredClone(this.read().submissions);}
  put(submission:LocalAnalysisSubmission):void{
    const v=this.read();v.submissions=v.submissions.filter(s=>s.requestId!==submission.requestId);v.submissions.push(structuredClone(submission));
    if(v.submissions.length>100)throw new AnalysisError('本机待整理记录较多，请先确认之前的结果。','JOB_JOURNAL_FULL');
    this.storage.setItem(this.key,JSON.stringify(v));
  }
  remove(requestId:string):void{const v=this.read();v.submissions=v.submissions.filter(s=>s.requestId!==requestId);this.storage.setItem(this.key,JSON.stringify(v));}
  dismissed(jobID:string):boolean{return this.read().dismissed.includes(jobID);}
  dismiss(jobID:string):void{const v=this.read();v.dismissed=[...new Set([...v.dismissed,jobID])].slice(-500);this.storage.setItem(this.key,JSON.stringify(v));}
}

/** File garbage collection protects pending work on this device, including a logged-out account's intent. */
export function pendingAnalysisFiles(storage:Pick<Storage,'length'|'key'|'getItem'>=localStorage):string[]{
  const files=new Set<string>();
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);if(!key?.startsWith('campus-inbox:analysis-jobs:v1:'))continue;
    try{
      const value=JSON.parse(storage.getItem(key)||'null');if(!value||value.version!==1||!Array.isArray(value.submissions))throw invalid();
      for(const submission of value.submissions){if(!Array.isArray(submission.sources))throw invalid();for(const source of submission.sources){if(!Array.isArray(source.attachments)||!source.attachments.every(id))throw invalid();for(const file of source.attachments)files.add(file);}}
    }catch{throw new AnalysisError('待整理附件仍在本机，暂时无法清理。','INVALID_JOB_JOURNAL');}
  }
  return [...files];
}

/** A newer edit or a different account's draft cannot be consumed by an older response. */
export function withoutSubmittedDrafts(current:JobDraft[], submitted:JobDraft[]):JobDraft[]{
  return current.filter(d=>!submitted.some(s=>s.id===d.id&&s.text===d.text&&JSON.stringify(s.attachments)===JSON.stringify(d.attachments)));
}
/** Attach only to extant server-created records. Preserve progress, notes, dates and existing local files. */
export function attachJobFiles(current:Notice[], job:AnalysisJob, submission:LocalAnalysisSubmission):Notice[]{
  if(job.status!=='completed'||job.requestId!==submission.requestId||job.id!==submission.jobId||!job.sources||!job.sourceIndexes
    ||job.sources.length!==submission.sources.length||job.sources.some((s,i)=>s.text.trim()!==submission.sources[i].text.trim()))throw invalid();
  const files=new Map(job.noticeIds.map((noticeID,i)=>[noticeID,submission.sources[job.sourceIndexes![i]].attachments]));
  return current.map(n=>{const ids=files.get(n.id);return ids?.length?{...n,attachments:[...new Set([...n.attachments,...ids])]}:n;});
}
