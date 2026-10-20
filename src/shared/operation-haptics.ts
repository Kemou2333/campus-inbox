import type {OperationHaptic,PlatformAPI} from '../platform';

const key='campus-inbox:operation-haptics:v1';
let lastRequested=-Infinity;

export function operationHapticsEnabled():boolean{
 try{return localStorage.getItem(key)!=='off';}catch{return false;}
}
export function setOperationHapticsEnabled(enabled:boolean){
 localStorage.setItem(key,enabled?'on':'off');
}
/** Only saved, important operations use this. Never fall back to generic browser vibration. */
export function triggerOperationHaptic(platform:PlatformAPI,kind:OperationHaptic):boolean{
 try{
  if(platform.kind!=='android'||!platform.hapticFeedback||!operationHapticsEnabled()||document.visibilityState!=='visible')return false;
  const now=performance.now();
  if(now-lastRequested<(kind==='step'?150:kind==='selection'?450:900))return false;
  lastRequested=now;
  void platform.hapticFeedback(kind).catch(()=>{});
  return true;
 }catch{return false;}
}
