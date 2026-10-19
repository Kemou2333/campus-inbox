import {expect,test,vi} from 'vitest';
import {createFirstEntryMotion} from '../src/shared/first-entry-motion';

function storage(initial:Record<string,string>={}){
 const values=new Map(Object.entries(initial));
 return {getItem:(key:string)=>values.get(key)??null,setItem:vi.fn((key:string,value:string)=>{values.set(key,value);}),values};
}
function surface(key:string){
 const cancel=vi.fn(),animate=vi.fn((_frames:Keyframe[],_options:KeyframeAnimationOptions)=>({cancel}));
 return {dataset:{firstEntry:key},getClientRects:()=>[{width:100,height:80}],animate,cancel};
}
function root(...elements:ReturnType<typeof surface>[]){return {querySelectorAll:()=>elements} as unknown as ParentNode;}

test('new users see input, organize and notice controls in their interaction order',()=>{
 const saved=storage(),motion=createFirstEntryMotion(saved);
 const feed=surface('feed-tools'),input=surface('composer-input'),organize=surface('composer-action');
 const stop=motion.play(root(feed,organize,input),false);
 expect(input.animate.mock.calls[0]?.[1]).toMatchObject({delay:0,duration:840,easing:'cubic-bezier(.22,1,.36,1)'});
 expect(organize.animate.mock.calls[0]?.[1]).toMatchObject({delay:180});
 expect(feed.animate.mock.calls[0]?.[1]).toMatchObject({delay:360});
 expect(saved.setItem).toHaveBeenCalledExactlyOnceWith('campus-inbox:first-entry:v1','seen');
 stop();expect(feed.cancel).toHaveBeenCalledOnce();
});
test('a mobile surface can arrive on first visit, but does not replay after switching back',()=>{
 const saved=storage(),motion=createFirstEntryMotion(saved),feed=surface('feed-tools');
 motion.play(root(feed),false);
 const input=surface('composer-input');motion.play(root(input),false);
 const returned=surface('feed-tools');motion.play(root(returned),false);
 expect(feed.animate).toHaveBeenCalledOnce();expect(input.animate).toHaveBeenCalledOnce();expect(returned.animate).not.toHaveBeenCalled();
 const reloaded=surface('composer-input');createFirstEntryMotion(saved).play(root(reloaded),false);
 expect(reloaded.animate).not.toHaveBeenCalled();
});
test('existing users and reduced-motion users get no extra welcome animation',()=>{
 const existing=surface('masthead');createFirstEntryMotion(storage({'campus-inbox:tutorial:v2':'seen'})).play(root(existing),false);
 expect(existing.animate).not.toHaveBeenCalled();
 const saved=storage(),reduced=surface('composer-input'),motion=createFirstEntryMotion(saved);
 motion.play(root(reduced),true);motion.play(root(reduced),false);
 expect(reduced.animate).not.toHaveBeenCalled();expect(saved.setItem).toHaveBeenCalledOnce();
});
test('blocked storage or unavailable animation support leaves the screen usable',()=>{
 const unavailable={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
 const element=surface('composer-input');createFirstEntryMotion(unavailable).play(root(element),false);
 expect(element.animate).not.toHaveBeenCalled();
 const older=surface('composer-action');older.animate.mockImplementation(()=>{throw new Error('unsupported');});
 expect(()=>createFirstEntryMotion(storage()).play(root(older),false)).not.toThrow();
});
