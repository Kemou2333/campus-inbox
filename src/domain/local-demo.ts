/** Reserved IDs stay local even after users edit or export a sample result. */
export const LOCAL_DEMO_ID_PREFIX='local-demo-v1-';
export function isLocalDemoNotice(notice:{id:string}):boolean{return notice.id.startsWith(LOCAL_DEMO_ID_PREFIX);}
