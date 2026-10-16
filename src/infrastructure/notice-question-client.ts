import {AnalysisError,solveProof,type AnalyzeOptions} from './ai-client';
import {parseHumanVerificationRequest} from './verification-challenge';

export interface NoticeQuestionInput {sourceText:string;question:string;requestId:string}
export interface NoticeQuestionAnswer {answer:string;evidence:string[];remainingQuestions:number}
export function parseQuestionAnswer(value:unknown,sourceText:string):NoticeQuestionAnswer {
 const v=value as NoticeQuestionAnswer|null;
 if(!v||typeof v.answer!=='string'||!v.answer.trim()||v.answer.length>1000||!Array.isArray(v.evidence)||v.evidence.length>2||v.evidence.some(q=>typeof q!=='string'||!q||q.length>500||!sourceText.includes(q))||!Number.isInteger(v.remainingQuestions)||v.remainingQuestions<0||v.remainingQuestions>5)throw new AnalysisError('回答格式异常，请稍后查看本次结果。','INVALID_RESPONSE');
 return {answer:v.answer,evidence:v.evidence,remainingQuestions:v.remainingQuestions};
}
/** One notice and one question only; no history, identity profile, notes or attachments. */
export async function askNoticeQuestion(input:NoticeQuestionInput,options:AnalyzeOptions={}):Promise<NoticeQuestionAnswer>{
 if(typeof input.sourceText!=='string'||!input.sourceText.trim()||input.sourceText.length>4000||typeof input.question!=='string'||!input.question.trim()||input.question.trim().length>240||!/^[A-Za-z0-9_-]{16,100}$/.test(input.requestId))throw new AnalysisError('原文最多4,000字，问题最多240字。','INVALID_INPUT');
 if(!options.sessionKey)throw new AnalysisError('请先登录，再提问。','AUTH_REQUIRED',401);
 const url=new URL(options.endpoint??'https://123.57.30.129/analyze');url.pathname=url.pathname.replace(/\/analyze\/?$/,'').replace(/\/$/,'')+'/notice-question';url.search='';url.hash='';url.username='';url.password='';const endpoint=url.href;
 const controller=new AbortController(),cancel=()=>controller.abort();let timedOut=false;
 options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)cancel();
 let timer:ReturnType<typeof setTimeout>|undefined;
 const send=async(proof?:string)=>{
  clearTimeout(timer);timer=setTimeout(()=>{timedOut=true;cancel();},options.timeoutMs??100_000);
  try{
   const response=await (options.fetcher??fetch)(endpoint,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:`Bearer ${options.sessionKey}`,...(proof?{'X-Campus-Proof':proof}:{})},body:JSON.stringify({sourceText:input.sourceText,question:input.question.trim(),requestId:input.requestId}),signal:controller.signal});
   const text=await response.text();if(text.length>16000)throw new AnalysisError('回答过长，请稍后查看本次结果。','INVALID_RESPONSE');
   let value:Record<string,unknown>;try{value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw 0;}catch{throw new AnalysisError('提问服务返回异常，请稍后查看本次结果。','INVALID_RESPONSE',response.status);}
   return {response,value};
  }finally{clearTimeout(timer);}
 };
 try{
  if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
  options.onStage?.('requesting');let {response,value}=await send();
  if(response.status===428&&value.code==='VERIFICATION_REQUIRED'){
   options.onStage?.('verifying');
   const challenge=parseHumanVerificationRequest(value.challenge);
   if(challenge){
    if(!options.onHumanVerification)throw new AnalysisError('请更新应用后完成验证码。','HUMAN_VERIFICATION_REQUIRED',428);
    let remaining=5,error:string|undefined;
    for(let attempt=0;attempt<5;attempt++){
     const answer=await options.onHumanVerification({...challenge,...(error?{error}:{})},controller.signal);
     if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
     if(Date.now()>=challenge.expires)throw new AnalysisError('验证码已过期，请重新提交。','VERIFICATION_EXPIRED');
     if(!/^\d{4}$/.test(answer.trim()))throw new AnalysisError('请输入4位验证码。','INVALID_HUMAN_ANSWER');
     options.onStage?.('requesting');({response,value}=await send(JSON.stringify({token:challenge.token,answer:answer.trim()})));
     const next=value.remainingAttempts;
     if(response.status===400&&value.code==='CAPTCHA_INCORRECT'&&typeof next==='number'&&Number.isInteger(next)&&next>0&&next<remaining){remaining=next;error=typeof value.error==='string'?value.error:'数字不正确，请再试一次。';continue;}break;
    }
   }else{
    const kind=(value.challenge as {type?:unknown}|null)?.type;
    if(kind&&kind!=='pow')throw new AnalysisError('验证码信息异常，请重新提交。','INVALID_CHALLENGE');
    const proof=await solveProof(value.challenge,controller.signal);({response,value}=await send(proof));
   }
  }
  if(!response.ok)throw new AnalysisError(typeof value.error==='string'?value.error:'暂时无法回答，请稍后查看本次结果。',typeof value.code==='string'?value.code:'SERVICE_ERROR',response.status);
  if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
  return parseQuestionAnswer(value,input.sourceText);
 }catch(error){
  if(controller.signal.aborted)throw new AnalysisError(timedOut?'等待较久，可稍后查看本次结果。':'已停止等待，稍后仍可查看本次结果。',timedOut?'TIMEOUT':'CANCELLED');
  if(error instanceof DOMException&&error.name==='AbortError')throw new AnalysisError('已取消验证。','CANCELLED');
  if(error instanceof TypeError)throw new AnalysisError('连接中断，可稍后查看本次结果。','NETWORK_ERROR');
  throw error;
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
