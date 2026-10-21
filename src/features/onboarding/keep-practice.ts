import type {Notice} from '../../domain/types';
import {GUIDE_NOTICE_ID} from './guide-session';

export const KEPT_PRACTICE_ID='local-demo-v1-first-practice';
/** Keep the completed first practice once. Never replace a saved or edited copy. */
export function keepFirstPractice(current:Notice[],practice:Notice,now=new Date().toISOString()){
 if(practice.id!==GUIDE_NOTICE_ID||!practice.completed)return null;
 if(current.some(n=>n.id===KEPT_PRACTICE_ID))return {id:KEPT_PRACTICE_ID,notices:current};
 const kept={...structuredClone(practice),id:KEPT_PRACTICE_ID,createdAt:now,updatedAt:now};
 return {id:kept.id,notices:[...current,kept]};
}
