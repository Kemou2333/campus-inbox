import type {Notice} from './types';
import {textField} from './corrections';
import {segmentSource} from '../../server/contracts/source-evidence.js';
export {segmentSource,parseSourceRefs} from '../../server/contracts/source-evidence.js';
export function evidenceFor(n:Notice,path:string){
 const segments=segmentSource(n.originalText),candidate=n.sourceRefs?.[path];
 // Repeated phrases such as “报名截止时间之前” cannot establish the correct topic.
 // Only explicit, bounded associations may create a source link; legacy prose is never guessed.
 const refs=textField(n,path)?.value.trim()&&Array.isArray(candidate)&&candidate.length>0&&candidate.length<=8&&candidate.every(ref=>Number.isSafeInteger(ref)&&ref>=1&&ref<=segments.length)&&new Set(candidate).size===candidate.length?candidate:[];
 const selected=segments.filter(segment=>refs.includes(segment.index));
 const edited=!!n.corrections?.values.some(v=>v.path===path);
 return {segments:selected,edited,inferred:false,status:edited?'人工修改':selected.length?'原文出处':'未关联',requested:refs.length};
}
