const ENTRY_KEY='campus-inbox:first-entry:v1';
const TUTORIAL_KEY='campus-inbox:tutorial:v2';
const sequence=['masthead','composer-title','composer-input','composer-action','feed-tools','feed-results','home-nav'];
type EntryStorage=Pick<Storage,'getItem'|'setItem'>;

/** The current screen enters once. Later pages and newly mounted controls stay still. */
export function createFirstEntryMotion(storage:EntryStorage|null,{force=false}:{force?:boolean}={}){
 let eligible=force;
 try{eligible=force||!!storage&&storage.getItem(ENTRY_KEY)!=='seen'&&storage.getItem(TUTORIAL_KEY)!=='seen';}catch{/* A private browsing restriction must not interrupt entry. */}
 let played=false;
 return {
  get pending(){return eligible&&!played;},
  // Called in a layout effect so every group is hidden before the first paint.
  play(root:ParentNode,reducedMotion:boolean,onSettled?:()=>void){
   const animations:Animation[]=[],finished:Promise<void>[]=[];
   let settled=false,stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
   const settle=()=>{if(settled)return;settled=true;if(timer!==undefined)clearTimeout(timer);onSettled?.();};
   const stop=()=>{if(stopped)return;stopped=true;for(const animation of animations){try{animation.cancel();}catch{/* A broken WebView must not block the rest of the screen. */}}settle();};
   if(!eligible||played){settle();return stop;}
   // Consume the entire entry, rather than playing late-arriving groups on another page.
   played=true;
   try{storage?.setItem(ENTRY_KEY,'seen');}catch{eligible=false;settle();return stop;}
   if(reducedMotion){settle();return stop;}
   const speed=readMotionPreferences(storage).entry,scaled=(milliseconds:number)=>Math.round(milliseconds/speed);
   const groups=new Map<string,HTMLElement[]>();
   for(const element of root.querySelectorAll<HTMLElement>('[data-first-entry]')){
    const key=element.dataset.firstEntry;
    if(!key||!sequence.includes(key)||!element.getClientRects().length)continue;
    groups.set(key,[...(groups.get(key)??[]),element]);
   }
   let stage=0;
   try{
    for(const key of sequence){
     const elements=groups.get(key);if(!elements)continue;
     for(const element of elements){
      const animation=element.animate([
       {opacity:0,transform:'translateY(8px) scale(.985)'},
       {opacity:1,transform:'translateY(0) scale(1)'}
      ],{duration:scaled(1250),delay:scaled(380+stage*280),easing:'cubic-bezier(.35,0,.2,1)',fill:'backwards'});
      animations.push(animation);
      // Without reliable completion support, show the static page immediately.
      if(!animation.finished||typeof animation.finished.then!=='function')throw new Error('Animation completion is unavailable');
      finished.push(animation.finished.then(()=>{},()=>{}));
     }
     stage++;
    }
   }catch{stop();return stop;}
   if(!animations.length){settle();return stop;}
   // Resolve on finish or cancellation. A safety deadline also releases the UI hint
   // on older WebViews whose finished promise can remain pending in the background.
   void Promise.allSettled(finished).then(settle);
   timer=setTimeout(stop,scaled(380+(stage-1)*280)+scaled(1250)+120);
   return stop;
  }
 };
}
import {readMotionPreferences} from './motion-preferences';

