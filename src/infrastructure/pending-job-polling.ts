export interface PendingJobPolling {start():void;setPending(value:boolean):void;hasPending():boolean;dispose():void}

/** Read history once; poll only while a submitted result still needs recovery. */
export function createPendingJobPolling(options:{refresh:()=>Promise<void>;visible:()=>boolean;windowEvents:Pick<EventTarget,'addEventListener'|'removeEventListener'>;documentEvents:Pick<EventTarget,'addEventListener'|'removeEventListener'>;delay?:number}):PendingJobPolling{
 let pendingSince:number|null=null;
 let started=false,stopped=false,pending=false,initial=true,running:Promise<void>|null=null,timer:ReturnType<typeof setTimeout>|undefined;
 const clear=()=>{clearTimeout(timer);timer=undefined;};
 const schedule=()=>{clear();if(started&&!stopped&&pending&&!running&&options.visible()){const elapsed=pendingSince===null?0:Date.now()-pendingSince;timer=setTimeout(run,options.delay??(elapsed<20_000?1_000:elapsed<60_000?2_000:5_000));}};
 const run=()=>{
  clear();if(stopped||running||!options.visible())return;
  initial=false;
  running=Promise.resolve().then(options.refresh).finally(()=>{running=null;schedule();});
  void running.catch(()=>{/* The caller owns the visible status and recovery state. */});
 };
 const wake=()=>{if(initial||pending)run();};
 return {
  start(){if(started||stopped)return;started=true;options.windowEvents.addEventListener('online',wake);options.windowEvents.addEventListener('focus',wake);options.documentEvents.addEventListener('visibilitychange',wake);wake();},
  setPending(value){if(value&&!pending)pendingSince=Date.now();if(!value)pendingSince=null;pending=value;schedule();},
  hasPending(){return pending;},
  dispose(){stopped=true;clear();options.windowEvents.removeEventListener('online',wake);options.windowEvents.removeEventListener('focus',wake);options.documentEvents.removeEventListener('visibilitychange',wake);},
 };
}
