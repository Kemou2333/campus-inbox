import {describe,expect,it} from 'vitest';
import {createNotice,setTaskApplicable,toggleStep} from '../../domain/notice';
import type {NoticeAnalysis} from '../../domain/types';
import {matchesHiddenDetail,noticeOverview} from './notice-overview';

const base:NoticeAnalysis={schemaVersion:4,kind:'task',title:'请假办理',summary:'按通知要求办理。',deadline:null,deadlineText:'10月7号17:00前',timeline:[],materials:[],warnings:[],reminders:[],tasks:[
 {text:'提交请假',assignee:null,scope:'conditional',condition:'需要8号请假的同学',details:[],steps:[{text:'提交截图',details:[]},{text:'填写办事簿',details:[]}],time:null,timeText:'10月7号17:00前',location:'智慧学工'},
 {text:'发送短信',assignee:'家长',scope:'role',condition:'学生需要8号请假',details:[],steps:[],time:null,timeText:'10月7号17:00前',location:null},
]};
const record=()=>createNotice(base,'请假通知');
describe('compact notice overview',()=>{
 it('keeps distinct conditions and roles visible without rewriting their meaning',()=>{
  expect(noticeOverview(record()).audiences).toEqual(['需要8号请假的同学','家长 · 学生需要8号请假']);
 });
 it('deduplicates repeated time and place fields without inventing a year or a location',()=>{
  const n=record();n.timeline=[{label:'提交',time:null,timeText:'10月7号 17：00前',location:'智慧学工'}];
  const result=noticeOverview(n);expect(result.times).toEqual(['10月7号17:00前']);expect(result.locations).toEqual(['智慧学工']);
  const missing={...n,deadlineText:'',tasks:[],timeline:[]};expect(noticeOverview(missing).times).toEqual([]);expect(noticeOverview(missing).locations).toEqual([]);
 });
 it('counts applicable tasks rather than checklist substeps and excludes dismissed roles',()=>{
  const n=record();const first=toggleStep(n,n.tasks[0].id,n.tasks[0].steps[0].id);expect(noticeOverview(first)).toMatchObject({completed:0,total:2,remaining:2});
  const finished=toggleStep(first,first.tasks[0].id,first.tasks[0].steps[1].id);const personal=setTaskApplicable(finished,finished.tasks[1].id,false);
  expect(noticeOverview(personal)).toMatchObject({completed:1,total:1,remaining:0,audiences:['需要8号请假的同学']});
 });
 it('keeps incomplete and relative times as the supplied text',()=>{
  const n=record();n.deadlineText='';n.tasks[0].timeText='课程结束前';n.tasks[1].timeText='';n.tasks[0].location=null;
  expect(noticeOverview(n).times).toEqual(['课程结束前']);expect(noticeOverview(n).locations).toEqual([]);
 });
 it('keeps the actionable deadline primary instead of adding a later processing date',()=>{
  const n=record();n.timeline=[{label:'班长确认',time:null,timeText:'10月7日17:00后',location:null}];
  expect(noticeOverview(n).times).toEqual(['10月7号17:00前']);
  const information={...n,kind:'information' as const,deadlineText:'',tasks:[]};expect(noticeOverview(information).times).toEqual(['班长确认：10月7日17:00后']);
 });
 it('flags notes on hidden steps and reminders without exposing private text in the overview',()=>{
  const n=record();n.tasks[0].steps[0].note='稍后问老师';expect(noticeOverview(n).notes).toBe(true);
  expect(JSON.stringify(noticeOverview(n))).not.toContain('稍后问老师');
 });
 it('distinguishes a hidden note or step match from a title or visible audience match',()=>{
  const n=record();n.tasks[0].steps[0].note='已联系苏老师';
  expect(matchesHiddenDetail(n,'苏老师')).toBe(true);expect(matchesHiddenDetail(n,'提交截图')).toBe(true);
  expect(matchesHiddenDetail(n,'请假办理')).toBe(false);expect(matchesHiddenDetail(n,'需要8号')).toBe(false);expect(matchesHiddenDetail(n,'')).toBe(false);
 });
});
