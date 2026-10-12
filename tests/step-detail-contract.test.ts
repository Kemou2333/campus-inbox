import {describe,expect,it} from 'vitest';
import {createNotice,exportBackup,parseAnalysis,parseBackup} from '../src/domain/notice';
import type {NoticeAnalysis} from '../src/domain/types';
import '../server/contracts/data.js';

interface ServerContract {
 analysis(value:unknown,strict?:boolean):NoticeAnalysis;
 create(value:unknown,source:string):ServerRecord;
 exportBackup(records:ServerRecord[]):unknown;
 backup(value:unknown):ServerRecord[];
}
interface ServerRecord {tasks:{note:string;completed:boolean;steps:{id:string;text:string;details:string[];completed:boolean;note:string}[]}[]}
const server=(globalThis as typeof globalThis&{CampusData:ServerContract}).CampusData;
// Synthetic course requirements, independent of private notices and provider responses.
const sixDetails=['作品须标注课程名称','可使用文字、录音或短视频','说明作品与课程的关系','解答题须展示推导过程','提交内容应由本人创作','以审核结果为准'];
const fixture=(details:unknown):unknown=>({schemaVersion:4,kind:'task',title:'提交课程作品',summary:'按要求提交作品并确认回执。',deadline:null,deadlineText:'',timeline:[],materials:[],warnings:[],reminders:[],tasks:[{text:'提交学习作品',assignee:null,scope:'all',condition:'',details:[],steps:[{text:'准备并提交作品',details},{text:'确认回执',details:[]}],time:null,timeText:'',location:null}]});

describe('bounded step detail compatibility across browser and server',()=>{
 it('keeps all six meaningful requirements and both parsers normalize them identically',()=>{
  const source=fixture(sixDetails),before=structuredClone(source),browser=parseAnalysis(source),backend=server.analysis(source,true);
  expect(browser).toEqual(backend);expect(browser.tasks[0].steps[0].details).toEqual(sixDetails);expect(source).toEqual(before);
 });
 it('accepts twenty details but both sides still reject the same count, type, text and step-count violations',()=>{
  const boundary=fixture(Array(20).fill('细'.repeat(500)));expect(parseAnalysis(boundary)).toEqual(server.analysis(boundary,true));
  for(const details of [Array(21).fill('内容'),['细'.repeat(501)],['有效内容',42],['有效内容',null],['有效内容',{}],[' '],null,'内容']){
   const value=fixture(details);expect(()=>parseAnalysis(value)).toThrow();expect(()=>server.analysis(value,true)).toThrow();
  }
  const ten=parseAnalysis(fixture(sixDetails));ten.tasks[0].steps=Array.from({length:10},()=>({text:'核对',details:[]}));expect(parseAnalysis(ten)).toEqual(server.analysis(ten,true));
  ten.tasks[0].steps.push({text:'多余步骤',details:[]});expect(()=>parseAnalysis(ten)).toThrow();expect(()=>server.analysis(ten,true)).toThrow();
 });
 it('six-detail steps survive backup restoration with their existing IDs, progress and private notes',()=>{
  const browser=createNotice(fixture(sixDetails),'合成课程通知'),backend=server.create(fixture(sixDetails),'合成课程通知');
  for(const record of [browser,backend]){record.tasks[0].note='回头核对审核结果';record.tasks[0].steps[0].completed=true;record.tasks[0].steps[0].note='已提交，保存回执';}
  const beforeBrowser=structuredClone(browser),beforeBackend=structuredClone(backend);
  const restoredBrowser=parseBackup(exportBackup([browser]))[0],restoredBackend=server.backup(server.exportBackup([backend]))[0];
  expect(restoredBrowser.tasks[0].steps).toEqual(beforeBrowser.tasks[0].steps);expect(restoredBackend.tasks[0].steps).toEqual(beforeBackend.tasks[0].steps);
  expect(restoredBrowser.tasks[0].note).toBe(browser.tasks[0].note);expect(restoredBackend.tasks[0].note).toBe(backend.tasks[0].note);
  expect(restoredBrowser.tasks[0].completed).toBe(false);expect(restoredBackend.tasks[0].completed).toBe(false);expect(browser).toEqual(beforeBrowser);expect(backend).toEqual(beforeBackend);
 });
});
