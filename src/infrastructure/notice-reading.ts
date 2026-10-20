import type {Notice} from '../domain/types';
import {isExampleNotice} from '../domain/examples';

export const NOTICE_READING_KEY_PREFIX='campus-inbox:notice-reading:v1:';
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
interface ReadingState {version:1;known:string[];unread:string[]}
const MAX_KNOWN=4_000;
/** IDs only, never notice text or credentials. A first upgrade treats existing records as read. */
export class NoticeReading {
 constructor(private storage:StoragePort=localStorage){}
 private key(scope:string){return NOTICE_READING_KEY_PREFIX+encodeURIComponent(scope);}
 private read(scope:string):ReadingState|null{
  try{const raw=this.storage.getItem(this.key(scope));if(!raw)return null;const value=JSON.parse(raw);if(value.version!==1||!Array.isArray(value.known)||!Array.isArray(value.unread)||value.known.length>MAX_KNOWN||value.unread.length>MAX_KNOWN||[...value.known,...value.unread].some(id=>typeof id!=='string'||!id||id.length>150))return null;return value;}catch{return null;}
 }
 private write(scope:string,value:ReadingState){this.storage.setItem(this.key(scope),JSON.stringify(value));}
 reconcile(scope:string,notices:Notice[]):string[]{
  const state=this.read(scope),live=new Set(notices.filter(n=>!isExampleNotice(n)).map(n=>n.id));
  if(!state){this.write(scope,{version:1,known:[...live].slice(-MAX_KNOWN),unread:[]});return [];}
  const known=new Set(state.known),unread=new Set(state.unread.filter(id=>live.has(id)));
  for(const id of live)if(!known.has(id))unread.add(id);
  const next={version:1 as const,known:[...state.known.filter(id=>!live.has(id)),...live].slice(-MAX_KNOWN),unread:[...unread].slice(-MAX_KNOWN)};
  if(JSON.stringify(next)!==JSON.stringify(state))this.write(scope,next);return next.unread;
 }
 markRead(scope:string,id:string):void{
  this.markManyRead(scope,[id]);
 }
 markManyRead(scope:string,ids:readonly string[]):void{
  if(!ids.length)return;
  const state=this.read(scope)??{version:1 as const,known:[],unread:[]};
  const read=new Set(ids),next={version:1 as const,known:[...new Set([...state.known,...ids])].slice(-MAX_KNOWN),unread:state.unread.filter(value=>!read.has(value))};
  if(JSON.stringify(next)!==JSON.stringify(state))this.write(scope,next);
 }
}
