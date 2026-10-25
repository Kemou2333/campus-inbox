import {useCallback,useEffect,useRef,useState} from 'react';
import {AuthError,type AuthClient,type AuthImageChallenge} from '../../infrastructure/auth-client';
import {friendlyErrorMessage} from '../../shared/error-message';

type Purpose='login'|'register'|'email';
interface ImageState {auth:AuthClient|null;purpose:Purpose|null;value:AuthImageChallenge|null;retryAt:number}
/** Keep the current image across dialog reopen; only replace it after the server cooldown. */
export function useAuthImageChallenge(auth:AuthClient|null,open:boolean,purpose:Purpose){
 const [image,setImage]=useState<ImageState>({auth:null,purpose:null,value:null,retryAt:0});
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(Date.now());
 const imageRef=useRef(image),current=useRef({auth,open,purpose});current.current={auth,open,purpose};
 const pending=useRef<{id:symbol;auth:AuthClient}|null>(null),attempt=useRef<{auth:AuthClient;purpose:Purpose;retryAt:number}|null>(null);
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const publish=useCallback((next:ImageState)=>{imageRef.current=next;if(mounted.current)setImage(next);},[]);
 const refresh=useCallback(async()=>{
  const context=current.current,previous=imageRef.current;
  if(!context.auth||!context.open||pending.current?.auth===context.auth)return;
  const retryAt=previous.auth===context.auth?previous.retryAt:0;
  if(Date.now()<retryAt)return;
  const id=Symbol();pending.current={id,auth:context.auth};attempt.current={auth:context.auth,purpose:context.purpose,retryAt};
  setLoading(true);setError('');
  try{
   const value=await context.auth.imageChallenge(context.purpose);
   if(pending.current?.id!==id||current.current.auth!==context.auth)return;
   publish({auth:context.auth,purpose:context.purpose,value,retryAt:Date.now()+value.retryAfterSeconds*1000});setClock(Date.now());
  }catch(issue){
   if(pending.current?.id!==id||current.current.auth!==context.auth)return;
   const nextAt=issue instanceof AuthError&&issue.retryAfterSeconds?Date.now()+issue.retryAfterSeconds*1000:retryAt;
   publish({auth:context.auth,purpose:context.purpose,value:null,retryAt:nextAt});setClock(Date.now());
   if(current.current.open&&current.current.purpose===context.purpose)setError(friendlyErrorMessage(issue));
  }finally{if(pending.current?.id===id){pending.current=null;if(mounted.current)setLoading(false);}}
 },[publish]);
 const retryAt=image.auth===auth?image.retryAt:0;
 const challenge=image.auth===auth&&image.purpose===purpose&&image.value&&Date.parse(image.value.expiresAt)>Date.now()?image.value:null;
 const waiting=Math.max(0,Math.ceil((retryAt-clock)/1000));
 useEffect(()=>{if(open){attempt.current=null;setError('');}},[open,auth,purpose]);
 useEffect(()=>{
  if(!open||challenge||pending.current?.auth===auth||!auth||Date.now()<retryAt)return;
  const last=attempt.current;
  // One automatic attempt per context/cooldown. Network errors remain manually retryable.
  if(last?.auth===auth&&last.purpose===purpose&&last.retryAt===retryAt)return;
  void refresh();
 },[open,auth,purpose,challenge,retryAt,clock,loading,refresh]);
 useEffect(()=>{
  if(!open||retryAt<=Date.now())return;
  setClock(Date.now());const timer=setInterval(()=>{const time=Date.now();setClock(time);if(time>=retryAt)clearInterval(timer);},1000);
  return()=>clearInterval(timer);
 },[open,retryAt]);
 const invalidate=useCallback(()=>{const value=imageRef.current;publish({...value,value:null});},[publish]);
 return {challenge,loading,error,waiting,refresh,invalidate};
}
