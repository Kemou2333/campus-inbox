import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import examples from '../../../public/examples.json';
import {parseNotice} from '../../domain/notice';
import {evidenceFor,segmentSource} from '../../domain/source-evidence';
import {EvidenceLink} from './EvidenceLink';

describe('谨慎展示出处',()=>{
 const competition=parseNotice(examples.notices.find(n=>n.title.includes('外研社'))!);
 it('外研社旧例的七个相同截止指代不会再自动落到演讲初选',()=>{
  const before=structuredClone(competition),segments=segmentSource(competition.originalText);
  expect(competition.sourceRefs).toBeUndefined();expect(competition.tasks.length).toBe(7);
  for(const [i,task] of competition.tasks.entries()){
   expect(task.timeText).toBe('报名截止时间之前');
   const matches=segments.filter(s=>s.text.includes(task.timeText));expect(matches).toHaveLength(3);expect(matches[0].text).toContain('①初选');
   expect(evidenceFor(competition,`tasks.${i}.timeText`).segments).toEqual([]);expect(evidenceFor(competition,`tasks.${i}.text`).segments).toEqual([]);
   expect(renderToStaticMarkup(createElement(EvidenceLink,{notice:competition,path:`tasks.${i}.text`,onOpen:()=>{}}))).toBe('');
  }
  expect(competition).toEqual(before);
 });
 it('真实独立引用指向其指定赛项而非第一处相似句',()=>{
  const n=structuredClone(competition),segments=segmentSource(n.originalText),video=segments.find(s=>s.text.includes('撰写提交创意方案'))!;
  n.sourceRefs={'tasks.3.text':[video.index]};
  const evidence=evidenceFor(n,'tasks.3.text');expect(evidence.segments.map(s=>s.index)).toEqual([video.index]);expect(evidence.segments[0].text).not.toContain('3分钟定题演讲视频');
  expect(evidence.inferred).toBe(false);expect(evidenceFor(n,'tasks.0.text').segments).toEqual([]);
  expect(renderToStaticMarkup(createElement(EvidenceLink,{notice:n,path:'tasks.3.text',onOpen:()=>{}}))).toContain('evidence-link');
 });
 it.each([[0],[-1],[999999],[1,1],[1,999999],Array.from({length:9},(_,i)=>i+1)].map(refs=>({refs})))('非法或部分有效引用也不显示来源按钮 %j',({refs})=>{
  const n=structuredClone(competition);n.sourceRefs={'tasks.0.text':refs};
  expect(evidenceFor(n,'tasks.0.text').segments).toEqual([]);expect(renderToStaticMarkup(createElement(EvidenceLink,{notice:n,path:'tasks.0.text',onOpen:()=>{}}))).toBe('');
 });
 it('旧提醒即使全文恰好匹配原文，也没有凭空生成蓝色或灰色按钮',()=>{
  const n=parseNotice(examples.notices.find(n=>n.title==='军训期间宿舍安全提醒')!);
  expect(segmentSource(n.originalText).some(s=>s.text.includes(n.reminders[0].text))).toBe(true);
  expect(renderToStaticMarkup(createElement(EvidenceLink,{notice:n,path:'reminders.0',onOpen:()=>{}}))).toBe('');
 });
});
