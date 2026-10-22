import type {NoticeRepository} from '../domain/types';
import type {CloudSync} from './sync-client';

/** Upload after real personal-record changes; idle navigation never polls. */
export function installEventSync(repository:Pick<NoticeRepository,'subscribe'>,cloud:Pick<CloudSync,'needsSync'|'syncNow'|'subscribe'>,online:Pick<EventTarget,'addEventListener'|'removeEventListener'>,delay=300){
 let stopped=false,syncing=false,timer:ReturnType<typeof setTimeout>|undefined;
 const schedule=()=>{
  clearTimeout(timer);
  if(stopped||syncing||!cloud.needsSync())return;
  timer=setTimeout(()=>{timer=undefined;if(!stopped&&!syncing&&cloud.needsSync())void cloud.syncNow();},delay);
 };
 const unsubscribeRecords=repository.subscribe(schedule);
 const unsubscribeCloud=cloud.subscribe(state=>{
  syncing=state.status==='syncing';
  // A run emits idle between bounded batches. Cancel its pending debounce
  // when the next batch starts; edits remain visible to that run's dirty check.
  if(syncing||!state.connected)clearTimeout(timer);
  else if(state.status==='idle')schedule();
 });
 online.addEventListener('online',schedule);
 return()=>{stopped=true;clearTimeout(timer);unsubscribeRecords();unsubscribeCloud();online.removeEventListener('online',schedule);};
}
