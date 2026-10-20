import {readFileSync} from 'node:fs';
import {describe,expect,test} from 'vitest';
import {parseNotice} from '../../domain/notice';
import {createGuestDemoNotice,GUEST_DEMO_SOURCES} from '../../infrastructure/guest-demo';
import {findReviewedExampleQuestion,REVIEWED_EXAMPLE_QUESTIONS,reviewedQuestionContent} from './reviewed-example-question';

const catalog=(JSON.parse(readFileSync(new URL('../../../public/examples.json',import.meta.url),'utf8')) as {notices:unknown[]}).notices.map(parseNotice);
describe('human reviewed example questions',()=>{
 test('covers all 24 exact reviewed catalog records with grounded formatted answers',async()=>{
  expect(catalog).toHaveLength(24);expect(REVIEWED_EXAMPLE_QUESTIONS).toHaveLength(24);
  expect(new Set(REVIEWED_EXAMPLE_QUESTIONS.map(entry=>entry.catalogId)).size).toBe(24);
  for(const notice of catalog){
   const entry=await findReviewedExampleQuestion(notice);
   expect(entry,notice.id).not.toBeNull();
   expect(entry).toMatchObject({catalogId:notice.id,origin:'human-reviewed-example',providerCalled:false,manualContentReview:true});
   expect(entry!.question.length).toBeLessThanOrEqual(80);expect(entry!.answer.length).toBeLessThanOrEqual(1000);
   expect(entry!.answer).toMatch(/\n\n|(^|\n)-\s/);expect(entry!.evidence.length).toBeGreaterThan(0);
   for(const quote of entry!.evidence)expect(notice.originalText).toContain(quote);
   expect(JSON.stringify(entry)).not.toMatch(/https?:\/\/|\b1[3-9]\d{9}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  }
 });
 test('recognizes every untouched local demo clone without using task IDs or timestamps',async()=>{
  for(const [index,source] of GUEST_DEMO_SOURCES.entries())expect(await findReviewedExampleQuestion(createGuestDemoNotice(String(index),source))).not.toBeNull();
 });
 test('never gives a canned answer to personal, edited, corrected or attached records',async()=>{
  const original=catalog[0];
  expect(await findReviewedExampleQuestion({...original,id:'personal-notice'})).toBeNull();
  expect(await findReviewedExampleQuestion({...original,id:'example-reading-personal'})).toBeNull();
  expect(await findReviewedExampleQuestion({...original,originalText:original.originalText+' '})).toBeNull();
  expect(await findReviewedExampleQuestion({...original,summary:'我改过简介'})).toBeNull();
  const altered=structuredClone(original);altered.tasks[0].steps[0].details.push('用户改动');expect(await findReviewedExampleQuestion(altered)).toBeNull();
  expect(await findReviewedExampleQuestion({...original,corrections:{updatedAt:original.updatedAt,values:[{path:'title',value:'我的标题'}]}})).toBeNull();
  expect(await findReviewedExampleQuestion({...original,attachments:['local-file']})).toBeNull();
  const editedClone=createGuestDemoNotice('edited');editedClone.originalText+='新增条件';expect(await findReviewedExampleQuestion(editedClone)).toBeNull();
 });
 test('excludes private notes and progress from the matching projection and returned answer',async()=>{
  const notice=structuredClone(catalog[0]);notice.note='private notice secret';notice.tasks[0].note='private task secret';notice.tasks[0].steps[0].note='private step secret';notice.completed=true;notice.tasks[0].completed=true;
  expect(JSON.stringify(reviewedQuestionContent(notice))).not.toContain('secret');
  const result=await findReviewedExampleQuestion(notice);expect(result).not.toBeNull();expect(JSON.stringify(result)).not.toContain('secret');
 });
});
