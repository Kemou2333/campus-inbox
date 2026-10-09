import './contracts/time.js';
import './contracts/data.js';
import {SYSTEM_PROMPT} from '../worker/prompt.mjs';
const D=globalThis.CampusData;
const T=globalThis.CampusTime;
// A cohort year or school year is not evidence for a calendar deadline.
// Keep the model's wording, but require a complete source timestamp for ISO dates.
function groundedTime(value,raw,notice){
  if(value===null)return null;
  if(typeof value!=='string'||typeof raw!=='string')return value;
  if(T.fromText(raw).type!=='date_time')return null;
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
    ...timeSpec(n,'deadlineSpec',n.deadlineText,notice),
    tasks:Array.isArray(n.tasks)?n.tasks.map(t=>({...t,time:groundedTime(t.time,t.timeText,notice),...timeSpec(t,'timeSpec',t.timeText,notice)})):n.tasks,
    timeline:Array.isArray(n.timeline)?n.timeline.map(t=>({...t,time:groundedTime(t.time,t.timeText,notice),...timeSpec(t,'timeSpec',t.timeText,notice)})):n.timeline
  }))};
}
function timeSpec(item,key,raw,source){
  if(Object.hasOwn(item,key))return {[key]:T.ground(item[key],raw,source)};
  return typeof raw==='string'&&raw.trim()?{[key]:T.ground(T.fromText(raw),raw,source)}:{};
}
const FINISH_REASONS=new Set(['stop','length','content_filter','insufficient_system_resource','aborted','tool_calls','function_call','unknown']);
const FAILURE_CODES=new Set(['INVALID_JSON','TIMELINE_FIELDS','TIMELINE_TIME_TEXT','SUMMARY','ASSIGNEE','LOCATION','TASK_TIME_TEXT','CLASSIFICATION','TASK_FIELDS','STEP_FIELDS','ROOT_FIELDS','SCHEMA_INVALID','SOURCE_COUNT','CONTENT_BOUNDARY','SOURCE_LINK']);
const CONTENT_MESSAGE='这里只能整理校园通知，请提供原通知中的事项、安全提醒或学习信息。';
function contentBoundary(metadata={}){return new ServiceError(CONTENT_MESSAGE,422,{...metadata,failureCode:'CONTENT_BOUNDARY'});}
// Only direct, obvious generation requests are screened here. Campus safety,
// prevention and education notices still reach the existing single model call.
function checkContent(text){
  const direct=text.trim();
  if(/通知|安全提醒|反诈骗|反诈|性教育|健康教育|预防|防范|禁止|举报|危害|案例分析/.test(direct))return;
  const sexual=/^(?:(?:请(?:帮我)?|麻烦|帮我|给我|为我)\s*)?(?:写|创作|生成|扩写|续写)(?:一(?:篇|段|个|部))?(?:露骨(?:的)?|色情(?:的)?|黄色(?:的)?|淫秽(?:的)?)(?:小说|故事|性爱描写|性行为描写)/u;
  const illegal=/^(?:请(?:教我|帮我)?|麻烦|帮我|给我|教我|我想|我要|如何|怎么|怎样)\s*[^\r\n。！？]{0,12}(?:盗取(?:他人|别人)(?:的)?(?:账号|账户|密码)|入侵(?:他人|别人)(?:的)?(?:账号|账户|电脑|网站)|(?:制作|制造)(?:炸弹|毒品)|(?:编写|生成)(?:诈骗话术|钓鱼邮件)|(?:进行|操作|实施)洗钱)/u;
  const english=/^(?:please\s+)?(?:write|generate|create)\s+(?:an?\s+)?(?:explicit\s+)?(?:pornographic|erotic)\s+(?:story|novel|sex scene)\b/i;
  if(sexual.test(direct)||illegal.test(direct)||english.test(direct))throw contentBoundary();
}
function links(text){return text.match(/https?:\/\/[^\s<>"'`*()[\]{}（）【】“”，。！？；：、]+/giu)?.map(value=>value.replace(/[.,;!?]+$/,''))||[];}
function ownSourceLinks(value,source){
  const allowed=links(source);
  // Unicode links must match completely. For an ASCII URL in the original,
  // adjacent Chinese prose can form a word boundary without a separating space.
  // Only allow an exact ASCII prefix followed by Han text; never shorten a
  // Unicode hostname/path or infer, decode, normalize, or fetch a destination.
  const matches=link=>allowed.some(original=>original===link||/^[\x21-\x7E]+$/.test(link)&&original.startsWith(link)&&/^\p{Script=Han}/u.test(original.slice(link.length)));
  const walk=item=>typeof item==='string'?links(item).every(matches):
    Array.isArray(item)?item.every(walk):item&&typeof item==='object'?Object.values(item).every(walk):true;
  return walk(value);
}
function validationCode(error){
  const rules=[[/^时间节点字段/,'TIMELINE_FIELDS'],[/^原文时间/,'TIMELINE_TIME_TEXT'],[/^摘要/,'SUMMARY'],[/^责任对象|^角色任务/,'ASSIGNEE'],[/^地点|^任务地点/,'LOCATION'],[/^任务时间/,'TASK_TIME_TEXT'],[/^通知类别/,'CLASSIFICATION'],[/^任务字段/,'TASK_FIELDS'],[/^步骤字段/,'STEP_FIELDS'],[/^通知字段|^整理结果必须包含/,'ROOT_FIELDS']];
  return rules.find(([pattern])=>pattern.test(error?.message||''))?.[1]||'SCHEMA_INVALID';
}
const count=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;
function tokenUsage(value){
  return {input:count(value?.prompt_tokens),output:count(value?.completion_tokens),reasoning:count(value?.completion_tokens_details?.reasoning_tokens)};
}
function validUsage(value){return ['prompt_tokens','completion_tokens'].every(key=>Number.isSafeInteger(value?.[key])&&value[key]>=0);}
export class ServiceError extends Error {
  constructor(message,status=502,metadata={}){
    super(message);this.status=status;
    if(metadata.usage)this.usage={input:count(metadata.usage.input),output:count(metadata.usage.output),reasoning:count(metadata.usage.reasoning)};
    this.usageAvailable=metadata.usageAvailable===true;
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
  if(notice&&typeof notice==='object'&&!Array.isArray(notice)){
    if(Object.keys(notice).length!==1||!Array.isArray(notice.sources)||!notice.sources.length||notice.sources.length>20)throw new ServiceError('每次请提供 1–20 条通知。',400);
    let total=0;
    const sources=notice.sources.map((source,index)=>{
      if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).length!==1||typeof source.text!=='string'||!source.text.trim())throw new ServiceError('请逐条填写通知文字。',400);
      total+=source.text.length;
      checkContent(source.text);
      return {sourceId:index+1,text:source.text.trim()};
    });
    if(total>D.MAX_TEXT)throw new ServiceError('本次通知合计不能超过 4,000 字。',400);
    return {sources};
  }
  if(typeof notice!=='string'||!notice.trim()||notice.length>D.MAX_TEXT)throw new ServiceError('请提供 1–4,000 字的通知文字。',400);
  checkContent(notice);
  // Legacy text input still supports explicit whole-line separators.
  const parts=notice.split(/^[\t ]*---[\t ]*\r?$/m).map(value=>value.trim()).filter(Boolean);
  if(parts.length>20)throw new ServiceError('每次最多整理 20 条通知，请分批提交。',400);
  return parts.length>=2?{sources:parts.map((text,index)=>({sourceId:index+1,text}))}:{notice};
}
/** Shared with the cost guard so it reserves the same bounded provider payload. */
export function modelPayload(notice,config={}){
  return {model:config.model||'deepseek-flash',thinking:{type:config.thinkingMode==='low'?'enabled':'disabled'},...(config.thinkingMode==='low'?{reasoning_effort:'low'}:{}),max_tokens:config.thinkingMode==='low'?32768:12288,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify(modelInput(notice))}]};
}
function sourceMapping(parsed,sources){
  if(!Array.isArray(parsed?.notices)||!parsed.notices.length||parsed.notices.length>20)throw new Error('source');
  const hasIDs=parsed.notices.some(item=>Object.hasOwn(item||{},'sourceId'));
  if(!hasIDs){
    if(sources&&parsed.notices.length!==sources.length)throw new Error('source');
    return {parsed,indexes:parsed.notices.map((_,index)=>sources?index:0)};
  }
  const limit=sources?.length||1;
  const indexes=parsed.notices.map(item=>{
    if(!item||!Number.isSafeInteger(item.sourceId)||item.sourceId<1||item.sourceId>limit)throw new Error('source');
    return item.sourceId-1;
  });
  if(indexes.some((value,index)=>index>0&&value<indexes[index-1])||new Set(indexes).size!==limit)throw new Error('source');
  return {parsed:{...parsed,notices:parsed.notices.map(({sourceId,...item})=>item)},indexes};
}
export async function analyze(notice,config,modelFetch=fetch,signal){
  const input=modelInput(notice),sources=input.sources;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config.timeoutMs||(config.thinkingMode==='low'?180000:45000));
  const cancel=()=>controller.abort();
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  let usage,finishReason,usageAvailable=false;
  try{
    if(signal?.aborted)throw new ServiceError('整理已取消，请重新提交。',499);
    const payload=modelPayload(notice,config);
    const upstream=await modelFetch('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.apiKey}`},body:JSON.stringify(payload),signal:controller.signal});
    if(!upstream.ok){await upstream.body?.cancel();throw new ServiceError(upstream.status===429?'AI 服务繁忙，请稍后再试。':upstream.status===402?'AI 账户余额不足，请联系维护者。':'AI 请求失败，请联系维护者检查配置。');}
    const envelope=JSON.parse(await boundedText(upstream.body,200000)),choice=envelope?.choices?.[0];
    usage=tokenUsage(envelope?.usage);
    usageAvailable=validUsage(envelope?.usage);
    finishReason=FINISH_REASONS.has(choice?.finish_reason)?choice.finish_reason:'unknown';
    if(signal?.aborted)throw new ServiceError('整理已取消，请重新提交。',499,{usage,finishReason});
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
    if(parsed?.schemaVersion===4&&parsed.refusal==='UNSUPPORTED_REQUEST'&&Object.keys(parsed).length===2)throw contentBoundary({usage,finishReason});
    if(parsed&&Object.hasOwn(parsed,'refusal'))throw new ServiceError('AI 未返回有效的整理结果，请稍后重试。',502,{usage,finishReason,failureCode:'SCHEMA_INVALID'});
    if(choice.message.tool_calls||choice.message.function_call)throw new ServiceError('AI 未返回有效的整理结果，请稍后重试。',502,{usage,finishReason,failureCode:'SCHEMA_INVALID'});
    let mapping;
    try{mapping=sourceMapping(parsed,sources);parsed=mapping.parsed;}catch{throw new ServiceError('AI 没有完整对应本次原文，请稍后重试。',502,{usage,finishReason,failureCode:'SOURCE_COUNT'});}
    try{
      const grounded=sources?{...parsed,notices:parsed.notices.map((item,index)=>groundDates({notices:[item]},sources[mapping.indexes[index]].text).notices[0])}:groundDates(parsed,notice);
      result=D.batch(grounded,true);
    }catch(error){throw new ServiceError('AI 未返回有效的整理结果，请稍后重试。',502,{usage,finishReason,failureCode:validationCode(error)});}
    if(!result.notices.every((item,index)=>ownSourceLinks(item,sources?sources[mapping.indexes[index]].text:notice)))throw new ServiceError('AI 返回的链接无法对应原通知，请稍后重试。',502,{usage,finishReason,failureCode:'SOURCE_LINK'});
    // Old clients still accept ordinary one-source/one-card batches unchanged.
    if(sources&&(mapping.indexes.length!==sources.length||mapping.indexes.some((value,index)=>value!==index)))result={...result,sourceIndexes:mapping.indexes};
    return {result,usage,usageAvailable,finishReason};
  }catch(e){if(e instanceof ServiceError){e.usageAvailable=usageAvailable;throw e;}if(signal?.aborted)throw new ServiceError('整理已取消，请重新提交。',499,{usage,usageAvailable,finishReason});throw new ServiceError(e.name==='AbortError'?'AI 整理超时，请稍后重试。':'AI 未返回有效的整理结果，请稍后重试。',502,{usage,usageAvailable,finishReason});}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
