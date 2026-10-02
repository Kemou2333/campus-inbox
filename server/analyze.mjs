import '../dist/data.js';
import {SYSTEM_PROMPT} from '../worker/prompt.mjs';
const D=globalThis.CampusData;
const fields=['schemaVersion','title','summary','deadline','deadlineText','timeline','tasks','materials','warnings'];
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
    const payload={model:config.model||'deepseek-flash',thinking:{type:'disabled'},max_tokens:3000,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify({notice})}]};
    const upstream=await modelFetch('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.apiKey}`},body:JSON.stringify(payload),signal:controller.signal});
    if(!upstream.ok){await upstream.body?.cancel();throw new ServiceError(upstream.status===429?'AI 服务繁忙，请稍后再试。':upstream.status===402?'AI 账户余额不足，请联系维护者。':'AI 请求失败，请联系维护者检查配置。');}
    const envelope=JSON.parse(await boundedText(upstream.body,200000)),choice=envelope.choices?.[0];
    if(choice?.finish_reason!=='stop')throw new ServiceError('通知较长，整理结果未完整生成，请分段整理。');
    const parsed=JSON.parse(choice.message.content);
    if(!parsed||fields.some(k=>!Object.hasOwn(parsed,k))||Object.keys(parsed).some(k=>!fields.includes(k)))throw new Error('INVALID_RESULT');
    return {result:D.analysis(parsed,true),usage:{input:Number(envelope.usage?.prompt_tokens)||0,output:Number(envelope.usage?.completion_tokens)||0}};
  }catch(e){if(e instanceof ServiceError)throw e;throw new ServiceError(e.name==='AbortError'?'AI 整理超时，请稍后重试。':'AI 未返回有效的整理结果，请稍后重试。');}
  finally{clearTimeout(timer);}
}
