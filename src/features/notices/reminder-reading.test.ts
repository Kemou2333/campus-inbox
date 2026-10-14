import {describe,expect,it} from 'vitest';
import {reminderReadingTitle} from './reminder-reading';

describe('reminder reading labels',()=>{
 it('prefers the saved AI title, retaining the entire saved body',()=>{
  const reminder={title:'课程问答',text:'线上学习：需完成不少于**20%**的视频观看并完成课程问答。'};
  const original=JSON.stringify(reminder);expect(reminderReadingTitle(reminder,0)).toBe('课程问答');expect(JSON.stringify(reminder)).toBe(original);
 });
 it('uses whole short legacy headings and topic labels instead of chopped prose',()=>{
  expect(reminderReadingTitle({text:'期中测验：具体安排另行通知。'},0)).toBe('期中测验');
  expect(reminderReadingTitle({text:'习题课会结合学堂在线课程及作业情况进行题目讲解与讨论。'},1)).toBe('习题课');
  expect(reminderReadingTitle({text:'也可访问学堂在线官网查看完整课程内容。'},2)).toBe('课程入口');
  expect(reminderReadingTitle({text:'这一段非常长的具体说明内容并没有足够明确的主题名称，保留完整原文供同学核对。'},3)).toBe('说明 4');
 });
 it('does not borrow a URL as a title or remove it from the reminder',()=>{
  const reminder={text:'https://example.test/private/path'};expect(reminderReadingTitle(reminder,0)).toBe('说明 1');expect(reminder.text).toBe('https://example.test/private/path');
 });
});
