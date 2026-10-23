import type {Notice} from '../../domain/types';
import {getNoticeStatus} from '../../domain/notice';
import {isExampleNotice} from '../../domain/examples';
import {isModelTestNotice} from '../../domain/model-tests';
import type {HomeWidgetSummary} from '../../platform';

export function homeWidgetSummary(notices:readonly Notice[]):HomeWidgetSummary{
 const pending=notices.filter(n=>!isExampleNotice(n)&&!isModelTestNotice(n)&&getNoticeStatus(n)==='pending');
 const newest=pending.reduce<Notice|null>((current,n)=>!current||Date.parse(n.createdAt)>Date.parse(current.createdAt)?n:current,null);
 if(!newest)return {pendingCount:0};
 const corrected=newest.corrections?.values.find(value=>value.path==='title')?.value??newest.title;
 const title=Array.from(corrected.replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim()).slice(0,80).join('');
 return {pendingCount:Math.min(9999,pending.length),title,noticeId:newest.id};
}
const KEY='campus-inbox:home-widget-scope:v1';
type Store=Pick<Storage,'getItem'|'setItem'>;
async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');}
/** Last-state wins; account changes never republish an unchanged previous-account snapshot. */
export function createHomeWidgetPublisher(send:(summary:HomeWidgetSummary|null)=>Promise<void>,storage:Store){
 let revision=0,disposed=false,queue=Promise.resolve();
 return {
  publish(scope:string,summary:HomeWidgetSummary|null,suppress=false){
   const current=++revision;
   queue=queue.catch(()=>{}).then(async()=>{
    if(disposed||current!==revision)return;
    try{
     const [scopeDigest,summaryDigest]=await Promise.all([digest(scope),digest(JSON.stringify(summary))]);
     if(disposed||current!==revision)return;
     const raw=storage.getItem(KEY);let saved:null|{scope:string;blocked:string|null}=null;
     if(raw){try{saved=JSON.parse(raw);if(!saved||typeof saved.scope!=='string'||saved.blocked!==null&&typeof saved.blocked!=='string')throw new Error('invalid widget scope');}catch{saved={scope:scopeDigest,blocked:summaryDigest};}}
     const changed=saved&&saved.scope!==scopeDigest;
     const blocked=changed?summaryDigest:saved?.blocked??null;
     const withheld=suppress||summary===null||blocked===summaryDigest;
     storage.setItem(KEY,JSON.stringify({scope:scopeDigest,blocked:withheld?blocked:null}));
     await send(withheld?null:summary);
    }catch{if(!disposed&&current===revision)await send(null);}
   });
   return queue;
  },
  dispose(){disposed=true;revision++;}
 };
}
