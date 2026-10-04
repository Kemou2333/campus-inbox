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
const FAILURE_CODES=new Set(['INVALID_JSON','TIMELINE_FIELDS','TIMELINE_TIME_TEXT','SUMMARY','ASSIGNEE','LOCATION','TASK_TIME_TEXT','CLASSIFICATION','TASK_FIELDS','STEP_FIELDS','ROOT_FIELDS','SCHEMA_INVALID','SOURCE_COUNT']);
function validationCode(error){
  const rules=[[/^时间节点字段/,'TIMELINE_FIELDS'],[/^原文时间/,'TIMELINE_TIME_TEXT'],[/^摘要/,'SUMMARY'],[/^责任对象|^角色任务/,'ASSIGNEE'],[/^地点|^任务地点/,'LOCATION'],[/^任务时间/,'TASK_TIME_TEXT'],[/^通知类别/,'CLASSIFICATION'],[/^任务字段/,'TASK_FIELDS'],[/^步骤字段/,'STEP_FIELDS'],[/^通知字段|^整理结果必须包含/,'ROOT_FIELDS']];
  return rules.find(([pattern])=>pattern.test(error?.message||''))?.[1]||'SCHEMA_INVALID';
}
const count=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;
function tokenUsage(value){
  return {input:count(value?.prompt_tokens),output:count(value?.completion_tokens),reasoning:count(value?.completion_tokens_details?.reasoning_tokens)};
}
export class ServiceError extends Error {
  constructor(message,status=502,metadata={}){
    super(message);this.status=status;
    if(metadata.usage)this.usage={input:count(metadata.usage.input),output:count(metadata.usage.output),reasoning:count(metadata.usage.reasoning)};
    if(metadata.finishReason)this.finishReason=FINISH_REASONS.has(metadata.finishReason)?metadata.finishReason:'unknown';
    if(FAILURE_CODES.has(metadata.failureCode))this.failureCode=metadata.failureCode;
  }
}
export async function boundedText(stream,limit){
  if(!stream)return '';
  const reader=stream.getReader(),decoder=new TextDecoder();let size=0,text='';
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new ServiceError('通知内容过大。',413);}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
  finally{reader.releaseLock();}
}
export function modelInput(notice){
  // Only explicit whole-line separators establish independent source boundaries.
  const parts=notice.split(/^[\t ]*---[\t ]*\r?$/m).map(value=>value.trim()).filter(Boolean);
  if(parts.length>20)throw new ServiceError('每次最多整理 20 条通知，请分批提交。',400);
  return parts.length>=2?{sources:parts.map((text,index)=>({sourceId:index+1,text}))}:{notice};
}
export async function analyze(notice,config,modelFetch=fetch){
  const input=modelInput(notice),sources=input.sources;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config.timeoutMs||60000);
  let usage,finishReason;
  try{
    const payload={model:config.model||'deepseek-flash',thinking:{type:'disabled'},reasoning_effort:'none',temperature:0.2,max_tokens:8192,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify(input)}]};
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
    let parsed,result;
    try{parsed=JSON.parse(choice.message.content);}catch{throw new ServiceError('AI 未返回有效的整理结果，请稍后重试。',502,{usage,finishReason,failureCode:'INVALID_JSON'});}
    if(sources&&(!Array.isArray(parsed?.notices)||parsed.notices.length!==sources.length))throw new ServiceError('AI 未能逐条整理完整通知，请分批提交。',502,{usage,finishReason,failureCode:'SOURCE_COUNT'});
    try{
      const grounded=sources?{...parsed,notices:parsed.notices.map((item,index)=>groundDates({notices:[item]},sources[index].text).notices[0])}:groundDates(parsed,notice);
      result=D.batch(grounded,true);
    }catch(error){throw new ServiceError('AI 未返回有效的整理结果，请稍后重试。',502,{usage,finishReason,failureCode:validationCode(error)});}
    return {result,usage,finishReason};
  }catch(e){if(e instanceof ServiceError)throw e;throw new ServiceError(e.name==='AbortError'?'AI 整理超时，请稍后重试。':'AI 未返回有效的整理结果，请稍后重试。',502,{usage,finishReason});}
  finally{clearTimeout(timer);}
}
