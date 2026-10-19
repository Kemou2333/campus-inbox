import {describe,expect,it} from 'vitest';
import {createNotice,setNoticeApplicable,setNoticeCompleted,setTaskApplicable,toggleStep,toggleTask} from '../../domain/notice';
import type {NoticeAnalysis} from '../../domain/types';
import {isNewCompletion} from './completion-feedback';

const analysis:NoticeAnalysis={schemaVersion:4,kind:'task',title:'课程任务',summary:'完成两项学习任务。',deadline:null,deadlineText:'',timeline:[],materials:[],warnings:[],reminders:[],tasks:[{text:'观看视频',assignee:null,scope:'all',condition:'',details:[],steps:[{text:'观看第一节',details:[]},{text:'观看第二节',details:[]}],time:null,timeText:'',location:null},{text:'提交作业',assignee:null,scope:'all',condition:'',details:[],steps:[],time:null,timeText:'',location:null}]};
const record=()=>createNotice(analysis,'完成视频与作业。');

describe('completion acknowledgement follows the saved transition',()=>{
 it('does not acknowledge failed saves, unchanged completion, undo or dismissal',()=>{
  const before=record(),after=setNoticeCompleted(before,true);
  expect(isNewCompletion(undefined)).toBe(false);
  expect(isNewCompletion({before,after})).toBe(true);
  expect(isNewCompletion({before:after,after:{...after}})).toBe(false);
  expect(isNewCompletion({before:after,after:setNoticeCompleted(after,false)})).toBe(false);
  expect(isNewCompletion({before,after:setNoticeApplicable(before,false)})).toBe(false);
 });
 it('a partial task does not acknowledge the whole notice, but the final task does',()=>{
  const before=record(),partial=toggleTask(before,before.tasks[0].id),after=toggleTask(partial,before.tasks[1].id);
  expect(isNewCompletion({before,after:partial})).toBe(false);
  expect(isNewCompletion({before:partial,after})).toBe(true);
 });
 it('the final step can complete its task and the whole notice',()=>{
  const base=record(),otherDone=toggleTask(base,base.tasks[1].id),before=toggleStep(otherDone,base.tasks[0].id,base.tasks[0].steps[0].id);
  const after=toggleStep(before,base.tasks[0].id,base.tasks[0].steps[1].id);
  expect(isNewCompletion({before,after})).toBe(true);
  expect(after.tasks.every(task=>task.completed)).toBe(true);
 });
 it('excluding every task is dismissal, while completing all applicable tasks is completion',()=>{
  const base=record(),firstExcluded=setTaskApplicable(base,base.tasks[0].id,false),allExcluded=setTaskApplicable(firstExcluded,base.tasks[1].id,false);
  expect(isNewCompletion({before:firstExcluded,after:allExcluded})).toBe(false);
  const firstDone=toggleTask(base,base.tasks[0].id),after=setTaskApplicable(firstDone,base.tasks[1].id,false);
  expect(isNewCompletion({before:firstDone,after})).toBe(true);
 });
});
