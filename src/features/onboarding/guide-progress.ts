/** Practice actions must happen before their follow-up navigation unlocks. */
export type GuideProgress={pasted:boolean;generated:boolean;reviewed:boolean;completed:boolean};
export function canAdvanceGuide(step:number,progress:GuideProgress){
 if(step===0)return progress.pasted;
 if(step===1)return progress.pasted&&progress.generated;
 if(step===2)return progress.pasted&&progress.generated&&progress.reviewed;
 if(step===3)return progress.pasted&&progress.generated&&progress.reviewed&&progress.completed;
 return false;
}
