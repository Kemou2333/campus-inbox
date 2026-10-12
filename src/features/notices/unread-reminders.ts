import {getNoticeStatus} from '../../domain/notice';
import type {Notice} from '../../domain/types';

const KEY='campus-inbox:unread-reminders:v1';
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
const validID=(id:unknown):id is string=>typeof id==='string'&&/^ai-[A-Za-z0-9_-]{1,147}$/.test(id);

/** This only stores result IDs, never notice contents or account credentials. */
export function readUnreadReminderIDs(storage:StoragePort):string[]{
 try{const value=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(value)&&value.length<=500&&value.every(validID)?[...new Set(value)]:[];}catch{return [];}
}
export function writeUnreadReminderIDs(storage:StoragePort,ids:string[]):void{
 try{storage.setItem(KEY,JSON.stringify(ids));}catch{/* The visible prompt still works if browser storage is unavailable. */}
}
/** New cloud information results need an explicit route to their reminder tab.
 * Repeated polling never navigates or treats examples as newly generated results. */
export function nextUnreadReminderIDs(previous:Notice[],current:Notice[],unread:string[]):string[]{
 const known=new Set(previous.map(n=>n.id));
 const reminders=current.filter(n=>validID(n.id)&&getNoticeStatus(n)==='reminder');
 const live=new Set(reminders.map(n=>n.id));
 return [...new Set([...reminders.filter(n=>!known.has(n.id)).map(n=>n.id),...unread.filter(id=>live.has(id))])].slice(0,500);
}
