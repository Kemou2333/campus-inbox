import {describe,expect,it} from 'vitest';
import {createNotice,parseAnalysis,parseNotice} from '../src/domain/notice';
import {parseTimeSpec,timeFromText,timeSpecToISO} from '../src/domain/time';
import type {NoticeAnalysis,TimeSpec} from '../src/domain/types';
import '../server/contracts/time.js';
import '../server/contracts/data.js';

interface TimeContract {fromText(raw:string):TimeSpec;normalize(value:unknown,raw:string,strict?:boolean):TimeSpec;ground(value:unknown,raw:string,source:string):TimeSpec;toISO(value:TimeSpec):string|null}
interface TimeRecord {originalText:string;tasks:{timeSpec?:TimeSpec;completed:boolean;note:string}[]}
interface DataContract {analysis(value:unknown,strict?:boolean):NoticeAnalysis;create(value:unknown,source:string):TimeRecord;notice(value:unknown):TimeRecord}
const server=(globalThis as typeof globalThis&{CampusTime:TimeContract;CampusData:DataContract});
const raw='10 月14日23:59';
const fixture=(spec:TimeSpec):NoticeAnalysis=>({schemaVersion:4,kind:'task',title:'报名通知',summary:'按通知要求报名。',deadline:null,deadlineText:'',timeline:[],materials:[],warnings:[],reminders:[],tasks:[{text:'提交报名',scope:'all',condition:'',assignee:null,details:[],steps:[],time:null,timeText:raw,timeSpec:spec,location:null}]});

describe('spaced dates stay grounded and compatible',()=>{
 it('recognizes horizontal spacing without filling the year or rewriting raw text',()=>{
  for(const text of [raw,'10 月 14 日23:59','十　月十四　日23:59']){
   const browser=timeFromText(text),backend=server.CampusTime.fromText(text);
   expect(browser).toEqual(backend);expect(browser).toEqual({type:'partial',year:null,month:10,day:14,hour:23,minute:59,rawText:text});
   expect(timeSpecToISO(browser)).toBeNull();expect(server.CampusTime.toISO(backend)).toBeNull();expect(parseTimeSpec(browser,text)).toEqual(browser);expect(server.CampusTime.normalize(backend,text)).toEqual(backend);
  }
 });
 it('allows ISO only from a complete confirmed point, while incomplete or second-bearing times stay bounded',()=>{
  const text='2026年10 月14 日23:59',expected='2026-10-14T23:59:00';
  expect(timeFromText(text)).toEqual(server.CampusTime.fromText(text));expect(timeSpecToISO(timeFromText(text))).toBe(expected);
  const grounded=server.CampusTime.ground(timeFromText(text),text,`报名截止：${text}。`);expect(server.CampusTime.toISO(grounded)).toBe(expected);expect(grounded.rawText).toBe(text);
  expect(server.CampusTime.ground(timeFromText(text),text,`报名截止：${raw}。`).type).toBe('unknown');
  for(const incomplete of ['2026 年10 月14 日',raw,'2026年10 月14 日23:59:30']){expect(timeSpecToISO(timeFromText(incomplete))).toBeNull();expect(server.CampusTime.toISO(server.CampusTime.fromText(incomplete))).toBeNull();}
 });
 it('retains safe older underprecision and progress only for saved records, while AI and contradictory values stay strict',()=>{
  const fresh=timeFromText(raw),old={...fresh,month:null};
  expect(()=>parseAnalysis(fixture(old))).toThrow();expect(()=>server.CampusData.analysis(fixture(old),true)).toThrow();
  const browser=createNotice(fixture(fresh),'合成报名通知'),backend=server.CampusData.create(fixture(fresh),'合成报名通知');
  for(const record of [browser,backend]){record.tasks[0].timeSpec=old;record.tasks[0].completed=true;record.tasks[0].note='已提交，待确认';}
  const beforeBrowser=structuredClone(browser),beforeBackend=structuredClone(backend),restoredBrowser=parseNotice(browser),restoredBackend=server.CampusData.notice(backend);
  for(const restored of [restoredBrowser,restoredBackend]){expect(restored.tasks[0].timeSpec).toEqual(old);expect(restored.tasks[0].completed).toBe(true);expect(restored.tasks[0].note).toBe('已提交，待确认');}
  expect(browser).toEqual(beforeBrowser);expect(backend).toEqual(beforeBackend);
  for(const invalid of [{...old,month:11},{...old,year:2026}]){
   expect(()=>parseNotice({...browser,tasks:[{...browser.tasks[0],timeSpec:invalid}]})).toThrow();expect(()=>server.CampusData.notice({...backend,tasks:[{...backend.tasks[0],timeSpec:invalid}]})).toThrow();
  }
  expect(parseAnalysis(fixture(fresh))).toEqual(server.CampusData.analysis(fixture(fresh),true));
 });
 it('does not merge neighboring dates or use line removal to construct a confirmed point',()=>{
  for(const text of ['10 月14 日 11 月15 日','2026 年10 月14 日至15 日']){expect(timeFromText(text)).toEqual(server.CampusTime.fromText(text));expect(timeFromText(text).type).toBe('unknown');}
  const text='2026年10 月14 日23:59';
  for(const separator of ['\n','\r\n','\u2028','\u2029','\v','\f']){
   const split=`2026年10 月${separator}14 日23:59`;
   expect(server.CampusTime.ground(timeFromText(text),text,'第一段'+split).type).toBe('unknown');
   expect(timeSpecToISO(timeFromText(split))).toBeNull();expect(server.CampusTime.toISO(server.CampusTime.fromText(split))).toBeNull();
  }
 });
});
