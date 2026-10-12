import {describe,expect,it} from 'vitest';
import type {Notice} from '../../domain/types';
import {createNotice} from '../../domain/notice';
import {nextUnreadReminderIDs,readUnreadReminderIDs,writeUnreadReminderIDs} from './unread-reminders';

const reminder=(id:string,completed=false):Notice=>({...createNotice({schemaVersion:4,kind:'information',title:'公开说明',summary:'内容已保存。',deadline:null,deadlineText:'',timeline:[],materials:[],warnings:[],reminders:[],tasks:[]},'公开说明'),id,completed});
describe('unread cloud reminders',()=>{
 it('keeps newly received information visible without treating examples or user imports as AI results',()=>{
  expect(nextUnreadReminderIDs([], [reminder('ai-job-0'),reminder('example-reading-v25-4'),reminder('user-note')],[])).toEqual(['ai-job-0']);
  expect(nextUnreadReminderIDs([], [{...reminder('ai-job-1'),kind:'task',tasks:[{id:'task',text:'提交材料',scope:'all',assignee:null,condition:'',details:[],steps:[],time:null,timeText:'',location:null,completed:false,dismissed:false,note:'',localDeadline:null}]}],[])).toEqual([]);
 });
 it('does not reannounce the same result on polling and removes completed or deleted reminders',()=>{
  const n=reminder('ai-job-0');expect(nextUnreadReminderIDs([n],[n],['ai-job-0'])).toEqual(['ai-job-0']);
  expect(nextUnreadReminderIDs([n],[n],[])).toEqual([]);
  expect(nextUnreadReminderIDs([n],[reminder(n.id,true)],['ai-job-0'])).toEqual([]);
  expect(nextUnreadReminderIDs([n],[],['ai-job-0'])).toEqual([]);
 });
 it('retains the unread prompt across closing and reopening, with only valid IDs persisted',()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)};
  writeUnreadReminderIDs(storage,['ai-job-0']);expect(readUnreadReminderIDs(storage)).toEqual(['ai-job-0']);
  expect([...values.values()][0]).toBe('["ai-job-0"]');
  for(const invalid of ['not-json','["user-note"]','[null]']){for(const key of values.keys())values.set(key,invalid);expect(readUnreadReminderIDs(storage)).toEqual([]);}
 });
});
