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
  const timer=setTimeout(()=>finish(undefined,new Error('验证已过期，请重新整理。')),Math.max(0,value.expires-Date.now()));
  pending.current={resolve,reject,cleanup:()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);}};
  signal.addEventListener('abort',abort,{once:true});setRequest(value);
 }),[finish]);
 useEffect(()=>()=>{
  const value=pending.current;pending.current=null;
  if(value){value.cleanup();value.reject(new DOMException('Aborted','AbortError'));}
 },[]);
 return {request,verify,complete:(token:string)=>finish(token),cancel:()=>finish()};
}
