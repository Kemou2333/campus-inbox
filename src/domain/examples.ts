import type {Notice} from './types';
import exampleIDs from './example-ids.json';

// Exact, reviewed catalog IDs, including legacy built-ins. Progress, notes and
// corrections never change identity, and a similarly prefixed personal ID is
// not treated as a built-in. The small registry contains no notice content.
const exampleIDSet=new Set(exampleIDs);
export const EXAMPLES_HIDDEN_KEY='campus-inbox:examples-hidden:v1';
export function isExampleNotice(notice:Pick<Notice,'id'>):boolean{return exampleIDSet.has(notice.id);}
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
  let removable=new Set<string>();
  try{
    const latest=new Map(await Promise.all(incoming.map(async n=>[n.id,await exampleFingerprint(n)] as const)));
    const checked=await Promise.all(current.filter(n=>expected.has(n.id)).map(async n=>{
      const fingerprint=await exampleFingerprint(n);
      return {id:n.id,unchanged:expected.get(n.id)!.has(fingerprint)&&latest.get(n.id)!==fingerprint};
    }));
    removable=new Set(checked.filter(n=>n.unchanged).map(n=>n.id));
  }catch{/* Without a complete fingerprint check, no existing records move. */}
  const retained=current.filter(n=>!removable.has(n.id));
  const ids=new Set(retained.map(n=>n.id)),originals=new Set(retained.map(n=>n.originalText));
  // Compare against existing records only: several new cards can legitimately
  // belong to the same original, just like one AI analysis of a combined input.
  const additions=incoming.filter(n=>!ids.has(n.id)&&!originals.has(n.originalText));
  return {notices:[...retained,...additions],added:additions.length,replaced:removable.size};
}
