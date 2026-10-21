import type {Draft} from '../../app/useCampus';
import type {Notice} from '../../domain/types';
import {createDemoNotice,demoOriginal} from './demo-notice';
import {GUEST_DEMO_MARKER} from '../../infrastructure/guest-demo';

export const GUIDE_DRAFT_ID='guide-practice-draft';
export const GUIDE_NOTICE_ID='local-demo-v1-guide-practice';
export type GuideSnapshot={draft:Draft;notice:Notice|null;busy:boolean;filled:boolean};

/** A disposable, in-memory practice. It has no repository, network or storage dependency. */
export function createGuideSession(onChange:()=>void=()=>{}){
 let snapshot:GuideSnapshot=empty(),beforeCompletion:Notice|null=null,generation=0,timer:ReturnType<typeof setTimeout>|undefined,pending:((value:boolean)=>void)|null=null;
 function empty():GuideSnapshot{return {draft:{id:GUIDE_DRAFT_ID,text:'',attachments:[]},notice:null,busy:false,filled:false};}
 function publish(next:GuideSnapshot){snapshot=next;onChange();}
 function stop(){generation++;if(timer!==undefined)clearTimeout(timer);timer=undefined;pending?.(false);pending=null;}
 return {
  get snapshot(){return snapshot;},
  reset(){stop();beforeCompletion=null;publish(empty());},
  dispose(){stop();beforeCompletion=null;snapshot=empty();},
  rewindCompletion(){if(!snapshot.notice?.completed||!beforeCompletion)return;publish({...snapshot,notice:structuredClone(beforeCompletion)});beforeCompletion=null;},
  fill(){if(snapshot.busy)return null;publish({...snapshot,draft:{id:GUIDE_DRAFT_ID,text:demoOriginal,attachments:[],demo:GUEST_DEMO_MARKER},notice:null,filled:true});return GUIDE_DRAFT_ID;},
  organize(delay=1800):Promise<boolean>{
   if(snapshot.busy||!snapshot.filled||snapshot.notice)return Promise.resolve(false);
   const current=++generation;publish({...snapshot,busy:true});
   return new Promise(resolve=>{pending=resolve;timer=setTimeout(()=>{
    timer=undefined;pending=null;if(current!==generation){resolve(false);return;}
    const notice=createDemoNotice();notice.id=GUIDE_NOTICE_ID;
    publish({...snapshot,busy:false,notice});resolve(true);
   },delay);});
  },
  act(id:string,change:(notice:Notice)=>Notice){
   const before=snapshot.notice;if(!before||before.id!==id)return undefined;
   const after=change(structuredClone(before));if(after.id!==before.id)return undefined;
   if(!before.completed&&after.completed)beforeCompletion=structuredClone(before);
   publish({...snapshot,notice:after});return {before,after};
  }
 };
}
