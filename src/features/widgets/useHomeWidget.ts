import {useEffect,useRef} from 'react';
import type {Notice} from '../../domain/types';
import type {PlatformAPI} from '../../platform';
import {createHomeWidgetPublisher,homeWidgetSummary} from './home-widget';

/** Projects the real local library; onboarding sandboxes and catalog samples never enter the cache. */
export function useHomeWidget({platform,notices,localDataScope,bootError,ready=true}:{platform:PlatformAPI;notices:readonly Notice[];localDataScope:string;bootError:string;ready?:boolean}){
 const publisher=useRef<ReturnType<typeof createHomeWidgetPublisher>|null>(null);
 useEffect(()=>{
  if(platform.kind!=='android'||!platform.updateHomeWidget)return;
  const next=createHomeWidgetPublisher(summary=>platform.updateHomeWidget!(summary),localStorage);publisher.current=next;
  return()=>{next.dispose();if(publisher.current===next)publisher.current=null;};
 },[platform]);
 const summary=JSON.stringify(homeWidgetSummary(notices));
 useEffect(()=>{void publisher.current?.publish(localDataScope,JSON.parse(summary),!!bootError||!ready).catch(()=>{/* Optional presentation never blocks notice storage. */});},[platform,localDataScope,summary,bootError,ready]);
}
