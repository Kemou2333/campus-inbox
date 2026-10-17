import {MAX_NOTICES,parseNotices} from '../domain/notice';
import {isLocalDemoNotice} from '../domain/local-demo';
import type {Notice,NoticeRepository} from '../domain/types';

export const LOCAL_DEMOS_KEY='campus-inbox:notices:local-demo:v1';
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type StorageEvents=Pick<Window,'addEventListener'|'removeEventListener'>;

/** UI reads both stores. CloudSync receives only the separate personal repository. */
export class LocalDemoRepository implements NoticeRepository {
 private listeners=new Set<(notices:Notice[])=>void>();
 private unsubscribe:(()=>void)|null=null;
 private saving=false;
 constructor(private personal:NoticeRepository,private storage:StoragePort=localStorage,private events?:StorageEvents){}
 private demos():Notice[]{
  const raw=this.storage.getItem(LOCAL_DEMOS_KEY);if(!raw)return [];
  const rows=parseNotices(JSON.parse(raw));
  if(rows.some(n=>!isLocalDemoNotice(n)))throw new Error('本机示例格式异常，请先导出备份。');
  return rows;
 }
 load():Notice[]{return [...this.personal.load(),...this.demos()];}
 save(notices:Notice[]):void{
  if(notices.length>MAX_NOTICES)throw new Error(`最多保存 ${MAX_NOTICES} 条通知`);
  const currentPersonal=this.personal.load(),personal=notices.filter(n=>!isLocalDemoNotice(n)),demos=notices.filter(isLocalDemoNotice);
  const old=this.storage.getItem(LOCAL_DEMOS_KEY),next=demos.length?JSON.stringify(demos):null;
  this.saving=true;
  try{
   if(old!==next){if(next===null)this.storage.removeItem(LOCAL_DEMOS_KEY);else this.storage.setItem(LOCAL_DEMOS_KEY,next);}
   if(JSON.stringify(currentPersonal)!==JSON.stringify(personal))this.personal.save(personal);
  }catch(error){
   // A failed personal save must not silently consume or alter a sample result.
   if(old!==next){if(old===null)this.storage.removeItem(LOCAL_DEMOS_KEY);else this.storage.setItem(LOCAL_DEMOS_KEY,old);}
   throw error;
  }finally{this.saving=false;}
  this.emit();
 }
 private emit=()=>{if(!this.saving){const records=this.load();this.listeners.forEach(listener=>listener(structuredClone(records)));}};
 private storageChanged=(event:Event)=>{const value=event as StorageEvent;if(value.key===LOCAL_DEMOS_KEY&&(value.storageArea===undefined||value.storageArea===null||value.storageArea===this.storage))this.emit();};
 subscribe(listener:(notices:Notice[])=>void):()=>void{
  if(!this.listeners.size){this.unsubscribe=this.personal.subscribe(this.emit);this.events?.addEventListener('storage',this.storageChanged);}
  this.listeners.add(listener);
  return()=>{this.listeners.delete(listener);if(!this.listeners.size){this.unsubscribe?.();this.unsubscribe=null;this.events?.removeEventListener('storage',this.storageChanged);}};
 }
}
export function createLocalDemoRepository(personal:NoticeRepository){return new LocalDemoRepository(personal,localStorage,typeof window==='undefined'?undefined:window);}
