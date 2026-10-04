import '../dist/data.js';
import {SYSTEM_PROMPT} from '../worker/prompt.mjs';
const D=globalThis.CampusData;
// A cohort year or school year is not evidence for a calendar deadline.
// Keep the model's wording, but require a complete source timestamp for ISO dates.
function groundedTime(value,raw,notice){
  if(value===null)return null;
  if(typeof value!=='string'||typeof raw!=='string')return value;
  const match=raw.match(/(\d{4})(?:年|[-/])(\d{1,2})(?:月|[-/])(\d{1,2})(?:日|号|\s|T)\s*(\d{1,2})(?:[:：]|时)(\d{2})(?:分)?/);
  if(!match||!notice.replace(/\s/g,'').includes(match[0].replace(/\s/g,'')))return null;
  const [y,m,d,h,mi]=match.slice(1).map(Number);
  const pad=n=>String(n).padStart(2,'0');
  try{
    D.date(`${y}-${pad(m)}-${pad(d)}T00:00:00`);
    if(h===24&&mi===0)return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,19);
    const expected=`${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(mi)}:00`;
    D.date(expected);return expected;
  }catch{return null;}
}
export function groundDates(result,notice){
  if(!result||!Array.isArray(result.notices))return result;
  return {...result,notices:result.notices.map(n=>({...n,
    deadline:groundedTime(n.deadline,n.deadlineText,notice),
    tasks:Array.isArray(n.tasks)?n.tasks.map(t=>({...t,time:groundedTime(t.time,t.timeText,notice)})):n.tasks,
    timeline:Array.isArray(n.timeline)?n.timeline.map(t=>({...t,time:groundedTime(t.time,t.timeText,notice)})):n.timeline
  }))};
}
export class ServiceError extends Error {
  constructor(message,status=502){super(message);this.status=status;}
}
export async function boundedText(stream,limit){
  if(!stream)return '';
  const reader=stream.getReader(),decoder=new TextDecoder();let size=0,text='';
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new ServiceError('通知内容过大。',413);}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
  finally{reader.releaseLock();}
}
export async function analyze(notice,config,modelFetch=fetch){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config.timeoutMs||60000);
  try{
    const payload={model:config.model||'deepseek-flash',thinking:{type:'enabled'},reasoning_effort:'low',max_tokens:6000,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify({notice})}]};
    const upstream=await modelFetch('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.apiKey}`},body:JSON.stringify(payload),signal:controller.signal});
    if(!upstream.ok){await upstream.body?.cancel();throw new ServiceError(upstream.status===429?'AI 服务繁忙，请稍后再试。':upstream.status===402?'AI 账户余额不足，请联系维护者。':'AI 请求失败，请联系维护者检查配置。');}
    const envelope=JSON.parse(await boundedText(upstream.body,200000)),choice=envelope.choices?.[0];
    if(choice?.finish_reason!=='stop')throw new ServiceError('通知较长，整理结果未完整生成，请分段整理。');
    const parsed=JSON.parse(choice.message.content);
    return {result:D.batch(groundDates(parsed,notice),true),usage:{input:Number(envelope.usage?.prompt_tokens)||0,output:Number(envelope.usage?.completion_tokens)||0,reasoning:Number(envelope.usage?.completion_tokens_details?.reasoning_tokens)||0}};
  }catch(e){if(e instanceof ServiceError)throw e;throw new ServiceError(e.name==='AbortError'?'AI 整理超时，请稍后重试。':'AI 未返回有效的整理结果，请稍后重试。');}
  finally{clearTimeout(timer);}
}
