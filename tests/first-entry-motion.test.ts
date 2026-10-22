import {afterEach,expect,test,vi} from 'vitest';
import {createFirstEntryMotion} from '../src/shared/first-entry-motion';
import {MOTION_PREFERENCES_KEY} from '../src/shared/motion-preferences';

function storage(initial:Record<string,string>={}){
 const values=new Map(Object.entries(initial));
 return {getItem:(key:string)=>values.get(key)??null,setItem:vi.fn((key:string,value:string)=>{values.set(key,value);}),values};
}
function surface(key:string){
 let finish!:()=>void,reject!:(reason:Error)=>void;
 const finished=new Promise<void>((resolve,rejectPromise)=>{finish=resolve;reject=rejectPromise;});
 const cancel=vi.fn(()=>reject(new Error('canceled'))),animate=vi.fn((_frames:Keyframe[],_options:KeyframeAnimationOptions)=>({cancel,finished}));
 return {dataset:{firstEntry:key},getClientRects:()=>[{width:100,height:80}],animate,cancel,finish};
}
function root(...elements:ReturnType<typeof surface>[]){return {querySelectorAll:()=>elements} as unknown as ParentNode;}
afterEach(()=>vi.useRealTimers());

test('all visible groups start hidden and enter at the default 1.5 speed in interaction order',()=>{
 const saved=storage(),motion=createFirstEntryMotion(saved),settled=vi.fn();
 const feed=surface('feed-tools'),input=surface('composer-input'),organize=surface('composer-action');
 expect(motion.pending).toBe(true);
 const stop=motion.play(root(feed,organize,input),false,settled);
 expect(motion.pending).toBe(false);
 expect(input.animate.mock.calls[0]?.[0][0]).toEqual({opacity:0,transform:'translateY(8px) scale(.985)'});
 expect(input.animate.mock.calls[0]?.[1]).toMatchObject({delay:253,duration:833,easing:'cubic-bezier(.35,0,.2,1)',fill:'backwards'});
 expect(organize.animate.mock.calls[0]?.[1]).toMatchObject({delay:440});
 expect(feed.animate.mock.calls[0]?.[1]).toMatchObject({delay:627});
 expect(saved.setItem).toHaveBeenCalledExactlyOnceWith('campus-inbox:first-entry:v1','seen');
 expect(settled).not.toHaveBeenCalled();
 stop();expect(feed.cancel).toHaveBeenCalledOnce();expect(settled).toHaveBeenCalledOnce();
});
test('a later mobile page, new group or reload cannot play a second entry',()=>{
 const saved=storage(),motion=createFirstEntryMotion(saved),feed=surface('feed-tools');
 const stop=motion.play(root(feed),false);
 const input=surface('composer-input'),secondSettled=vi.fn();motion.play(root(input),false,secondSettled);
 const returned=surface('feed-tools');motion.play(root(returned),false);
 expect(feed.animate).toHaveBeenCalledOnce();expect(input.animate).not.toHaveBeenCalled();expect(returned.animate).not.toHaveBeenCalled();
 expect(secondSettled).toHaveBeenCalledOnce();
 const reloaded=surface('composer-input'),restored=createFirstEntryMotion(saved);
 expect(restored.pending).toBe(false);restored.play(root(reloaded),false);
 expect(reloaded.animate).not.toHaveBeenCalled();stop();
});
test('first entry reads a saved entry speed directly before any settings hook mounts',()=>{
 const raw=JSON.stringify({entry:2,notice:1.25}),saved=storage({[MOTION_PREFERENCES_KEY]:raw}),input=surface('composer-input'),action=surface('composer-action');
 const stop=createFirstEntryMotion(saved).play(root(input,action),false);
 expect(input.animate.mock.calls[0]?.[1]).toMatchObject({duration:625,delay:190});
 expect(action.animate.mock.calls[0]?.[1]).toMatchObject({duration:625,delay:330});
 expect(saved.values.get(MOTION_PREFERENCES_KEY)).toBe(raw);stop();
});
test('an explicit introduction can play its entrance even after an older tutorial was seen',()=>{
 const saved=storage({'campus-inbox:tutorial:v2':'seen','campus-inbox:first-entry:v1':'seen'}),element=surface('composer-input');
 const motion=createFirstEntryMotion(saved,{force:true});expect(motion.pending).toBe(true);
 const stop=motion.play(root(element),false);expect(element.animate).toHaveBeenCalledOnce();
 motion.play(root(surface('composer-input')),false);expect(element.animate).toHaveBeenCalledOnce();stop();
});
test('settles exactly once after the last group finishes, including a canceled group',async()=>{
 const input=surface('composer-input'),feed=surface('feed-tools'),settled=vi.fn();
 const stop=createFirstEntryMotion(storage()).play(root(input,feed),false,settled);
 input.finish();await Promise.resolve();await Promise.resolve();
 expect(settled).not.toHaveBeenCalled();
 feed.cancel();await vi.waitFor(()=>expect(settled).toHaveBeenCalledOnce());
 stop();expect(settled).toHaveBeenCalledOnce();
});
test('cleanup restores static controls and settles without waiting for rejected promises',async()=>{
 const element=surface('composer-input'),settled=vi.fn();
 const stop=createFirstEntryMotion(storage()).play(root(element),false,settled);
 stop();expect(element.cancel).toHaveBeenCalledOnce();expect(settled).toHaveBeenCalledOnce();
 await Promise.resolve();await Promise.resolve();expect(settled).toHaveBeenCalledOnce();
});
test('a WebView completion timeout releases the page even if finished never resolves',()=>{
 vi.useFakeTimers();
 const element=surface('composer-input'),settled=vi.fn();
 createFirstEntryMotion(storage()).play(root(element),false,settled);
 vi.advanceTimersByTime(1205);expect(settled).not.toHaveBeenCalled();
 vi.advanceTimersByTime(1);expect(element.cancel).toHaveBeenCalledOnce();expect(settled).toHaveBeenCalledOnce();
});
test('existing users, reduced motion and empty screens settle immediately without animation',()=>{
 const existing=surface('masthead'),existingSettled=vi.fn(),seen=createFirstEntryMotion(storage({'campus-inbox:tutorial:v2':'seen'}));
 expect(seen.pending).toBe(false);seen.play(root(existing),false,existingSettled);
 expect(existing.animate).not.toHaveBeenCalled();expect(existingSettled).toHaveBeenCalledOnce();
 const saved=storage(),reduced=surface('composer-input'),motion=createFirstEntryMotion(saved),reducedSettled=vi.fn();
 motion.play(root(reduced),true,reducedSettled);motion.play(root(reduced),false);
 expect(reduced.animate).not.toHaveBeenCalled();expect(saved.setItem).toHaveBeenCalledOnce();expect(reducedSettled).toHaveBeenCalledOnce();
 const emptySettled=vi.fn();createFirstEntryMotion(storage()).play(root(),false,emptySettled);expect(emptySettled).toHaveBeenCalledOnce();
});
test('blocked reading or writing storage leaves the screen visible and settles immediately',()=>{
 const unavailable={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
 const element=surface('composer-input'),readSettled=vi.fn(),motion=createFirstEntryMotion(unavailable);
 expect(motion.pending).toBe(false);motion.play(root(element),false,readSettled);
 expect(element.animate).not.toHaveBeenCalled();expect(readSettled).toHaveBeenCalledOnce();
 const writeSettled=vi.fn();createFirstEntryMotion({...storage(),setItem:unavailable.setItem}).play(root(element),false,writeSettled);
 expect(element.animate).not.toHaveBeenCalled();expect(writeSettled).toHaveBeenCalledOnce();
});
test('unavailable animation support cancels earlier groups rather than leaving a partial entry',()=>{
 const input=surface('composer-input'),older=surface('composer-action'),settled=vi.fn();
 older.animate.mockImplementation(()=>{throw new Error('unsupported');});
 const motion=createFirstEntryMotion(storage());
 expect(()=>motion.play(root(input,older),false,settled)).not.toThrow();
 expect(input.cancel).toHaveBeenCalledOnce();expect(settled).toHaveBeenCalledOnce();expect(motion.pending).toBe(false);
});
