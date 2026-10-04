import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),C=require('../dist/calendar.js');
const notice={id:'date-test',title:'核对学籍',summary:'核对资料',tasks:[],originalText:'2026年10月15日前'};
test('date-only calendar export keeps all-day precision and never adds a clock',()=>{const result=C.build(notice,'2026-10-15',true);assert.match(result,/DTSTART;VALUE=DATE:20261015/);assert.doesNotMatch(result,/DTSTART:|T2359/);});
test('calendar date selection rejects invalid dates instead of rolling them forward',()=>{for(const value of ['2026-02-30','2026-13-01','2026-10-15T00:00','2026-1-01'])assert.throws(()=>C.build(notice,value,true));assert.equal(C.dateStamp('2028-02-29'),'20280229');});
