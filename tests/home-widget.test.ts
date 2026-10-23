import {expect,test,vi} from 'vitest';
import {createDemoNotice} from '../src/features/onboarding/demo-notice';
import {createHomeWidgetPublisher,homeWidgetSummary} from '../src/features/widgets/home-widget';
import type {HomeWidgetSummary} from '../src/platform';
function notice(id:string,title='提交申请',date='2026-10-23T01:00:00Z'){return {...createDemoNotice(),id,title,createdAt:date};}
function store(){const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};}
test('widget summary contains personal pending data only and honors corrected titles without changing records',()=>{
 const current=notice('personal-new','原标题','2026-10-23T02:00:00Z');current.corrections={updatedAt:current.createdAt,values:[{path:'title',value:'核对材料\n再提交'}]};
 const before=structuredClone(current);
 const summary=homeWidgetSummary([notice('local-demo-v1-guide-practice'),notice('local-demo-v1-model-test-a'),{...notice('done'),completed:true},{...notice('information'),kind:'information'},notice('old'),current]);
 expect(summary).toEqual({pendingCount:2,title:'核对材料 再提交',noticeId:'personal-new'});
 expect(current).toEqual(before);expect(Object.keys(summary).sort()).toEqual(['noticeId','pendingCount','title']);
 expect(homeWidgetSummary([])).toEqual({pendingCount:0});
});
test('long and bidi titles cannot expand the local widget payload or split emoji',()=>{
 const title='😀'.repeat(90)+'\u202e';const summary=homeWidgetSummary([notice('personal',title)]);
 expect(Array.from(summary.title!)).toHaveLength(80);expect(summary.title).not.toContain('\u202e');
});
test('switch/logout clears widget, persists only hashes and does not republish an unchanged old summary after restart',async()=>{
 const storage=store(),send=vi.fn(async(_value:HomeWidgetSummary|null)=>{}),summary={pendingCount:1,title:'本机私有标题',noticeId:'personal'};
 const first=createHomeWidgetPublisher(send,storage);await first.publish('account:private@example.com',summary);expect(send).toHaveBeenLastCalledWith(summary);
 await first.publish('device',summary);expect(send).toHaveBeenLastCalledWith(null);first.dispose();
 const restarted=createHomeWidgetPublisher(send,storage);await restarted.publish('device',summary);expect(send).toHaveBeenLastCalledWith(null);
 await restarted.publish('device',{pendingCount:0});expect(send).toHaveBeenLastCalledWith({pendingCount:0});
 const saved=[...storage.data.values()].join();expect(saved).not.toMatch(/private@example|本机私有标题|personal|pendingCount/);restarted.dispose();
});
test('a syncing scope transition keeps the actual old baseline blocked when ready resumes',async()=>{
 const storage=store(),send=vi.fn(async(_value:HomeWidgetSummary|null)=>{}),summary={pendingCount:2,title:'旧摘要',noticeId:'personal'};
 const publisher=createHomeWidgetPublisher(send,storage);await publisher.publish('account:a',summary);
 await publisher.publish('account:b',summary,true);await publisher.publish('account:b',summary,false);expect(send).toHaveBeenLastCalledWith(null);
 await publisher.publish('account:b',{pendingCount:1,title:'新摘要',noticeId:'new'},false);expect(send).toHaveBeenLastCalledWith({pendingCount:1,title:'新摘要',noticeId:'new'});publisher.dispose();
});
test('a late old native response cannot overwrite a queued logout clear',async()=>{
 const storage=store(),values:(HomeWidgetSummary|null)[]=[],summary={pendingCount:1,title:'个人',noticeId:'personal'};
 let release!:()=>void;const publisher=createHomeWidgetPublisher(async value=>{values.push(value);if(values.length===1)await new Promise<void>(resolve=>release=resolve);},storage);
 const old=publisher.publish('account:a',summary);await vi.waitFor(()=>expect(values).toHaveLength(1));
 const logout=publisher.publish('device',summary);release();await Promise.all([old,logout]);expect(values).toEqual([summary,null]);publisher.dispose();
});
test('corrupt or inaccessible widget scope storage fails closed without writing the notice library',async()=>{
 const storage=store(),send=vi.fn(async(_value:HomeWidgetSummary|null)=>{});storage.setItem('campus-inbox:home-widget-scope:v1','broken');
 const publisher=createHomeWidgetPublisher(send,storage);await publisher.publish('account:a',{pendingCount:1,title:'不能泄漏',noticeId:'personal'});expect(send).toHaveBeenLastCalledWith(null);expect(storage.data.size).toBe(1);publisher.dispose();
});

test('widget latest record compares the actual instant across imported timezone offsets',()=>{
 const earlier=notice('earlier','较早','2026-10-23T09:00:00+08:00'),later=notice('later','较晚','2026-10-23T02:00:00Z');
 expect(homeWidgetSummary([earlier,later]).noticeId).toBe('later');
});
