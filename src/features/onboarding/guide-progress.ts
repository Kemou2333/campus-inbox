/** Practice actions must happen before their follow-up navigation unlocks. */
export type GuideProgress={pasted:boolean;generated:boolean;reviewed:boolean;completed:boolean};
export function canAdvanceGuide(step:number,progress:GuideProgress){
 if(step===0)return progress.pasted;
 if(step===1)return progress.pasted&&progress.generated;
 if(step===2)return progress.pasted&&progress.generated&&progress.reviewed;
 if(step===3)return progress.pasted&&progress.generated&&progress.reviewed&&progress.completed;
 return false;
}

/** Actions unlock navigation after a quiet moment; reading itself has no time limit. */
export const GUIDE_READING_PAUSE=1500;
export const GUIDE_COMPLETE_TARGET='[data-guide="notice-complete"], .notice-complete';

export function guideStepTarget(step:number,progress:GuideProgress,expanded:boolean){
 if(step===0)return progress.pasted?'.composer-text textarea':'[data-guide="fill"]';
 if(step===1)return progress.generated?'.notice-card':'[data-guide="organize"]';
 if(step===2)return progress.reviewed?'.task-content':expanded?'.task-expand':'.notice-expand';
 return GUIDE_COMPLETE_TARGET;
}

export function guideReadingTarget(step:number,progress:GuideProgress){
 if(step===0)return progress.pasted?'.composer-text textarea':'.composer-draft';
 if(step===1&&!progress.generated)return '.composer-actions';
 if(step===3)return GUIDE_COMPLETE_TARGET;
 return '.notice-card';
}

export function guideBlockedMessage(step:number,progress:GuideProgress,expanded:boolean){
 if(step===0)return progress.pasted?'示例已填入，可以滚动读一读。看完后点「下一步」。':'先点「填入示例」，用这条通知练习。';
 if(step===1)return progress.generated?'先看看整理后的通知，读完再点「下一步」。':'这一步先点「AI 整理」，其他操作稍后再试。';
 if(step===2)return progress.reviewed?'可以慢慢读具体步骤，看完再点「下一步」。':expanded?'这一步先点待办标题，展开具体步骤。':'这一步先点发光的箭头，展开通知。';
 return progress.completed?'已经完成啦，点「开始使用」结束练习。':'这一步请点通知右侧的大勾，完成整条通知。';
}
