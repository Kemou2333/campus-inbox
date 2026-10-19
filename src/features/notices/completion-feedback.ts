import {getNoticeStatus} from '../../domain/notice';
import type {Notice} from '../../domain/types';

/** A visual acknowledgement follows an already successful save. */
export function isNewCompletion(result:{before:Notice;after:Notice}|void):boolean{
 return !!result&&getNoticeStatus(result.before)!=='completed'&&getNoticeStatus(result.after)==='completed';
}

/** Deterministic, local particles: no idle loop, randomness or data requests. */
export const completionParticles=Array.from({length:28},(_,index)=>{
 const angle=index/28*Math.PI*2;
 const x=Math.cos(angle)*(124+(index%4)*9),y=Math.sin(angle)*(74+(index%3)*12)-24;
 return {x,y,endX:x*1.08,endY:y+42,delay:(index%4)*24,rotate:index*47,round:index%3===0};
});
