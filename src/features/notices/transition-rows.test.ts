import {describe,expect,it} from 'vitest';
import {transitionRows} from './transition-rows';
const records=['a','b','c','d'].map(id=>({id}));
const visible=records.map(record=>({record,visible:true}));
describe('notice exit positions',()=>{
 it('a deleted middle card stays in its old position during collapse',()=>{
  const rows=transitionRows(visible,[records[0],records[2],records[3]]);
  expect(rows.map(r=>r.record.id)).toEqual(['a','b','c','d']);
  expect(rows.map(r=>r.visible)).toEqual([true,false,true,true]);
 });
 it('several disappearing cards retain their order, including an empty result',()=>{
  expect(transitionRows(visible,[records[0],records[3]]).map(r=>r.record.id)).toEqual(['a','b','c','d']);
  expect(transitionRows(visible,[])).toEqual(visible.map(r=>({...r,visible:false})));
 });
 it('undo during an exit revives the same row without creating a duplicate',()=>{
  const exiting=transitionRows(visible,[records[0],records[2],records[3]]);
  const restored=transitionRows(exiting,records);
  expect(restored).toEqual(visible);
 });
});
