import '../dist/data.js';
import {SYSTEM_PROMPT} from './prompt.mjs';
const D=globalThis.CampusData;
const mandatory=['schemaVersion','title','summary','deadline','deadlineText','timeline','tasks','materials','warnings'];
function response(body,status,origin){const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};if(origin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type';}return new Response(status===204?null:JSON.stringify(body),{status,headers});}
async function boundedText(stream,limit){if(!stream)return '';const reader=stream.getReader(),decoder=new TextDecoder();let size=0,text='';try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('BODY_LIMIT');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}}
export default {
 async fetch(request,env){
 const origin=request.headers.get('Origin'),allow=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 // No wildcard and no Origin:null; file:// demos never need this endpoint.
 if(!origin||!allow.includes(origin))return response({error:'此网页未获准调用整理服务。'},403,null);
 const url=new URL(request.url);if(url.pathname!=='/analyze')return response({error:'接口不存在。'},404,origin);
 if(request.method==='OPTIONS')return response({},204,origin);
 if(request.method!=='POST')return response({error:'请使用 POST 请求。'},405,origin);
 if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return response({error:'请求必须使用 JSON。'},415,origin);
 if(!env.AI_API_KEY||!env.AI_BASE_URL||!env.AI_MODEL||!env.AI_RATE_LIMITER)return response({error:'整理服务尚未配置完成。'},503,origin);
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 try{if(!(await env.AI_RATE_LIMITER.limit({key:`ip:${ip}`})).success)return response({error:'整理过于频繁，请一分钟后重试。'},429,origin);}catch{return response({error:'整理服务暂时不可用。'},503,origin);}
 let notice;try{const raw=await boundedText(request.body,64000),body=JSON.parse(raw);if(!body||typeof body.notice!=='string'||!body.notice.trim()||body.notice.length>D.MAX_TEXT)throw new Error('INPUT');notice=body.notice.trim();}catch(e){return response({error:e.message==='BODY_LIMIT'?'通知内容过大。':'请提供 1–12,000 字的通知文字。'},e.message==='BODY_LIMIT'?413:400,origin);}
 let endpoint;try{const base=new URL(env.AI_BASE_URL);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new Error();endpoint=base.href.replace(/\/$/,'')+'/chat/completions';}catch{return response({error:'整理服务地址配置有误。'},503,origin);}
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
 try{
 const payload={model:env.AI_MODEL,temperature:0,max_tokens:6000,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify({notice})}]};
 if(env.AI_JSON_MODE!=='false')payload.response_format={type:'json_object'};
 const upstream=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Authorization':`Bearer ${env.AI_API_KEY}`},body:JSON.stringify(payload),signal:controller.signal});
 if(!upstream.ok){if(upstream.body)await upstream.body.cancel();return response({error:upstream.status===429?'AI 服务额度或频率已达上限，请稍后重试。':'AI 服务请求失败，请联系维护者检查配置。'},502,origin);}
 const raw=await boundedText(upstream.body,200000),envelope=JSON.parse(raw),choice=envelope.choices?.[0];
 if(choice?.finish_reason&&choice.finish_reason!=='stop')return response({error:'AI 结果未完整生成，请缩短通知后重试。'},502,origin);
 const content=choice?.message?.content;if(typeof content!=='string')throw new Error('INVALID_RESULT');
 const parsed=JSON.parse(content);if(!parsed||mandatory.some(k=>!Object.hasOwn(parsed,k))||Object.keys(parsed).some(k=>!mandatory.includes(k)))throw new Error('INVALID_RESULT');
 const result=D.analysis(parsed,true);return response(result,200,origin);
 }catch(e){return response({error:e.name==='AbortError'?'AI 整理超时，请稍后重试。':'AI 未返回有效的整理结果，请稍后重试。'},502,origin);}finally{clearTimeout(timeout);}
 }
};
