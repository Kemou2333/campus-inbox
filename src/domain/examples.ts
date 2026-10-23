import type {Notice} from './types';
import exampleIDs from './example-ids.json';
import {isLocalDemoNotice} from './local-demo';

// Exact, reviewed catalog IDs, including legacy built-ins. Progress, notes and
// corrections never change identity, and a similarly prefixed personal ID is
// not treated as a built-in. The small registry contains no notice content.
const exampleIDSet=new Set(exampleIDs);
// This exact built-in is already used by the tutorial. Do not title-match or
// remove saved copies: user edits and unrelated evaluation notices must stay.
export const TUTORIAL_EXAMPLE_ID='example-reading-v25-5';
export function selectableExamples<T extends Pick<Notice,'id'>>(catalog:T[]):T[]{return catalog.filter(notice=>notice.id!==TUTORIAL_EXAMPLE_ID);}
export const EXAMPLES_HIDDEN_KEY='campus-inbox:examples-hidden:v1';
export function isExampleNotice(notice:Pick<Notice,'id'>):boolean{return isLocalDemoNotice(notice)||exampleIDSet.has(notice.id);}
export function groupExampleNotices<T extends Pick<Notice,'id'>>(notices:T[]):{personal:T[];examples:T[]}{
  const personal:T[]=[],examples:T[]=[];
  for(const notice of notices)(isExampleNotice(notice)?examples:personal).push(notice);
  return {personal,examples};
}
export function readExamplesHidden(storage:Pick<Storage,'getItem'>):boolean{
  try{return storage.getItem(EXAMPLES_HIDDEN_KEY)==='hidden';}catch{return false;}
}
export function writeExamplesHidden(storage:Pick<Storage,'setItem'>,hidden:boolean):void{
  storage.setItem(EXAMPLES_HIDDEN_KEY,hidden?'hidden':'shown');
}

export interface LegacyExampleFingerprint {id:string;fingerprint:string}

function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,entry])=>[key,canonical(entry)]));
  return value;
}

/** Fingerprint the full normalized record, including all user progress and
 * notes. Only incidental record timestamps are excluded. */
export async function exampleFingerprint(notice:Notice):Promise<string> {
  const {createdAt:_,updatedAt:__,...record}=notice;
  const bytes=new TextEncoder().encode(JSON.stringify(canonical(record)));
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
}

function registry(value:unknown):LegacyExampleFingerprint[] {
  if(!Array.isArray(value)||value.length>2000||value.some(entry=>!entry||typeof entry!=='object'||Object.keys(entry).some(key=>!['id','fingerprint'].includes(key))||typeof entry.id!=='string'||!entry.id||entry.id.length>150||typeof entry.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(entry.fingerprint)))return [];
  const entries=value as LegacyExampleFingerprint[];
  return entries.filter((entry,index)=>entries.findIndex(other=>other.id===entry.id&&other.fingerprint===entry.fingerprint)===index);
}

/** The catalog may contain fingerprints from several built-in releases.
 * Replace only verified, untouched built-ins. Every other record remains a
 * user's record, and protects its original from being loaded twice. */
export async function mergeExamples(current:Notice[],incoming:Notice[],legacyRegistry:unknown){
  const expected=new Map<string,Set<string>>();
  for(const entry of registry(legacyRegistry)){
    const versions=expected.get(entry.id)??new Set<string>();versions.add(entry.fingerprint);expected.set(entry.id,versions);
  }
  let removable=new Set<string>(),verified=false;
  const latest=new Map<string,string>(),currentFingerprints=new Map<string,string>();
  try{
    for(const [id,fingerprint] of await Promise.all(incoming.map(async n=>[n.id,await exampleFingerprint(n)] as const)))latest.set(id,fingerprint);
    const incomingOriginals=new Set(incoming.map(n=>n.originalText));
    const checked=await Promise.all(current.filter(n=>(latest.has(n.id)||incomingOriginals.has(n.originalText))&&(expected.has(n.id)||latest.has(n.id)&&isExampleNotice(n))).map(async n=>{
      const fingerprint=await exampleFingerprint(n);
      currentFingerprints.set(n.id,fingerprint);
      return {id:n.id,unchanged:expected.get(n.id)?.has(fingerprint)===true&&latest.get(n.id)!==fingerprint};
    }));
    removable=new Set(checked.filter(n=>n.unchanged).map(n=>n.id));
    verified=true;
  }catch{/* Without a complete fingerprint check, no existing records move. */}
  const retained=current.filter(n=>!removable.has(n.id));
  const ids=new Set(retained.map(n=>n.id)),originals=new Set(retained.map(n=>n.originalText));
  const owners=new Map<string,Notice[]>();
  for(const notice of retained){const sameSource=owners.get(notice.originalText)??[];sameSource.push(notice);owners.set(notice.originalText,sameSource);}
  // Distinct reviewed catalog IDs may legitimately share one source. Only an
  // exact current catalog copy permits its siblings; a personal or edited
  // owner still protects the source from replacement and duplicate loading.
  const sharedCatalogSources=new Set(verified?[...owners].filter(([,records])=>records.every(n=>isExampleNotice(n)&&latest.has(n.id)&&currentFingerprints.get(n.id)===latest.get(n.id))).map(([source])=>source):[]);
  // Compare against existing records only: several new cards can legitimately
  // belong to the same original, just like one AI analysis of a combined input.
  const additions=incoming.filter(n=>!ids.has(n.id)&&(!originals.has(n.originalText)||isExampleNotice(n)&&sharedCatalogSources.has(n.originalText)));
  return {notices:[...retained,...additions],added:additions.length,replaced:removable.size};
}

/** Refresh only loaded built-ins and add a small batch; a partial catalog must never remove unrelated examples. */
export function selectExampleBatch(current:Notice[],catalog:Notice[],limit=7){
 catalog=selectableExamples(catalog);
 const catalogIDs=new Set(catalog.map(n=>n.id));
 const existing=current.filter(isExampleNotice);
 const ids=new Set(existing.map(n=>n.id));
 const legacySources=new Set(existing.filter(n=>!catalogIDs.has(n.id)).map(n=>n.originalText));
 const loaded=(n:Notice)=>ids.has(n.id)||legacySources.has(n.originalText);
 const unseen=catalog.filter(n=>!loaded(n));
 const additions=new Set(unseen.slice(0,Math.max(0,limit)).map(n=>n.id));
 return {records:catalog.filter(n=>loaded(n)||additions.has(n.id)),remaining:Math.max(0,unseen.length-additions.size)};
}
