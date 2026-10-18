import type {Notice} from './types';
import {LOCAL_DEMO_ID_PREFIX} from './local-demo';
import {isExampleNotice} from './examples';
export const TRASH_RETENTION_DAYS=30;
export const MAX_TRASH_ITEMS=50;
export const MAX_TRASH_BYTES=2*1024*1024;
export interface TrashEntry {id:string;notice:Notice;position:number;deletedAt:string;expiresAt:string}
/** Restore is an explicit new copy; a historical cloud tombstone keeps its original identity. */
export function restoredTrashNotice(entry:TrashEntry,now=new Date().toISOString(),newID:string=crypto.randomUUID()):Notice{
 return {...structuredClone(entry.notice),id:isExampleNotice(entry.notice)?`${LOCAL_DEMO_ID_PREFIX}${newID}`:`restored-${newID}`,updatedAt:now};
}
