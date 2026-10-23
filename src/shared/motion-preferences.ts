import {useSyncExternalStore} from 'react';

export const MOTION_SPEEDS=[1.25,1.5,1.75,2] as const;
export type MotionSpeed=typeof MOTION_SPEEDS[number];
export type MotionKind='entry'|'notice';
export interface MotionPreferences {entry:MotionSpeed;notice:MotionSpeed}
export const MOTION_PREFERENCES_KEY='campus-inbox:motion-preferences:v1';
export const defaultMotionPreferences:MotionPreferences={entry:1.5,notice:1.25};
const changed='campus-inbox:motion-preferences-changed';
type MotionStorage=Pick<Storage,'getItem'>;
let lastStorage:MotionStorage|null|undefined,lastRaw:string|null|undefined,lastValue=defaultMotionPreferences;
const valid=(value:unknown):value is MotionSpeed=>MOTION_SPEEDS.includes(value as MotionSpeed);
function browserStorage():Storage|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}

/** The entry sequence can read its own storage before any React hook mounts. */
export function readMotionPreferences(storage:MotionStorage|null=browserStorage()):MotionPreferences{
 let raw:string|null=null;try{raw=storage?.getItem(MOTION_PREFERENCES_KEY)??null;}catch{return defaultMotionPreferences;}
 if(storage===lastStorage&&raw===lastRaw)return lastValue;
 lastStorage=storage;lastRaw=raw;
 try{const input=JSON.parse(raw??'{}');lastValue={entry:valid(input?.entry)?input.entry:1.5,notice:valid(input?.notice)?input.notice:defaultMotionPreferences.notice};}
 catch{lastValue=defaultMotionPreferences;}
 return lastValue;
}
function applyMotionCss(preferences:MotionPreferences){
 if(typeof document!=='undefined')document.documentElement?.style.setProperty('--entry-motion-speed',String(preferences.entry));
}
export function setMotionSpeed(kind:MotionKind,speed:MotionSpeed){
 if(!valid(speed))return;
 const storage=browserStorage();if(!storage)throw new Error('动效设置暂时无法保存。');
 const next={...readMotionPreferences(storage),[kind]:speed};
 try{storage.setItem(MOTION_PREFERENCES_KEY,JSON.stringify(next));}catch{throw new Error('动效设置暂时无法保存。');}
 applyMotionCss(next);window.dispatchEvent(new Event(changed));
}
function subscribe(listener:()=>void){
 const update=()=>{applyMotionCss(readMotionPreferences());listener();};
 const stored=(event:StorageEvent)=>{if(event.key===null||event.key===MOTION_PREFERENCES_KEY)update();};
 window.addEventListener(changed,update);window.addEventListener('storage',stored);update();
 return()=>{window.removeEventListener(changed,update);window.removeEventListener('storage',stored);};
}
export function useMotionPreferences(){return useSyncExternalStore(subscribe,readMotionPreferences,()=>defaultMotionPreferences);}

// This runs while the app modules load, before the first page is mounted.
applyMotionCss(readMotionPreferences());
