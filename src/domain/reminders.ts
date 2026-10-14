/** Stable, separate alarm identities. Native records retain the parent notice ID
 * for navigation and cancellation; changing one task never replaces its siblings. */
export function localReminderID(noticeID:string,taskID?:string):string{
 return taskID?`${noticeID}::task::${taskID}`:noticeID;
}
