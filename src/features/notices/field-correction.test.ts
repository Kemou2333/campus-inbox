import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import examples from '../../../public/examples.json';
import {parseNotice} from '../../domain/notice';
import {effectiveNotice,setCorrections} from '../../domain/corrections';
import {applyFieldCorrection} from './field-correction';
import {NoticeCard,type NoticeActions} from './NoticeCard';

describe('在通知原位置逐处修正',()=>{
 const base=parseNotice(examples.notices.find(n=>n.title.includes('外研社'))!);
 it('只更新点击字段，初稿、原文和其他修正及进度不变',()=>{
  const n=setCorrections({...structuredClone(base),note:'个人笔记',favorite:true},[{path:'summary',value:'已修正简介'}]);
  n.tasks[0].completed=true;n.tasks[0].note='待办笔记';
  const before=structuredClone(n),changed=applyFieldCorrection(n,before,'tasks.1.text','只改第二条待办');
  expect(n).toEqual(before);expect(changed.title).toBe(n.title);expect(changed.tasks).toEqual(n.tasks);expect(changed.originalText).toBe(n.originalText);
  expect(changed.note).toBe('个人笔记');expect(changed.favorite).toBe(true);
  expect(effectiveNotice(changed).tasks[1].text).toBe('只改第二条待办');expect(effectiveNotice(changed).tasks[0].text).toBe(n.tasks[0].text);expect(effectiveNotice(changed).summary).toBe('已修正简介');
  const reordered=Object.fromEntries(Object.entries(before).reverse()) as typeof before;
  expect(()=>applyFieldCorrection(reordered,before,'title','保存前顺序不同')).not.toThrow();
 });
 it('恢复这一处仅移除它自己的覆盖，不影响其他修正',()=>{
  const n=setCorrections(base,[{path:'title',value:'人工标题'},{path:'summary',value:'人工简介'}]);
  const changed=applyFieldCorrection(n,structuredClone(n),'title',n.title);
  expect(changed.corrections?.values).toEqual([{path:'summary',value:'人工简介'}]);
  const restored=applyFieldCorrection(changed,structuredClone(changed),'summary',base.summary);
  expect(restored.corrections).toBeUndefined();expect(restored.originalText).toBe(base.originalText);
 });
 it('拒绝并发变更、非法路径及空的必填内容',()=>{
  const snapshot=structuredClone(base);
  expect(()=>applyFieldCorrection({...base,note:'其他设备新笔记'},snapshot,'title','新标题')).toThrow('通知已更新');
  expect(()=>applyFieldCorrection(base,snapshot,'originalText','不能改原文')).toThrow('暂时不能修改');
  expect(()=>applyFieldCorrection(base,snapshot,'tasks.0.text','')).toThrow('不能为空');
 });
 it('编辑态直接渲染精确位置，普通态不添加可编辑控件',()=>{
  const actions:NoticeActions={note:()=>{},details:()=>{},calendar:()=>{},evidence:()=>{},correct:()=>{}};
  const props={notice:base,app:{act:()=>{},remove:()=>{}},actions,now:Date.now(),expanded:false,onExpandedChange:()=>{},expandedTaskIDs:new Set<string>(),onTaskExpandedChange:()=>{}};
  const editing=renderToStaticMarkup(createElement(NoticeCard,{...props,editing:true,onEditingClose:()=>{}}));
  expect(editing).toContain('点文字修改');expect(editing).toContain('data-correction-path="title"');expect(editing).toContain('data-correction-path="tasks.1.text"');
  expect(editing).toContain('data-correction-path="tasks.0.details.0"');expect(editing).not.toContain('修改位置');
  expect(renderToStaticMarkup(createElement(NoticeCard,props))).not.toContain('data-correction-path');
 });
});
