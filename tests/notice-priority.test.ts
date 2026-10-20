import {expect,test} from 'vitest';
import {createNotice,parseNotices} from '../src/domain/notice';
import {inPastSevenDays,compactDateLabel,setManualPriority} from '../src/domain/notice-priority';
import type {NoticeAnalysis} from '../src/domain/types';
const analysis:NoticeAnalysis={schemaVersion:4,kind:'information',title:'报名',summary:'提交材料。',deadline:null,deadlineText:'',timeline:[],tasks:[],materials:[],warnings:[],reminders:[]};
const now=new Date(2026,9,20,15).getTime();
test('priority persists locally and explicit null clears it; malformed arrays are rejected',()=>{
 const n=createNotice(analysis,'原文');const changed=setManualPriority(n,'important');expect(parseNotices([changed])[0].manualPriority).toBe('important');expect(parseNotices([setManualPriority(changed,null)])[0].manualPriority).toBeNull();
 for(const invalid of [[],['important'],{},'bogus',false])expect(()=>parseNotices([{...n,manualPriority:invalid}])).toThrow();
});
test('past seven days includes today through day six, excludes future, missing and vague dates',()=>{
 const n=createNotice(analysis,'原文');
 for(const text of ['10月14日','10月20日23:59','2026年10月18日'])expect(inPastSevenDays({...n,deadlineText:text},now)).toBe(true);
 for(const text of ['', '10月13日','10月21日','2025年10月18日','本周日','课程结束前'])expect(inPastSevenDays({...n,deadlineText:text},now)).toBe(false);
 expect(inPastSevenDays({...n,createdAt:new Date(now).toISOString()},now)).toBe(false);
 const january=new Date(2027,0,3,15).getTime();expect(inPastSevenDays({...n,deadlineText:'12月30日'},january)).toBe(true);
});
test('time labels use known date parts without inventing a relative date',()=>{
 expect(compactDateLabel('截止时间：10月14日23:59前')).toBe('10月14日 23:59');expect(compactDateLabel('课程结束前')).toBe('');expect(compactDateLabel('周日24:00')).toBe('');
});
