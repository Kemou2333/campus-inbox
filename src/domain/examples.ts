import type {Notice} from './types';

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
  if(new Set(value.map(entry=>entry.id)).size!==value.length)return [];
  return value as LegacyExampleFingerprint[];
}

/** The catalog may contain fingerprints from several built-in releases.
 * Replace only verified, untouched built-ins. Every other record remains a
 * user's record, and protects its original from being loaded twice. */
export async function mergeExamples(current:Notice[],incoming:Notice[],legacyRegistry:unknown){
  const expected=new Map(registry(legacyRegistry).map(entry=>[entry.id,entry.fingerprint]));
  let removable=new Set<string>();
  try{
    const checked=await Promise.all(current.filter(n=>expected.has(n.id)).map(async n=>({id:n.id,unchanged:await exampleFingerprint(n)===expected.get(n.id)})));
    removable=new Set(checked.filter(n=>n.unchanged).map(n=>n.id));
  }catch{/* Without a complete fingerprint check, no existing records move. */}
  const retained=current.filter(n=>!removable.has(n.id));
  const ids=new Set(retained.map(n=>n.id)),originals=new Set(retained.map(n=>n.originalText));
  // Compare against existing records only: several new cards can legitimately
  // belong to the same original, just like one AI analysis of a combined input.
  const additions=incoming.filter(n=>!ids.has(n.id)&&!originals.has(n.originalText));
  return {notices:[...retained,...additions],added:additions.length,replaced:removable.size};
}
