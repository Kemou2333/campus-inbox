import {expect,test} from 'vitest';
import {createNotice,exportBackup,parseAnalysis,parseBackup,parseNotice,updateNote} from '../src/domain/notice';
import {NOTE_COLORS,type NoticeAnalysis} from '../src/domain/types';
import {LocalRepository} from '../src/infrastructure/local-repository';
import {cloudRecord} from '../src/infrastructure/sync-client';
import {restoredTrashNotice} from '../src/domain/notice-trash';
import {noteAppearance} from '../src/features/notes/note-colors';

const analysis:NoticeAnalysis={schemaVersion:4,kind:'task',title:'材料登记',summary:'按要求提交登记材料。',deadline:null,deadlineText:'',timeline:[],tasks:[{text:'提交材料',assignee:null,scope:'all',condition:'',details:[],steps:[],time:null,timeText:'',location:null}],materials:[],warnings:[],reminders:[]};
class MemoryStorage {data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}}
const original=()=>({...createNotice(analysis,'通知原文','2026-10-22T12:00:00Z'),note:'已有整条通知笔记',tasks:createNotice(analysis,'通知原文').tasks.map(t=>({...t,note:'已有旧事项笔记',completed:true}))});

test('older records retain their text and child notes without adding a color field',()=>{
 const old=original(),record=parseNotice(old);
 expect(record.note).toBe(old.note);expect(record.tasks[0]).toMatchObject({note:'已有旧事项笔记',completed:true});
 expect(Object.hasOwn(record,'noteColor')).toBe(false);expect(noteAppearance(record.noteColor)).toEqual(noteAppearance('plain'));
});

test('every named note color survives local storage, backup, trash recovery and text-only cloud projection',()=>{
 for(const color of NOTE_COLORS){
  const source={...updateNote(original(),{type:'notice'},'编辑后的笔记',color),attachments:['device-file']};
  const storage=new MemoryStorage(),repository=new LocalRepository(storage);repository.load();repository.save([source]);
  const local=new LocalRepository(storage).load()[0],backup=parseBackup(exportBackup([local]))[0];
  const restored=restoredTrashNotice({id:'trash-id',notice:backup,position:0,deletedAt:'2026-10-22T12:00:00Z',expiresAt:'2026-11-21T12:00:00Z'});
  expect(restored).toMatchObject({note:'编辑后的笔记',noteColor:color,attachments:['device-file'],originalText:source.originalText});
  expect(restored.tasks).toEqual(source.tasks);expect(cloudRecord(restored)).toMatchObject({noteColor:color,attachments:[]});
 }
});

test('text-only edits keep the chosen color; explicit plain clears it without touching legacy child notes',()=>{
 const before=original(),colored=updateNote(before,{type:'notice'},'新笔记','sky');
 const typed=updateNote(colored,{type:'notice'},'继续编辑');expect(typed.noteColor).toBe('sky');
 const cleared=updateNote(typed,{type:'notice'},'','plain');expect(cleared.note).toBe('');expect(cleared.noteColor).toBe('plain');
 expect(cleared.tasks).toEqual(before.tasks);expect(cleared.completed).toBe(before.completed);
 expect(()=>updateNote(before,{type:'task',taskId:before.tasks[0].id},'旧笔记编辑','rose')).toThrow();
});

test('arbitrary CSS and malformed note colors are rejected, and AI cannot supply the personal field',()=>{
 for(const noteColor of ['#ff0000','url(https://example.com)','red',null,{},[],1])expect(()=>parseNotice({...original(),noteColor})).toThrow();
 expect(()=>parseAnalysis({...analysis,noteColor:'sky'})).toThrow();
});
