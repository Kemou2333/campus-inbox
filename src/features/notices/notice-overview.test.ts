import {describe,expect,it} from 'vitest';
import {createNotice,setTaskApplicable,toggleStep} from '../../domain/notice';
import type {NoticeAnalysis} from '../../domain/types';
import {displayTime,headlineTime,extraTimeline,matchesHiddenDetail,noticeOverview,readingSummary,sameHeadlineTime,summaryPreview,taskTime} from './notice-overview';

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
  const n=record();n.tasks[0].steps[0].note='已联系青禾老师（化名）';
  expect(matchesHiddenDetail(n,'青禾老师（化名）')).toBe(true);expect(matchesHiddenDetail(n,'提交截图')).toBe(true);
  expect(matchesHiddenDetail(n,'请假办理')).toBe(false);expect(matchesHiddenDetail(n,'需要8号')).toBe(false);expect(matchesHiddenDetail(n,'')).toBe(false);
 });
});

describe('readable notice facts',()=>{
 it('shows a deadline caption once and keeps relative deadline phrases intact',()=>{
  expect(headlineTime('报名截止时间:2026年6月1日15:00')).toBe('6月1日15:00');
  expect(headlineTime('截止：2026/10/9 09:00')).toBe('10月9日 09:00');
  expect(headlineTime('报名截止时间之前')).toBe('报名截止时间之前');
 });
 it('shows month/day while leaving unknown, relative and 24:00 times intact',()=>{
  expect(displayTime('2026年9月23日 18:00-21:00')).toBe('9月23日 18:00-21:00');
  expect(displayTime('2026/9/23 18:00')).toBe('9月23日 18:00');
  expect(displayTime('截止：2026-09-23 18:00')).toBe('截止:9月23日 18:00');
  expect(displayTime('9 月 22 前')).toBe('9月22日前');
  expect(displayTime('2026年10月20日24:00')).toBe('10月20日24:00');
  expect(displayTime('课程结束前')).toBe('课程结束前');
  expect(displayTime('2026级学生')).toBe('2026级学生');
 });
 it('removes only complete duplicated time phrases and leaves saved model text intact',()=>{
  const n=record();n.summary='同学须在10月7号17:00前提交申请并填写表格。';const original=JSON.stringify(n);
  expect(readingSummary(n)).toBe('同学须提交申请并填写表格。');
  expect(JSON.stringify(n)).toBe(original);
  n.summary='校赛开始报名，报名截止时间：10月7号17:00前。';expect(readingSummary(n)).toBe('校赛开始报名。');
  n.summary='校赛可报名，截止10月7号17:00前，须扫码并加群。';expect(readingSummary(n)).toBe('校赛可报名，须扫码并加群。');
  n.summary='报名截止，后续安排见群通知。';expect(readingSummary(n)).toBe(n.summary);
  n.summary='请在报名截止时间之前提交。';expect(readingSummary(n)).toBe(n.summary);
  n.summary='同学须在10月8日17:00前提交申请。';expect(readingSummary(n)).toBe(n.summary);
  n.summary='同学须在10月7号17:00后提交申请。';expect(readingSummary(n)).toBe(n.summary);
 });
 it('keeps more precise or different-year summary dates instead of hiding unmatched facts',()=>{
  const n=record();n.deadlineText='10月7日';n.tasks=[];n.summary='10月7日17:00前报名，2027年10月7日复审。';
  expect(readingSummary(n)).toBe(n.summary);
  n.summary='在提交前检查**10月7日**这个日期。';expect(readingSummary(n)).toBe(n.summary);
 });
 it('keeps distinct task times visible when the headline shows only the first time',()=>{
  const n=record();n.deadlineText='';n.tasks[1].timeText='10月8号17:00前';
  expect(sameHeadlineTime(taskTime(n.tasks[0]),n)).toBe(true);
  expect(sameHeadlineTime(taskTime(n.tasks[1]),n)).toBe(false);
  n.tasks[0].timeText='2026年10月7日';n.tasks[1].timeText='2027年10月7日';
  expect(sameHeadlineTime(taskTime(n.tasks[1]),n)).toBe(false);
 });
 it('prioritizes a personal task deadline over its saved time without overwriting either',()=>{
  const n=record();n.deadlineText='';n.tasks[0].localDeadline='2026-10-09T09:00:00+08:00';const original=JSON.stringify(n);
  expect(taskTime(n.tasks[0])).toContain('2026');expect(taskTime(n.tasks[0])).toContain('9');
  expect(noticeOverview(n).times[0]).toBe(taskTime(n.tasks[0]));expect(JSON.stringify(n)).toBe(original);
 });
 it('omits an identical timeline action but retains a different action, date or place',()=>{
  const n=record();const t=n.tasks[0];n.timeline=[
   {label:'提交请假',time:null,timeText:t.timeText,location:t.location},
   {label:'老师审核',time:null,timeText:t.timeText,location:t.location},
   {label:'提交请假',time:null,timeText:'10月8日17:00前',location:t.location},
   {label:'提交请假',time:null,timeText:t.timeText,location:'学院办公室'},
  ];const original=JSON.stringify(n);
  expect(extraTimeline(n)).toEqual(n.timeline.slice(1));expect(JSON.stringify(n)).toBe(original);
 });
 it('previews whole clauses, preserving the remaining summary for expansion',()=>{
  const n=record();n.summary='请提交**完整材料**并核对自己的信息，'+ '这是需要保留在补充简介里的详细原文'.repeat(5)+'。';
  const preview=summaryPreview(n);expect(preview.text).toBe('请提交**完整材料**并核对自己的信息，');
  expect(preview.more).toBe(true);expect(preview.full).toBe(n.summary);expect(preview.text).not.toContain('…');
 });
 it('does not invent a preview when saved summary or times are empty',()=>{
  const n=record();n.summary='';n.deadlineText='';n.tasks=[];n.timeline=[];
  expect(summaryPreview(n)).toEqual({text:'',full:'',more:false});expect(noticeOverview(n).times).toEqual([]);
 });
});
