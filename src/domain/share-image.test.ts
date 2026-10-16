import {describe,expect,it} from 'vitest';
import {layoutShareImages,SHARE_IMAGE_MAX_CHARACTERS,SHARE_IMAGE_MAX_HEIGHT,shareImageFileName,shareImageTimestamp,shareTextStyles,wrapShareText,type ShareTextBlock} from './share-image';

describe('bounded local share images',()=>{
 it('wraps a long URL and CJK without dropping characters or splitting surrogate pairs',()=>{
  const value='课程😊说明 https://example.test/'+('abc学号😊'.repeat(40));
  const wrapped=wrapShareText(value,18,text=>Array.from(text).length);
  expect(wrapped.join('')).toBe(value);expect(wrapped.every(line=>Array.from(line).length<=18)).toBe(true);
  expect(wrapped.some(line=>/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(line))).toBe(false);
 });
 it('keeps blank paragraphs and explicit line breaks',()=>{
  expect(wrapShareText('第一行\r\n\r\n第二行',100,text=>text.length)).toEqual(['第一行','','第二行']);
 });
 it('keeps CJK punctuation off the start of a wrapped line without dropping or overflowing text',()=>{
  const value='学业安排，及时完成。',wrapped=wrapShareText(value,4,text=>Array.from(text).length);
  expect(wrapped.join('')).toBe(value);expect(wrapped.every(line=>Array.from(line).length<=4&&!/^[，。]/.test(line))).toBe(true);
 });
 it('paginates all detail text with bounded canvases rather than silently cutting it',()=>{
  const blocks:ShareTextBlock[]=[{kind:'title',text:'完整通知'},{kind:'body',text:'材料和注意事项'.repeat(250)}];
  const pages=layoutShareImages(blocks,text=>Array.from(text).length*25);
  expect(pages.length).toBeGreaterThan(1);expect(pages.every(page=>page.height<=SHARE_IMAGE_MAX_HEIGHT)).toBe(true);
  expect(pages.flatMap(page=>page.lines.map(line=>line.text)).join('')).toBe(blocks.map(block=>block.text).join(''));
  expect(pages.flatMap(page=>page.lines).every(line=>line.y+40<SHARE_IMAGE_MAX_HEIGHT-100)).toBe(true);
 });
 it('fails visibly before huge allocations or more than eight pages',()=>{
  expect(()=>layoutShareImages([{kind:'body',text:'字'.repeat(SHARE_IMAGE_MAX_CHARACTERS+1)}],()=>1)).toThrow('内容较长');
  expect(()=>layoutShareImages([{kind:'body',text:'字'.repeat(1000)}],text=>text.length*1000)).toThrow('超过 8 页');
 });
 it('keeps a short section heading with its content and draws a state only once per wrapped task',()=>{
  const pages=layoutShareImages([{kind:'body',text:'前文\n'.repeat(25)},{kind:'heading',text:'材料'},{kind:'task',text:'准备完整报名材料'.repeat(5),state:'completed'}],text=>Array.from(text).length*25);
  expect(pages.flatMap(page=>page.lines).filter(line=>line.state)).toHaveLength(1);
  const materialPage=pages.find(page=>page.lines.some(line=>line.text==='材料'))!;
  expect(materialPage.lines.at(-1)?.text).not.toBe('材料');
 });
 it('retains semantic colors and block grouping across wrapped lines and page breaks',()=>{
  const pages=layoutShareImages([{kind:'fact',text:'截止：10月20日24:00'.repeat(12),tone:'time'},{kind:'heading',text:'注意',tone:'warning'},{kind:'body',text:'完整保留注意内容。',tone:'warning'}],text=>Array.from(text).length*30);
  const facts=pages.flatMap(page=>page.lines).filter(line=>line.kind==='fact');
  expect(facts.length).toBeGreaterThan(1);expect(facts.every(line=>line.tone==='time'&&line.block===0)).toBe(true);
  expect(pages.flatMap(page=>page.lines).find(line=>line.text==='注意')?.tone).toBe('warning');
 });
 it('uses distinct reading sizes and crops a short card without a large blank lower half',()=>{
  expect(shareTextStyles.title.size).toBeGreaterThan(shareTextStyles.task.size);
  expect(shareTextStyles.task.size).toBeGreaterThan(shareTextStyles.body.size);
  expect(shareTextStyles.body.size).toBeGreaterThanOrEqual(30);
  const [page]=layoutShareImages([{kind:'title',text:'评教'}],text=>text.length*50);
  expect(page.height).toBeLessThan(400);
 });
 it('uses a safe readable PNG filename with an explicit page index',()=>{
  expect(shareImageFileName('课/程:报名?',1,3)).toBe('课程报名-2共3页.png');
  expect(shareImageFileName('',0,1)).toBe('校园通知.png');
 });
 it('stamps Shanghai month/day and time even when UTC is still the previous day',()=>{
  expect(shareImageTimestamp(new Date('2026-10-14T16:01:00Z'))).toBe('10月15日 00:01');
 });
});
