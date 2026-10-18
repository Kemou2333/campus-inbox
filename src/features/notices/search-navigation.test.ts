import {describe,it,expect} from 'vitest';
import {uniqueSearchLocations,resolveSearchLocation,type SearchLocation} from './search-navigation';

const location=(element:string,noticeID:string,text:string,context=false,occurrence=0):SearchLocation<string>=>({element,noticeID,text,context,occurrence});
describe('搜索匹配位置导航',()=>{
 it('正文已经可读时不再重复统计同文上下文，保留其他通知的命中',()=>{
  const body=location('正文','第一条','前文 关键字 后文');
  const repeated=location('片段','第一条','…关键字 后文',true);
  const other=location('另一条','第二条','前文 关键字 后文');
  expect(uniqueSearchLocations([body,repeated,other])).toEqual([body,other]);
 });
 it('同一段出现两次仍是两个位置，重复渲染的同文不翻倍',()=>{
  const first=location('第一处','通知','关键字与关键字',false,0),second=location('第二处','通知','关键字与关键字',false,1);
  expect(uniqueSearchLocations([first,second,location('重复副本','通知','关键字与关键字',false,0)])).toEqual([first,second]);
 });
 it('折叠内容和原文的短片段仍可导航，空白位置不计数',()=>{
  const folded=location('折叠片段','通知','隐藏的关键字',true);
  expect(uniqueSearchLocations([folded,location('空','通知',' \n\t')])).toEqual([folded]);
 });
 it('展开后片段被正文替换，保留同条通知同一处选择',()=>{
  const previous=location('旧片段','通知','…关键字 后文',true),other=location('另一条正文','另一条','前文 关键字 后文'),body=location('新正文','通知','前文 关键字 后文');
  expect(resolveSearchLocation([other,body],previous)).toBe(body);
  expect(resolveSearchLocation([other],previous)).toBeUndefined();
 });
 it('同一节点优先保留，换查询或移除后可安全重置',()=>{
  const target=location('节点','通知','关键词');
  expect(resolveSearchLocation([target],target)).toBe(target);
  expect(resolveSearchLocation([target],null)).toBeUndefined();
  expect(resolveSearchLocation([],target)).toBeUndefined();
 });
});
