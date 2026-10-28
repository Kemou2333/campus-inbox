export type FirstUseHint='notice-question'|'share-image'|'ai-organize-privacy';
type HintStorage=Pick<Storage,'getItem'|'setItem'>;
const key=(hint:FirstUseHint)=>`campus-inbox:first-use-hint:${hint}:v1`;
const seenInSession=new Set<FirstUseHint>();
/** Only a tiny device-local seen flag; no account, notice or API data. */
export function hasSeenFirstUseHint(hint:FirstUseHint,storage:HintStorage=localStorage):boolean {
 if(seenInSession.has(hint))return true;
 try{return storage.getItem(key(hint))==='seen';}catch{return false;}
}
export function markFirstUseHintSeen(hint:FirstUseHint,storage:HintStorage=localStorage):void {
 seenInSession.add(hint);
 try{storage.setItem(key(hint),'seen');}catch{/* The in-session flag keeps the hint quiet. */}
}
