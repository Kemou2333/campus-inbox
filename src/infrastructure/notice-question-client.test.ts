import {describe,test,expect,vi} from 'vitest';
import {askNoticeQuestion,parseQuestionAnswer} from './notice-question-client';
import {markQuestionRejected,prepareQuestion,readQuestion,saveQuestionResult} from './question-journal';
const input={sourceText:'请在10月20日前提交申请表。',question:'要交什么？',requestId:'12345678-1234-1234-1234-123456789abc'};
const result={answer:'提交**申请表**。',evidence:['提交申请表'],remainingQuestions:4};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
const settings={sessionKey:'safe-session-key'};
const memory=()=>{const entries=new Map<string,string>();return {getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>entries.set(key,value),removeItem:(key:string)=>{entries.delete(key);},clear:()=>entries.clear(),key:(index:number)=>Array.from(entries.keys())[index]??null,get length(){return entries.size;}} satisfies Storage;};
describe('single notice question boundary',()=>{
 test('sends only the notice, question and stable request ID',async()=>{
  const fetcher=vi.fn(async()=>reply(result));
  expect(await askNoticeQuestion({...input,profile:'ignore',notes:'private'} as typeof input,{...settings,endpoint:'https://api.example.test/analyze',fetcher})).toEqual(result);
  expect(fetcher).toHaveBeenCalledTimes(1);const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://api.example.test/notice-question');expect(JSON.parse(options.body as string)).toEqual(input);
 });
 test('rejects overlong or anonymous requests before dispatch',async()=>{
  const fetcher=vi.fn();await expect(askNoticeQuestion({...input,question:'问'.repeat(241)},{...settings,fetcher})).rejects.toMatchObject({code:'INVALID_INPUT'});
  await expect(askNoticeQuestion(input,{fetcher})).rejects.toMatchObject({code:'AUTH_REQUIRED'});expect(fetcher).not.toHaveBeenCalled();
 });
 test('rejects invented citations and unbounded answers',()=>{
  expect(()=>parseQuestionAnswer({...result,evidence:['原文没有这句']},input.sourceText)).toThrow();
  expect(()=>parseQuestionAnswer({...result,answer:'字'.repeat(1001)},input.sourceText)).toThrow();
  expect(()=>parseQuestionAnswer({...result,remainingQuestions:6},input.sourceText)).toThrow();
 });
 test('network or paid failures never retry automatically',async()=>{
  const fetcher=vi.fn(async()=>{throw new TypeError('network');});await expect(askNoticeQuestion(input,{...settings,fetcher})).rejects.toMatchObject({code:'NETWORK_ERROR'});expect(fetcher).toHaveBeenCalledTimes(1);
  const failed=vi.fn(async()=>reply({error:'本次失败，请稍后查看。',code:'QUESTION_FAILED'},502));await expect(askNoticeQuestion(input,{...settings,fetcher:failed})).rejects.toMatchObject({code:'QUESTION_FAILED'});expect(failed).toHaveBeenCalledTimes(1);
 });
 test('same-ID processing response asks the user to look later',async()=>{
  const fetcher=vi.fn(async()=>reply({error:'回答中，请稍后查看本次结果。',code:'QUESTION_IN_PROGRESS',retryAfterSeconds:3},409));await expect(askNoticeQuestion(input,{...settings,fetcher})).rejects.toMatchObject({code:'QUESTION_IN_PROGRESS'});expect(fetcher).toHaveBeenCalledTimes(1);
 });
 test('one image verification handshake retains the exact request ID',async()=>{
  const challenge={type:'image',image:'data:image/png;base64,iVBORw0KGgoAAA=',token:'challenge-token',expires:Date.now()+60_000};
  const fetcher=vi.fn().mockResolvedValueOnce(reply({code:'VERIFICATION_REQUIRED',challenge},428)).mockResolvedValueOnce(reply(result));
  const handler=vi.fn(async()=>'1234');expect(await askNoticeQuestion(input,{...settings,fetcher,onHumanVerification:handler})).toEqual(result);expect(handler).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(2);
  const [,options]=fetcher.mock.calls[1];expect(JSON.parse(options.body)).toEqual(input);expect(JSON.parse(options.headers['X-Campus-Proof'])).toEqual({token:'challenge-token',answer:'1234'});
 });
 test('a cancelled request does not start a new paid call',async()=>{
  const controller=new AbortController();controller.abort();const fetcher=vi.fn();await expect(askNoticeQuestion(input,{...settings,signal:controller.signal,fetcher})).rejects.toMatchObject({code:'CANCELLED'});expect(fetcher).not.toHaveBeenCalled();
 });
});
describe('question recovery journal',()=>{
 test('reload recovers the same intent, answer and request ID',async()=>{
  const storage=memory(),first=await prepareQuestion(storage,'kemou','notice-1',input.sourceText,input.question);
  expect(await prepareQuestion(storage,'kemou','notice-1',input.sourceText,input.question)).toEqual(first);
  saveQuestionResult(storage,first,result);expect((await readQuestion(storage,'kemou','notice-1',input.sourceText))?.result).toEqual(result);
 });
 test('accounts, changed sources and changed questions do not reuse old answers',async()=>{
  const storage=memory(),first=await prepareQuestion(storage,'one','n',input.sourceText,input.question);saveQuestionResult(storage,first,result);
  expect(await readQuestion(storage,'two','n',input.sourceText)).toBeNull();expect(await readQuestion(storage,'one','n','changed')).toBeNull();
  const next=await prepareQuestion(storage,'one','n',input.sourceText,'截止是什么时候？');expect(next.requestId).not.toBe(first.requestId);expect(next.result).toBeUndefined();
 });
 test('an unwritable journal stops before issuing a new request',async()=>{
  const storage=memory();storage.setItem=()=>{throw new Error('storage full');};await expect(prepareQuestion(storage,'one','n',input.sourceText,input.question)).rejects.toThrow('storage full');
 });
});

describe('pre-admission errors',()=>{
 test('keeps the request ID but does not present rejected input as a running answer',async()=>{
  const storage=memory(),first=await prepareQuestion(storage,'one','n',input.sourceText,input.question);
  markQuestionRejected(storage,first);expect((await readQuestion(storage,'one','n',input.sourceText))?.rejectedBeforeAdmission).toBe(true);
  const retry=await prepareQuestion(storage,'one','n',input.sourceText,input.question);expect(retry.requestId).toBe(first.requestId);expect(retry.rejectedBeforeAdmission).toBe(false);
 });
});
