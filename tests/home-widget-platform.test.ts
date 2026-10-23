import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {createAndroidPlatform,type NativeBridge} from '../src/platform/android';
beforeEach(()=>vi.stubGlobal('window',new EventTarget()));afterEach(()=>vi.unstubAllGlobals());
function host(supported=true){const requests:any[]=[];const bridge:NativeBridge={onmessage:null,postMessage(raw){const req=JSON.parse(raw);requests.push(req);queueMicrotask(()=>bridge.onmessage?.({data:JSON.stringify({id:req.id,ok:true,data:req.action==='capabilities'?{homeWidget:supported}:req.action==='consumeOpenedInbox'?{opened:true}:{updated:true}})}));}};return{bridge,requests};}
test('old hosts receive no widget actions; new hosts get only bounded summary or clear data',async()=>{
 const old=host(false),legacy=createAndroidPlatform(old.bridge);await legacy.updateHomeWidget?.({pendingCount:0});expect(await legacy.getOpenedInbox?.()).toBe(false);expect(old.requests.map(r=>r.action)).toEqual(['capabilities']);legacy.dispose();
 const modern=host(),api=createAndroidPlatform(modern.bridge);await api.updateHomeWidget?.({pendingCount:1,title:'提交申请',noticeId:'n1'});await api.updateHomeWidget?.(null);
 expect(modern.requests.slice(1).map(r=>r.payload)).toEqual([{available:true,pendingCount:1,title:'提交申请',noticeId:'n1'},{available:false}]);
 await expect(api.updateHomeWidget?.({pendingCount:-1})).rejects.toThrow('摘要');expect(modern.requests).toHaveLength(3);api.dispose();
});
test('widget empty-state navigation is consumed separately and listeners unsubscribe',async()=>{
 const modern=host(),api=createAndroidPlatform(modern.bridge),onOpen=vi.fn(),off=api.onOpenInbox!(onOpen);
 window.dispatchEvent(new Event('campus-native-open-inbox'));expect(onOpen).toHaveBeenCalledOnce();expect(await api.getOpenedInbox?.()).toBe(true);off();window.dispatchEvent(new Event('campus-native-open-inbox'));expect(onOpen).toHaveBeenCalledOnce();api.dispose();
});
