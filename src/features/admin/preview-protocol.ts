import {parseNotice} from '../../domain/notice';
import type {Notice} from '../../domain/types';

export const ADMIN_ORIGIN='https://123.57.30.129';
export const PREVIEW_DATA='campus-admin-preview';
export const PREVIEW_READY='campus-admin-preview:ready';
export const PREVIEW_HEIGHT='campus-admin-preview:height';

/** This entry accepts data only from its own trusted admin parent. Unknown messages do nothing. */
export function trustedPreviewMessage(event:Pick<MessageEvent,'origin'|'source'>,parent:MessageEventSource|null){
 return parent!==null&&event.origin===ADMIN_ORIGIN&&event.source===parent;
}
export function parsePreviewData(value:unknown):Notice[]|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const data=value as Record<string,unknown>;
 if(data.type!==PREVIEW_DATA)return null;
 if(Object.keys(data).some(key=>!['type','notice','records'].includes(key)))throw new Error('预览消息包含不支持的字段。');
 const single=Object.hasOwn(data,'notice'),multiple=Object.hasOwn(data,'records');
 if(single===multiple)throw new Error('预览消息格式不正确。');
 const values=single?[data.notice]:data.records;
 if(!Array.isArray(values)||values.length>20)throw new Error('一次最多预览 20 条通知。');
 const records=values.map(parseNotice);
 if(new Set(records.map(n=>n.id)).size!==records.length)throw new Error('通知编号重复。');
 return records;
}
