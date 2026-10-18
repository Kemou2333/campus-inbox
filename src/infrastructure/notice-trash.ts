import {parseNotice} from '../domain/notice';
import type {Notice} from '../domain/types';
import {MAX_TRASH_BYTES,MAX_TRASH_ITEMS,TRASH_RETENTION_DAYS,type TrashEntry} from '../domain/notice-trash';

export const TRASH_KEY_PREFIX='campus-inbox:trash:v1:';
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'|'length'|'key'>;
const instant=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));

/** Immutable per-entry keys let separate tabs add/forget snapshots without replacing one another's array. */
export class NoticeTrash {
 constructor(private storage:StoragePort=localStorage,private now:()=>number=Date.now){}
 private prefix(scope:string){return TRASH_KEY_PREFIX+encodeURIComponent(scope)+':';}
 private key(scope:string,id:string){return this.prefix(scope)+encodeURIComponent(id);}
 private keys():string[]{const keys=new Set<string>();for(let i=0,length=this.storage.length;i<length;i++){const key=this.storage.key(i);if(key?.startsWith(TRASH_KEY_PREFIX))keys.add(key);}return [...keys];}
 private read(key:string):TrashEntry|null{
  const raw=this.storage.getItem(key);if(raw===null)return null;
  try{
   const suffix=key.slice(TRASH_KEY_PREFIX.length),separator=suffix.indexOf(':');if(separator<0)throw Error();
   const scope=decodeURIComponent(suffix.slice(0,separator)),id=decodeURIComponent(suffix.slice(separator+1));
   const body=JSON.parse(raw),entry=body.entry;
   if(body.version!==1||!entry||typeof entry.id!=='string'||!entry.id||entry.id.length>150||entry.id!==id||this.key(scope,id)!==key||!Number.isSafeInteger(entry.position)||entry.position<0||!instant(entry.deletedAt)||!instant(entry.expiresAt))throw Error();
   return {...entry,notice:parseNotice(entry.notice)};
  }catch{throw new Error('回收站暂时无法读取，原通知未删除。');}
 }
 private stored(scope:string):TrashEntry[]{return this.keys().filter(key=>key.startsWith(this.prefix(scope))).flatMap(key=>{const entry=this.read(key);return entry?[entry]:[];});}
 list(scope:string):TrashEntry[]{return this.stored(scope).filter(entry=>Date.parse(entry.expiresAt)>this.now()).sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));}
 add(scope:string,notice:Notice,position:number):TrashEntry{
  const existing=this.stored(scope),items=existing.filter(entry=>Date.parse(entry.expiresAt)>this.now());
  if(items.length>=MAX_TRASH_ITEMS)throw new Error('回收站已满，请先在设置中清理。');
  const deletedAt=new Date(this.now()).toISOString(),entry={id:crypto.randomUUID(),notice:structuredClone(notice),position,deletedAt,expiresAt:new Date(this.now()+TRASH_RETENTION_DAYS*86400_000).toISOString()};
  const raw=JSON.stringify({version:1,entry}),bytes=new TextEncoder().encode(raw).length+items.reduce((total,item)=>total+new TextEncoder().encode(JSON.stringify({version:1,entry:item})).length,0);
  if(bytes>MAX_TRASH_BYTES)throw new Error('回收站已满，请先在设置中清理。');
  const key=this.key(scope,entry.id);if(this.storage.getItem(key)!==null)throw new Error('回收站正在更新，请重试。');
  // setItem is atomic for this unique key. A competing tab can only add another key, not overwrite this snapshot.
  this.storage.setItem(key,raw);
  // Match the retention policy without touching files; only prune already-expired IDs observed before this add.
  for(const expired of existing.filter(item=>Date.parse(item.expiresAt)<=this.now())){try{this.storage.removeItem(this.key(scope,expired.id));}catch{/* A failed expiry prune must not turn a safely stored new snapshot into a failed add. */}}
  return entry;
 }
 forget(scope:string,id:string):TrashEntry|null{
  const key=this.key(scope,id),entry=this.read(key);if(!entry)return null;
  this.storage.removeItem(key);return entry;
 }
 clear(scope:string):TrashEntry[]{
  const items=this.stored(scope);
  // Delete this snapshot of IDs only. A concurrently added entry is outside this confirmed set.
  for(const entry of items)this.storage.removeItem(this.key(scope,entry.id));
  return items;
 }
 /** Include every account and retained expired snapshot when protecting shared local attachment IDs. */
 attachmentReferences():Pick<Notice,'attachments'>[]{return this.keys().flatMap(key=>{const entry=this.read(key);return entry?[{attachments:entry.notice.attachments}]:[];});}
}
