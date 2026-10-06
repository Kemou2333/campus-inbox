import {expect,test} from 'vitest';
import {readLegacyWork,restoreLegacyDraft,finishLegacyResult} from './legacy-work';
import {createNotice} from '../domain/notice';
const store=()=>{const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};};
test('old multi-notice drafts keep their text, flag unavailable files and migrate only once',()=>{
 const local=store(),session=store();local.setItem('campus-inbox:compose:v2',JSON.stringify({version:2,entries:[{text:'第一条',fileCount:1},{text:'第二条',fileCount:0}]}));
 const work=readLegacyWork(local,session);expect(work.missingFiles).toBe(true);expect(restoreLegacyDraft(local,work,null)?.map(d=>d.text)).toEqual(['第一条','第二条']);
 expect(local.getItem('campus-inbox:compose:v2')).not.toBeNull();expect(restoreLegacyDraft(local,work,[{id:'new',text:'',attachments:[]}])?.[0].id).toBe('new');
});
test('new drafts are never overwritten; a failed migration does not mark it complete',()=>{
 const local=store(),session=store();local.setItem('campus-inbox:draft:v1','旧文字');const work=readLegacyWork(local,session),current=[{id:'new',text:'新版文字',attachments:[]}];
 expect(restoreLegacyDraft(local,work,current)).toBe(current);
 const failing={...local,setItem:()=>{throw new Error('full');}};expect(()=>restoreLegacyDraft(failing,work,null)).toThrow('full');expect(local.getItem('campus-inbox:legacy-draft:v5')).toBeNull();
});
test('already-paid records and unsaved note edits survive a session restart without being applied',()=>{
 const local=store(),session=store(),notice=createNotice({schemaVersion:4,kind:'information',title:'旧结果',summary:'原来的结果',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:[]},'原文');
 session.setItem('campus-inbox:pending-analysis:v1',JSON.stringify({version:1,records:[notice]}));session.setItem('campus-inbox:editor-draft:v1:personal',JSON.stringify({version:1,target:{title:'我的笔记'},values:{note:'尚未点击保存'}}));
 const work=readLegacyWork(local,session);expect(work.records[0].id).toBe(notice.id);expect(work.text).toContain('尚未点击保存');expect(notice.note).toBe('');
 const refreshed=readLegacyWork(local,store());expect(refreshed.records[0].id).toBe(notice.id);expect(refreshed.text).toContain('尚未点击保存');finishLegacyResult(local,session);expect(readLegacyWork(local,session).records).toEqual([]);
});
