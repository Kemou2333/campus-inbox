import {describe,it,expect} from 'vitest';
import {createDemoNotice} from '../onboarding/demo-notice';
import {noticeSearchMatches} from './search-matches';
describe('search result context',()=>{
 it('finds folded steps, notes and original text with bounded excerpts',()=>{
  const n=createDemoNotice();n.tasks[0].details=['前文'.repeat(80)+'隐藏位置'+ '后文'.repeat(80)];n.note='笔记中的另一个词';n.originalText+='原文独有词';
  const matches=noticeSearchMatches(n,'隐藏位置');expect(matches[0].label).toContain('说明');expect(matches[0].text).toContain('隐藏位置');expect(matches[0].text.length).toBeLessThan(90);
  expect(matches[0].path).toBe('tasks.0.details.0');
  expect(noticeSearchMatches(n,'原文独有词')[0].label).toBe('原文');expect(noticeSearchMatches(n,'另一个词')[0].label).toBe('笔记');
 });
 it('has no extra match display without a query and limits repeated hits',()=>{
  const n=createDemoNotice();expect(noticeSearchMatches(n,'')).toEqual([]);n.warnings=Array(20).fill('测试词');expect(noticeSearchMatches(n,'测试词')).toHaveLength(1);
 });
});
