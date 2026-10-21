import tones from './operation-sound-tones.json';

export type OperationSound = keyof typeof tones;
const key='campus-inbox:operation-sounds:v1';
let context:AudioContext|null=null;
let lastPlayed=-Infinity;

export function operationSoundsEnabled():boolean{
 try{return localStorage.getItem(key)!=='off';}catch{return false;}
}
export function setOperationSoundsEnabled(enabled:boolean){
 localStorage.setItem(key,enabled?'on':'off');
}
function prime(){
 if(!operationSoundsEnabled()||document.visibilityState!=='visible')return;
 try{
  const Constructor=window.AudioContext??(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  if(!Constructor)return;
  context??=new Constructor();
  if(context.state==='suspended')void context.resume().catch(()=>{});
 }catch{/* Audio support never blocks an operation. */}
}
/** Unlock only from a real interaction; no sound at launch or on return to the app. */
export function installOperationSounds(){
 const keydown=(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' ')prime();};
 document.addEventListener('pointerdown',prime,{capture:true,passive:true});
 document.addEventListener('keydown',keydown,true);
 return()=>{document.removeEventListener('pointerdown',prime,true);document.removeEventListener('keydown',keydown,true);};
}
/** Call after a successful save, never in response to background synchronization alone. */
export function playOperationSound(kind:OperationSound):boolean{
 try{
  if(!operationSoundsEnabled()||document.visibilityState!=='visible'||context?.state!=='running')return false;
  const now=context.currentTime;
  if(now-lastPlayed<.9)return false;
  lastPlayed=now;
  for(const [frequency,offset,duration] of tones[kind]){
   const oscillator=context.createOscillator(),gain=context.createGain();
   oscillator.type='sine';oscillator.frequency.value=frequency;
   const start=now+offset;
   gain.gain.setValueAtTime(0,start);
   gain.gain.linearRampToValueAtTime(kind==='welcome'?.012:kind==='selection'?.018:.045,start+.012);
   gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
   oscillator.connect(gain);gain.connect(context.destination);
   oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
   oscillator.start(start);oscillator.stop(start+duration+.01);
  }
  return true;
 }catch{return false;}
}
