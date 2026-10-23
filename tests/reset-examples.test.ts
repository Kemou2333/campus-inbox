import {expect,test} from 'vitest';
import exampleBackup from '../public/examples.json';
import {parseBackup} from '../src/domain/notice';
import {planExampleReset} from '../src/domain/reset-examples';
import type {TrashEntry} from '../src/domain/notice-trash';

const catalog=parseBackup(exampleBackup),now='2026-10-21T10:00:00.000Z';
test('developer reset restores completed and deleted catalog examples while preserving personal data',()=>{
 const personal={...catalog[0],id:'my-notice',note:'我的笔记',completed:true};
 const completed={...catalog[0],completed:true,note:'演示笔记'};
 const entry=(id:string,notice:typeof personal):TrashEntry=>({id,notice,position:0,deletedAt:now,expiresAt:now});
 const result=planExampleReset([personal,completed],catalog,[entry('sample-trash',catalog[1]),entry('personal-trash',personal)],now);
 expect(result.notices[0]).toBe(personal);
 expect(result.notices.find(n=>n.id===catalog[0].id)?.note).toBe(catalog[0].note);
 expect(result.notices.find(n=>n.id===catalog[0].id)?.completed).toBe(catalog[0].completed);
 expect(result.notices.some(n=>n.id===catalog[1].id)).toBe(true);
 expect(result.trashIDs).toEqual(['sample-trash']);
 expect(result.restored).toBe(2);
 expect(completed.note).toBe('演示笔记');
});
test('an empty library starts with seven fresh examples and leaves the rest available',()=>{
 const result=planExampleReset([],catalog,[],now);
 expect(result.notices).toHaveLength(7);
 expect(result.remaining).toBe(catalog.length-7);
 expect(result.notices[0]).not.toBe(catalog[0]);
 expect(result.notices[0].updatedAt).toBe(now);
});
