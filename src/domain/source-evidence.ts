import type {Notice} from './types';
import {textField} from './corrections';
import {plainReadingText} from './reading';
import {segmentSource} from '../../server/contracts/source-evidence.js';
export {segmentSource,parseSourceRefs} from '../../server/contracts/source-evidence.js';
export function evidenceFor(n:Notice,path:string){
 const segments=segmentSource(n.originalText),refs=n.sourceRefs?.[path]??[];
 let selected=segments.filter(segment=>refs.includes(segment.index)),inferred=false;
 // Existing records have no AI references. Exact local wording is only a possible match.
 if(!refs.length){const words=plainReadingText(textField(n,path)?.value??'').trim();if(words.length>=4){selected=segments.filter(segment=>segment.text.includes(words)).slice(0,3);inferred=selected.length>0;}}
 const edited=!!n.corrections?.values.some(v=>v.path===path);
 return {segments:selected,edited,inferred,status:edited?'人工修改':inferred?'可能相关':selected.length?'原文出处':'未关联',requested:refs.length};
}
