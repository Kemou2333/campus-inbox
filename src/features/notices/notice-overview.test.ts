import {describe,expect,it} from 'vitest';
import {createNotice,setTaskApplicable,toggleStep} from '../../domain/notice';
import type {NoticeAnalysis} from '../../domain/types';
import {compactNoticePreview,matchesHiddenDetail,noticeOverview} from './notice-overview';

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

describe('compact notice preview',()=>{
 it('returns the saved summary and keeps the existing visibility rule',()=>{
  const n=record();n.summary=' **按通知要求办理。** ';
  expect(compactNoticePreview(n)).toMatchObject({summary:' **按通知要求办理。** ',showSummary:true});
  n.summary=' **请假办理** ';expect(compactNoticePreview(n).showSummary).toBe(false);
  n.summary=' **按通知要求办理。** ';n.reminders=[{id:'reminder',text:'按通知要求办理。',note:''}];
  expect(compactNoticePreview(n).showSummary).toBe(false);
  n.summary=' ';expect(compactNoticePreview(n).showSummary).toBe(false);
 });
 it('shortens a long audience while keeping its saved condition available',()=>{
  const n=record();n.tasks=[n.tasks[0]];n.tasks[0].condition='需要在课程结束之后前往学院办公室办理请假的同学';
  expect(compactNoticePreview(n)).toMatchObject({audienceLabel:'需要在课程结束之后前往学院…',audienceCount:1});
  expect(noticeOverview(n).audiences).toEqual(['需要在课程结束之后前往学院办公室办理请假的同学']);
 });
 it('shows only the first short audience and a count for multiple roles',()=>{
  const n=record();n.tasks[0].scope='role';n.tasks[0].assignee='班长';n.tasks[0].condition='仅负责汇总本班报名并提交学院审核的班长';
  n.tasks[1].assignee='辅导员';n.tasks[1].condition='审核各班提交的详细申请材料并联系学院';
  n.tasks.push({...n.tasks[1],id:'third-role',assignee:'学院老师',condition:'统一处理最终结果并登记全部申请材料'});
  const preview=compactNoticePreview(n);
  expect(preview.audienceLabel).toBe('班长 · 仅负责汇总本班报…（共3类）');expect(preview.audienceCount).toBe(3);
  expect(preview.audienceLabel).not.toContain('辅导员');expect(preview.audienceLabel).not.toContain('详细申请材料');expect(preview.audienceLabel).not.toContain('统一处理');
 });
 it('counts Unicode characters without splitting emoji in shortened labels',()=>{
  const n=record();n.deadlineText='';n.tasks=[n.tasks[0]];n.tasks[0].condition='😀'.repeat(20);n.tasks[0].timeText='📅'.repeat(30);
  const preview=compactNoticePreview(n);
  expect(preview.audienceLabel).toBe('😀'.repeat(13)+'…');expect(Array.from(preview.audienceLabel)).toHaveLength(14);
  expect(preview.timeLabel).toBe('📅'.repeat(25)+'…');expect(Array.from(preview.timeLabel)).toHaveLength(26);
 });
 it('keeps the first supplied time short and counts other distinct times',()=>{
  const n=record();n.deadlineText='';n.tasks[0].timeText='课程结束之后前往学院办公室提交申请材料并等待审核结果及后续通知';n.tasks[1].timeText='次日课程开始前';
  expect(compactNoticePreview(n)).toMatchObject({timeLabel:'课程结束之后前往学院办公室提交申请材料并等待审核结…',timesCount:2});
 });
 it('does not infer an audience or a date when saved fields are empty',()=>{
  const n=record();n.deadline=null;n.deadlineText='';n.tasks=[];n.timeline=[];
  expect(compactNoticePreview(n)).toMatchObject({audienceLabel:'',audienceCount:0,timeLabel:'',timesCount:0});
 });
 it('does not change saved fields, progress, notes or hidden details',()=>{
  const n=record();n.note='自己填写的笔记';n.tasks[0].completed=true;n.tasks[0].steps[0].note='步骤笔记';n.tasks[0].details=['完整办理条件'];
  const before=JSON.stringify(n);compactNoticePreview(n);expect(JSON.stringify(n)).toBe(before);
 });
});
