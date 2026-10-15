import {describe,expect,it} from 'vitest';
import {parseNotice} from '../../domain/notice';
import examples from '../../../public/examples.json';
import {ADMIN_ORIGIN,parsePreviewData,trustedPreviewMessage} from './preview-protocol';

describe('只读后台预览消息边界',()=>{
 const notice=parseNotice(examples.notices[0]),message={type:'campus-admin-preview',notice};
 it('只接受指定域的真实父窗口',()=>{
  const parent={} as Window;
  expect(trustedPreviewMessage({origin:ADMIN_ORIGIN,source:parent},parent)).toBe(true);
  expect(trustedPreviewMessage({origin:'https://example.com',source:parent},parent)).toBe(false);
  expect(trustedPreviewMessage({origin:ADMIN_ORIGIN,source:{} as Window},parent)).toBe(false);
  expect(trustedPreviewMessage({origin:ADMIN_ORIGIN,source:null},null)).toBe(false);
 });
 it('单条与批量都经过领域验证且不修改输入',()=>{
  const before=structuredClone(message);expect(parsePreviewData(message)).toEqual([notice]);expect(message).toEqual(before);
  expect(parsePreviewData({type:message.type,records:[notice]})).toEqual([notice]);
  expect(parsePreviewData({type:message.type,records:[]})).toEqual([]);
 });
 it('忽略未知消息；数据消息不接受 token 等多余字段',()=>{
  expect(parsePreviewData({type:'else'})).toBeNull();expect(parsePreviewData(null)).toBeNull();
  expect(()=>parsePreviewData({...message,token:'synthetic-secret'})).toThrow('不支持');
 });
 it('拒绝不完整数据、重复编号与超大批量',()=>{
  expect(()=>parsePreviewData({type:message.type})).toThrow();
  expect(()=>parsePreviewData({...message,records:[]})).toThrow();
  expect(()=>parsePreviewData({type:message.type,notice:{title:'broken'}})).toThrow();
  expect(()=>parsePreviewData({type:message.type,records:[notice,notice]})).toThrow('重复');
  expect(()=>parsePreviewData({type:message.type,records:Array(21).fill(notice)})).toThrow('20');
 });
});
