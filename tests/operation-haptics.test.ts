import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {PlatformAPI} from '../src/platform';
import {createAndroidPlatform,type NativeBridge} from '../src/platform/android';

let doc:{visibilityState:string},clock:number;
beforeEach(()=>{
 vi.resetModules();clock=1_000;
 doc={visibilityState:'visible'};
 const storage=new Map<string,string>();
 vi.stubGlobal('document',doc);vi.stubGlobal('window',new EventTarget());
 vi.stubGlobal('performance',{now:()=>clock});
 vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});
});
afterEach(()=>vi.unstubAllGlobals());

describe('saved operation haptics',()=>{
 it('confirms only on Android and suppresses repeated feedback',async()=>{
  const haptics=await import('../src/shared/operation-haptics');
  const feedback=vi.fn().mockResolvedValue(undefined),platform={kind:'android',hapticFeedback:feedback} as unknown as PlatformAPI;
  expect(haptics.triggerOperationHaptic({...platform,kind:'browser'},'complete')).toBe(false);
  expect(haptics.triggerOperationHaptic(platform,'complete')).toBe(true);
  expect(haptics.triggerOperationHaptic(platform,'remove')).toBe(false);
  clock+=900;expect(haptics.triggerOperationHaptic(platform,'organized')).toBe(true);
  expect(feedback.mock.calls).toEqual([['complete'],['organized']]);
 });
 it('honors the independent preference and hides background feedback',async()=>{
  const haptics=await import('../src/shared/operation-haptics');
  const feedback=vi.fn().mockResolvedValue(undefined),platform={kind:'android',hapticFeedback:feedback} as unknown as PlatformAPI;
  haptics.setOperationHapticsEnabled(false);expect(haptics.operationHapticsEnabled()).toBe(false);
  expect(haptics.triggerOperationHaptic(platform,'complete')).toBe(false);
  haptics.setOperationHapticsEnabled(true);doc.visibilityState='hidden';
  expect(haptics.triggerOperationHaptic(platform,'organized')).toBe(false);
  doc.visibilityState='visible';expect(haptics.triggerOperationHaptic(platform,'remove')).toBe(true);
  expect(feedback).toHaveBeenCalledTimes(1);
 });
 it('silently handles unavailable storage, missing capability and a failed native request',async()=>{
  const haptics=await import('../src/shared/operation-haptics');
  expect(haptics.triggerOperationHaptic({kind:'android'} as PlatformAPI,'complete')).toBe(false);
  const feedback=vi.fn().mockRejectedValue(new Error('unavailable'));
  const platform={kind:'android',hapticFeedback:feedback} as unknown as PlatformAPI;
  expect(haptics.triggerOperationHaptic(platform,'complete')).toBe(true);
  await Promise.resolve();
  vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('disabled');}});
  clock+=900;expect(haptics.triggerOperationHaptic(platform,'remove')).toBe(false);
 });
});

describe('Android capability negotiation',()=>{
 function bridgeWith(haptics:boolean){
  const actions:Array<{action:string;payload:unknown}>=[];
  const bridge:NativeBridge={onmessage:null,postMessage(raw){
   const request=JSON.parse(raw);actions.push({action:request.action,payload:request.payload});
   bridge.onmessage?.({data:JSON.stringify({id:request.id,ok:true,data:request.action==='capabilities'?{haptics}:{performed:true}})});
  }};
  return {bridge,actions};
 }
 it('sends a bounded confirmation action only when the host advertises support',async()=>{
  const {bridge,actions}=bridgeWith(true),platform=createAndroidPlatform(bridge);
  await platform.hapticFeedback?.('complete');
  expect(actions).toEqual([{action:'capabilities',payload:{}},{action:'haptic',payload:{kind:'complete'}}]);
  doc.visibilityState='hidden';await platform.hapticFeedback?.('organized');expect(actions).toHaveLength(2);
  platform.dispose();
 });
 it('leaves an older host untouched',async()=>{
  const {bridge,actions}=bridgeWith(false),platform=createAndroidPlatform(bridge);
  await platform.hapticFeedback?.('remove');expect(actions).toEqual([{action:'capabilities',payload:{}}]);
  platform.dispose();
 });
 it('rechecks visibility after delayed native capability negotiation',async()=>{
  const sent:Array<{id:string;action:string}>=[];
  const bridge:NativeBridge={onmessage:null,postMessage(raw){sent.push(JSON.parse(raw));}};
  const platform=createAndroidPlatform(bridge),feedback=platform.hapticFeedback?.('complete');
  doc.visibilityState='hidden';
  bridge.onmessage?.({data:JSON.stringify({id:sent[0].id,ok:true,data:{haptics:true}})});
  await feedback;expect(sent.map(value=>value.action)).toEqual(['capabilities']);
  platform.dispose();
 });
});
