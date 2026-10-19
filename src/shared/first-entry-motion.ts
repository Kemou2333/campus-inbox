const ENTRY_KEY='campus-inbox:first-entry:v1';
const TUTORIAL_KEY='campus-inbox:tutorial:v2';
const sequence=['masthead','composer-title','composer-input','composer-action','feed-tools','feed-results','home-nav'];
type EntryStorage=Pick<Storage,'getItem'|'setItem'>;

/** One short welcome per new device, with each visible surface introduced once. */
export function createFirstEntryMotion(storage:EntryStorage|null){
 let eligible=false;
 try{eligible=!!storage&&storage.getItem(ENTRY_KEY)!=='seen'&&storage.getItem(TUTORIAL_KEY)!=='seen';}catch{/* Storage restrictions should never interrupt entry. */}
 const introduced=new Set<string>();
 let recorded=false;
 return {
  play(root:ParentNode,reducedMotion:boolean){
   if(!eligible)return ()=>{};
   if(!recorded){try{storage?.setItem(ENTRY_KEY,'seen');recorded=true;}catch{eligible=false;return ()=>{};}}
   const groups=new Map<string,HTMLElement[]>();
   for(const element of root.querySelectorAll<HTMLElement>('[data-first-entry]')){
    const key=element.dataset.firstEntry;
    if(!key||introduced.has(key)||!sequence.includes(key)||!element.getClientRects().length)continue;
    groups.set(key,[...(groups.get(key)??[]),element]);
   }
   const animations:Animation[]=[];
   let stage=0;
   for(const key of sequence){
    const elements=groups.get(key);if(!elements)continue;
    introduced.add(key);
    if(!reducedMotion)for(const element of elements){
     // Every control remains usable; opacity never reaches zero and no overlay is added.
     try{animations.push(element.animate([
      {opacity:.4,transform:'translateY(12px) scale(.993)'},
      {opacity:1,transform:'translateY(0) scale(1)'}
     ],{duration:840,delay:stage*180,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'}));}catch{/* Older WebViews simply show the final layout. */}
    }
    stage++;
   }
   return ()=>animations.forEach(animation=>animation.cancel());
  }
 };
}
