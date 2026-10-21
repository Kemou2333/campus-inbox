import type {Notice} from './types';
import type {TrashEntry} from './notice-trash';

/** Explicitly reset catalog records only. Personal records and their trash stay intact. */
export function planExampleReset(current:Notice[],catalog:Notice[],trash:TrashEntry[],now=new Date().toISOString()){
 const catalogIDs=new Set(catalog.map(n=>n.id));
 const selected=new Set([...current.map(n=>n.id),...trash.map(e=>e.notice.id)].filter(id=>catalogIDs.has(id)));
 const fresh=(selected.size?catalog.filter(n=>selected.has(n.id)):catalog.slice(0,5)).map(n=>({...structuredClone(n),updatedAt:now}));
 return {notices:[...current.filter(n=>!catalogIDs.has(n.id)),...fresh],restored:fresh.length,remaining:catalog.length-fresh.length,
  trashIDs:trash.filter(e=>catalogIDs.has(e.notice.id)).map(e=>e.id),firstID:fresh[0]?.id};
}
