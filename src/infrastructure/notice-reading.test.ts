import {describe,expect,test} from 'vitest';
import {createNotice} from '../domain/notice';
import type {NoticeAnalysis} from '../domain/types';
import {NoticeReading} from './notice-reading';
import {accountLocalScope,initialAccountLocalScope} from './local-account-scope';

function memory(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},key:(index:number)=>[...values.keys()][index]??null,get length(){return values.size;}};}
const analysis:NoticeAnalysis={schemaVersion:4,kind:'information',title:'虚构通知',summary:'供本机测试。',deadline:null,deadlineText:'',timeline:[],tasks:[],materials:[],warnings:[],reminders:['阅读测试']};
const notice=(id:string)=>({...createNotice(analysis,'虚构原文。','2026-10-18T00:00:00Z'),id});
describe('account-separated local unread state',()=>{
 test('initial existing records are read, new personal results become unread and examples stay quiet',()=>{
  const ledger=new NoticeReading(memory()),old=notice('old'),fresh=notice('ai-fresh');expect(ledger.reconcile('device',[old])).toEqual([]);
  expect(ledger.reconcile('device',[old,fresh,notice('example-reading-v211-1'),notice('local-demo-v1-example')])).toEqual(['ai-fresh']);
  ledger.markRead('device',fresh.id);expect(ledger.reconcile('device',[old,fresh])).toEqual([]);
 });
 test('refresh and ordinary edits preserve unread while explicit reading does not alter another account',()=>{
  const storage=memory(),first=new NoticeReading(storage),old=notice('old'),fresh=notice('new');first.reconcile('account:one',[old]);first.reconcile('account:two',[old]);first.reconcile('account:one',[old,fresh]);first.reconcile('account:two',[old,fresh]);
  const reopened=new NoticeReading(storage);expect(reopened.reconcile('account:one',[{...old,note:'a note'},fresh])).toEqual(['new']);reopened.markRead('account:one','new');
  expect(reopened.reconcile('account:one',[old,fresh])).toEqual([]);expect(reopened.reconcile('account:two',[old,fresh])).toEqual(['new']);
 });
 test('deleting a notice drops only its unread badge and a deliberately read restored copy stays read',()=>{
  const ledger=new NoticeReading(memory()),old=notice('old'),fresh=notice('new');ledger.reconcile('device',[old]);expect(ledger.reconcile('device',[old,fresh])).toEqual(['new']);
  expect(ledger.reconcile('device',[old])).toEqual([]);ledger.markRead('device','restored-copy');expect(ledger.reconcile('device',[old,notice('restored-copy')])).toEqual([]);
 });
 test('the last username alone is not a logged-in scope; a retained valid session scopes offline local data',()=>{
  const storage=memory();storage.setItem('campus-inbox:account-username:v1','One');expect(initialAccountLocalScope(storage)).toBe('device');
  storage.setItem('campus-inbox:sync:v1:https://example.test/sync',JSON.stringify({version:1,key:'a'.repeat(43)}));expect(initialAccountLocalScope(storage)).toBe(accountLocalScope('one'));expect(accountLocalScope(' TWO ')).toBe('account:two');expect(accountLocalScope(null)).toBe('device');
 });
});
