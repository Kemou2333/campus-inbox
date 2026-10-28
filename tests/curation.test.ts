import {test,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {selectableExamples,selectExampleBatch,mergeExamples} from '../src/domain/examples';
import {parseBackup} from '../src/domain/notice';
const data=async()=>parseBackup(JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8')));
test('catalog chooses one representative, preserves the three different cards and seven featured order',async()=>{
 const catalog=await data(),chosen=selectableExamples(catalog);
 expect(chosen).toHaveLength(19);
 expect(['example-reading-v211-0','example-reading-v212-1','example-reading-v26-12','example-reading-v211-2','example-reading-v25-5'].every(id=>!chosen.some(n=>n.id===id))).toBe(true);
 expect(['example-reading-v213-0','example-reading-v213-1','example-reading-v212-2','example-reading-v25-8','example-reading-v25-9','example-reading-v25-10'].every(id=>chosen.some(n=>n.id===id))).toBe(true);
 const first=selectExampleBatch([],catalog);expect(first.records.map(n=>n.id)).toEqual(['example-reading-v213-0','example-reading-v211-3','example-reading-v25-11','example-reading-v211-4','example-reading-v212-0','example-reading-v25-3','example-reading-v212-2']);
 const all=selectExampleBatch([],catalog,100);expect(all.records).toHaveLength(19);expect(all.remaining).toBe(0);
});
test('saved edited legacy record remains and prevents a second version of its source',async()=>{
 const catalog=await data();const old=structuredClone(catalog.find(n=>n.id==='example-reading-v211-0')!);old.note='我的笔记';old.tasks[0].completed=true;
 const batch=selectExampleBatch([old],catalog,100);expect(batch.records.some(n=>n.id==='example-reading-v213-0')).toBe(true);
 const result=await mergeExamples([old],batch.records,[]);expect(result.notices.find(n=>n.id===old.id)).toEqual(old);expect(result.notices.some(n=>n.id==='example-reading-v213-0')).toBe(false);
});
test('distinct cards sharing the same original load together',async()=>{
 const catalog=await data();const batch=selectExampleBatch([],catalog,100);const cards=batch.records.filter(n=>['example-reading-v25-8','example-reading-v25-9','example-reading-v25-10'].includes(n.id));
 expect(cards).toHaveLength(3);expect((await mergeExamples([],cards,[])).notices).toHaveLength(3);
});
test('corrected examples upgrade only exact untouched records, preserving edits',async()=>{
 const catalog=await data(),old=structuredClone(catalog),legacy=JSON.parse(await readFile(new URL('../public/examples-legacy.json',import.meta.url),'utf8'));
 old.find(n=>n.id==='example-reading-v211-1')!.tasks[0].steps[1].details[0]='腾讯文档“重大杯本科生院篮球队预选信息收集表”：www.example.com/forms/basketball-signup。';
 old.find(n=>n.id==='example-reading-v25-4')!.summary='军训期间的宿舍用电与外出安全提醒。';
 old.find(n=>n.id==='example-reading-v211-5')!.reminders[3].text='**雅思6.5（小分6）**或**PTE 64分以上**；原文另提“两年内雅思成绩更好”。';
 for(const id of ['example-reading-v211-1','example-reading-v211-5','example-reading-v25-4']){
  const previous=old.find(n=>n.id===id)!,corrected=catalog.find(n=>n.id===id)!;
  expect((await mergeExamples([previous],[corrected],legacy)).notices).toEqual([corrected]);
  const modified=structuredClone(previous);modified.note='保留笔记';modified.completed=true;
  expect((await mergeExamples([modified],[corrected],legacy)).notices).toEqual([modified]);
 }
});
