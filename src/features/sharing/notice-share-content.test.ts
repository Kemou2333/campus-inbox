import {describe,expect,it} from 'vitest';
import {createNotice} from '../../domain/notice';
import type {NoticeAnalysis} from '../../domain/types';
import {noticeShareBlocks} from './notice-share-content';

const analysis:NoticeAnalysis={schemaVersion:4,kind:'task',title:'**网上课程学习**',summary:'完成双平台学习任务。',deadline:null,deadlineText:'第16周周日24:00',timeline:[],materials:['课程学习素材'],warnings:['本人原创，不接受搬运。'],reminders:['线上成绩计入平时作业。'],reminderTitles:['成绩构成'],tasks:[
 {text:'观看5个视频',assignee:null,scope:'conditional',condition:'普通班学生',details:['前5章各看第一个视频。'],steps:[{text:'进入学堂在线',details:['核对教学班号。']}],time:null,timeText:'第16周周日24:00',location:'学堂在线'},
 {text:'提交1个素材',assignee:null,scope:'conditional',condition:'普通班学生',details:['视频、音频或文字均可。'],steps:[],time:null,timeText:'第16周周日24:00',location:'学堂在线'},
]};
function record(){const n=createNotice(analysis,'原文私人内容');n.note='仅自己可见的笔记';n.tasks[0].note='任务笔记';n.tasks[0].steps[0].note='步骤笔记';n.reminders[0].note='提醒笔记';n.attachments=['private-file'];return n;}

describe('share content allowlist',()=>{
 it('keeps personal notification wording unchanged except Markdown rendering and shares progress',()=>{
  const n=record();n.tasks[0].completed=true;n.tasks[1].dismissed=true;
  const blocks=noticeShareBlocks(n,false),text=blocks.map(block=>block.text).join('\n');
  expect(text).toContain('网上课程学习');expect(text).toContain('第16周周日24:00');expect(text).toContain('普通班学生');
  expect(blocks.filter(block=>block.kind==='task').map(block=>block.state)).toEqual(['completed','dismissed']);
  expect(text).not.toContain('前5章各看');expect(text).not.toContain('本人原创');expect(text).toContain('成绩构成');
 });
 it('never includes original text, notes, files or source references in either mode',()=>{
  const n=record();n.sourceRefs={'tasks.0.text':[1]};
  for(const details of [false,true]){
   const text=JSON.stringify(noticeShareBlocks(n,details));
   for(const privateText of ['原文私人内容','仅自己可见的笔记','任务笔记','步骤笔记','提醒笔记','private-file','sourceRefs'])expect(text).not.toContain(privateText);
  }
 });
 it('includes complete requirements and steps in detail mode without guessing relative dates',()=>{
  const text=noticeShareBlocks(record(),true).map(block=>block.text).join('\n');
  for(const expected of ['前5章各看第一个视频。','核对教学班号。','视频、音频或文字均可。','本人原创，不接受搬运。','课程学习素材','线上成绩计入平时作业。'])expect(text).toContain(expected);
  expect(text).not.toMatch(/2026|\d+月\d+日/);
 });
 it('exports user corrections and never mutates the saved AI record or sanitizes personal names',()=>{
  const n=record();n.corrections={updatedAt:n.updatedAt,values:[{path:'title',value:'林同学的课程安排'},{path:'tasks.0.details.0',value:'人工修正后的要求'}]};
  const before=JSON.stringify(n),text=noticeShareBlocks(n,true).map(block=>block.text).join('\n');
  expect(text).toContain('林同学的课程安排');expect(text).toContain('人工修正后的要求');expect(text).not.toContain('前5章各看第一个视频。');expect(JSON.stringify(n)).toBe(before);
 });
 it('retains private link targets as inert text without fetching them',()=>{
  const n=record();n.tasks[0].details=['前往[报名表](https://example.invalid/private?token=sample)填写。'];
  const text=noticeShareBlocks(n,true).map(block=>block.text).join('\n');expect(text).toContain('报名表（https://example.invalid/private?token=sample）');
 });
});
