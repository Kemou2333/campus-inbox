import {describe,it,expect} from 'vitest';
import {planSiteMerge} from '../src/infrastructure/site-data-merge';
import {createGuestDemoNotice} from '../src/infrastructure/guest-demo';
const key='campus-inbox:notices:v5';
const stored=(notices:unknown[])=>JSON.stringify({version:5,revision:2,notices});
describe('one canonical website, preserving local versions',()=>{
 it('keeps both libraries and the newer progress for a common ID',()=>{
  const older={...createGuestDemoNotice('shared'),updatedAt:'2026-10-20T00:00:00.000Z'},newer={...older,updatedAt:'2026-10-21T00:00:00.000Z',note:'已经读过',completed:true};
  const result=JSON.parse(planSiteMerge({[key]:stored([older,createGuestDemoNotice('new-site')])},{[key]:stored([newer,createGuestDemoNotice('old-site')])})[key]);
  expect(result.notices.map((x:{id:string})=>x.id)).toEqual(['local-demo-v1-shared','local-demo-v1-new-site','local-demo-v1-old-site']);expect(result.notices[0]).toMatchObject({completed:true,note:'已经读过'});
 });
 it('does not resurrect an unchanged old record after canonical deletion',()=>{
  const old={...createGuestDemoNotice('deleted'),updatedAt:'2026-10-20T00:00:00.000Z'},previous={[key]:stored([old])};
  const next=planSiteMerge({[key]:stored([])},{[key]:stored([old,createGuestDemoNotice('extra')])},previous);
  expect(JSON.parse(next[key]).notices.map((x:{id:string})=>x.id)).toEqual(['local-demo-v1-extra']);
 });
 it('keeps different draft edits, preserves coherent auth metadata and completes seen tutorials',()=>{
  const draft='campus-inbox:draft:v5',auth='campus-inbox:sync:v1:https://123.57.30.129/sync';
  const result=planSiteMerge({[draft]:JSON.stringify([{id:'draft',text:'new edit',attachments:[]}]),[auth]:'{"key":"destination","cursor":9}','campus-inbox:tutorial:v2':'unseen'},{[draft]:JSON.stringify([{id:'draft',text:'old edit',attachments:[]}]),[auth]:'{"key":"source","cursor":2}','campus-inbox:tutorial:v2':'seen'});
  expect(JSON.parse(result[draft]).map((x:{text:string})=>x.text)).toEqual(['new edit','old edit']);expect(result[auth]).toBeUndefined();expect(result['campus-inbox:tutorial:v2']).toBe('seen');
 });
 it('rejects crossing two different signed-in identities and ignores unrelated storage',()=>{
  expect(()=>planSiteMerge({'campus-inbox:account-username:v1':'one@qq.com'},{'campus-inbox:account-username:v1':'two@qq.com'})).toThrow(/不同账号/);
  expect(planSiteMerge({},{'other-project:private':'value'})).toEqual({});
 });
 it('keeps device attachments when the newer cloud copy has none',()=>{
  const older={...createGuestDemoNotice('files'),attachments:['local-file'],updatedAt:'2026-10-20T00:00:00.000Z'},newer={...older,attachments:[],updatedAt:'2026-10-21T00:00:00.000Z'};
  const next=planSiteMerge({[key]:stored([newer])},{[key]:stored([older])});
  expect(JSON.parse(next[key]).notices[0].attachments).toEqual(['local-file']);
 });
 it('keeps a visible second copy when combining files exceeds a notice limit',()=>{
  const older={...createGuestDemoNotice('files'),attachments:['old-a','old-b','old-c'],updatedAt:'2026-10-20T00:00:00.000Z'},newer={...older,attachments:['new-a','new-b','new-c'],updatedAt:'2026-10-21T00:00:00.000Z'};
  const sizes=Object.fromEntries([...older.attachments,...newer.attachments].map(id=>[id,5*1024*1024]));
  const next=JSON.parse(planSiteMerge({[key]:stored([newer])},{[key]:stored([older])},{},sizes)[key]).notices;
  expect(next).toHaveLength(2);expect(next.flatMap((n:{attachments:string[]})=>n.attachments)).toHaveLength(6);expect(next[0].tasks[0].id).not.toBe(next[1].tasks[0].id);
 });
});
