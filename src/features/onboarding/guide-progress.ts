/** Practice actions must happen before their follow-up navigation unlocks. */
export type GuideProgress={pasted:boolean;generated:boolean;reviewed:boolean;completed:boolean};
export function canAdvanceGuide(step:number,progress:GuideProgress){
 if(step===0)return progress.pasted;
 if(step===1)return progress.pasted&&progress.generated;
 if(step===2)return progress.pasted&&progress.generated&&progress.reviewed;
 if(step===3)return progress.pasted&&progress.generated&&progress.reviewed&&progress.completed;
 return false;
}
/** A successful action leaves a moment to read before the next instruction is enabled. */
export const GUIDE_READING_PAUSE=1100;
export function guideStepTarget(step:number,progress:GuideProgress,expanded:boolean){
 if(step===0)return '[data-guide="fill"]';
 if(step===1)return progress.generated?'.notice-card':'[data-guide="organize"]';
 if(step===2)return progress.reviewed?'.task-content':expanded?'.task-expand':'.notice-expand';
 return progress.completed?'.notice-card':'.task-list .MuiCheckbox-root';
}
