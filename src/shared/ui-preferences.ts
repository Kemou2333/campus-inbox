import {useSyncExternalStore} from 'react';
export interface UiPreferences {expandAllDetails:boolean;showAddedDate:boolean;swipeActions:boolean}
export const defaultUiPreferences:UiPreferences={expandAllDetails:false,showAddedDate:true,swipeActions:true};
const key='campus-inbox:ui-preferences:v1',event='campus-inbox:ui-preferences-changed';
let lastRaw:string|null|undefined,lastValue=defaultUiPreferences;
export function readUiPreferences():UiPreferences{
 let raw:string|null=null;try{raw=localStorage.getItem(key);}catch{return defaultUiPreferences;}
 if(raw===lastRaw)return lastValue;lastRaw=raw;
 try{const input=JSON.parse(raw??'{}');lastValue={...defaultUiPreferences};for(const name of Object.keys(defaultUiPreferences) as Array<keyof UiPreferences>)if(typeof input?.[name]==='boolean')lastValue[name]=input[name];}catch{lastValue=defaultUiPreferences;}
 return lastValue;
}
export function setUiPreference<K extends keyof UiPreferences>(name:K,value:UiPreferences[K]){const next={...readUiPreferences(),[name]:value};try{localStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event(event));}catch{/* Keep the application usable when device storage is unavailable. */}}
const subscribe=(listener:()=>void)=>{window.addEventListener(event,listener);window.addEventListener('storage',listener);return()=>{window.removeEventListener(event,listener);window.removeEventListener('storage',listener);};};
export function useUiPreferences(){return {preferences:useSyncExternalStore(subscribe,readUiPreferences,()=>defaultUiPreferences),setPreference:setUiPreference};}
