import {useCallback,useEffect,useRef,useState} from 'react';
import type {HumanVerificationRequest} from '../../infrastructure/ai-client';

interface PendingVerification {
 resolve:(token:string)=>void;
 reject:(error:Error)=>void;
 cleanup:()=>void;
}

/** A verification dialog owns one pending request and never starts an AI call itself. */
export function useHumanVerification(){
 const [request,setRequest]=useState<HumanVerificationRequest|null>(null);
 const pending=useRef<PendingVerification|null>(null);
 const finish=useCallback((token?:string,error?:Error)=>{
  const value=pending.current;if(!value)return;
  pending.current=null;value.cleanup();setRequest(null);
  if(token)value.resolve(token);else value.reject(error??new DOMException('Aborted','AbortError'));
 },[]);
 const verify=useCallback((value:HumanVerificationRequest,signal:AbortSignal)=>new Promise<string>((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
  finish(undefined,new DOMException('Aborted','AbortError'));
  const abort=()=>finish(undefined,new DOMException('Aborted','AbortError'));
  let timer:ReturnType<typeof setTimeout>;
  const arm=(expires:number)=>{clearTimeout(timer);timer=setTimeout(()=>finish(undefined,new Error('验证已过期，请重新整理。')),Math.max(0,expires-Date.now()));};
  const owner={resolve,reject,cleanup:()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);}};
  const present=(current:HumanVerificationRequest):HumanVerificationRequest=>({...current,...(current.refresh?{refresh:async()=>{
    const updated=await current.refresh!();
    if(signal.aborted||pending.current!==owner)throw new DOMException('Aborted','AbortError');
    arm(updated.expires);const next=present(updated);setRequest(next);return next;
  }}:{})});
  pending.current=owner;arm(value.expires);
  signal.addEventListener('abort',abort,{once:true});setRequest(present(value));
 }),[finish]);
 useEffect(()=>()=>{
  const value=pending.current;pending.current=null;
  if(value){value.cleanup();value.reject(new DOMException('Aborted','AbortError'));}
 },[]);
 return {request,verify,complete:(token:string)=>finish(token),cancel:()=>finish()};
}
