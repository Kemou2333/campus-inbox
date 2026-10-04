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
const FINISH_REASONS=new Set(['stop','length','content_filter','insufficient_system_resource','aborted','tool_calls','function_call','unknown']);
const count=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;
function tokenUsage(value){
  return {input:count(value?.prompt_tokens),output:count(value?.completion_tokens),reasoning:count(value?.completion_tokens_details?.reasoning_tokens)};
}
export class ServiceError extends Error {
  constructor(message,status=502,metadata={}){
    super(message);this.status=status;
    if(metadata.usage)this.usage={input:count(metadata.usage.input),output:count(metadata.usage.output),reasoning:count(metadata.usage.reasoning)};
    if(metadata.finishReason)this.finishReason=FINISH_REASONS.has(metadata.finishReason)?metadata.finishReason:'unknown';
  }
}
export async function boundedText(stream,limit){
  if(!stream)return '';
  const reader=stream.getReader(),decoder=new TextDecoder();let size=0,text='';
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new ServiceError('通知内容过大。',413);}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
  finally{reader.releaseLock();}
}
export async function analyze(notice,config,modelFetch=fetch){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config.timeoutMs||60000);
  let usage,finishReason;
  try{
    const payload={model:config.model||'deepseek-flash',thinking:{type:'enabled'},reasoning_effort:'low',max_tokens:8192,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify({notice})}]};
    const upstream=await modelFetch('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.apiKey}`},body:JSON.stringify(payload),signal:controller.signal});
    if(!upstream.ok){await upstream.body?.cancel();throw new ServiceError(upstream.status===429?'AI 服务繁忙，请稍后再试。':upstream.status===402?'AI 账户余额不足，请联系维护者。':'AI 请求失败，请联系维护者检查配置。');}
    const envelope=JSON.parse(await boundedText(upstream.body,200000)),choice=envelope?.choices?.[0];
    usage=tokenUsage(envelope?.usage);
    finishReason=FINISH_REASONS.has(choice?.finish_reason)?choice.finish_reason:'unknown';
    if(finishReason!=='stop'){
      const failures={
        length:['整理结果未完整生成，请减少本次通知数量或分段整理。',502],
        insufficient_system_resource:['AI 服务暂时繁忙，结果未完整生成，请稍后再试。',503],
        aborted:['AI 整理已中断，请稍后再试。',503],
        content_filter:['这条通知暂时无法整理，请调整内容后再试。',502]
      };
      const [message,status]=failures[finishReason]||['AI 未返回完整的整理结果，请稍后再试。',502];
      throw new ServiceError(message,status,{usage,finishReason});
    }
    const parsed=JSON.parse(choice.message.content);
    return {result:D.batch(groundDates(parsed,notice),true),usage,finishReason};
  }catch(e){if(e instanceof ServiceError)throw e;throw new ServiceError(e.name==='AbortError'?'AI 整理超时，请稍后重试。':'AI 未返回有效的整理结果，请稍后重试。',502,{usage,finishReason});}
  finally{clearTimeout(timer);}
}
