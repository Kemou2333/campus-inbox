import {describe,expect,it} from 'vitest';
import {friendlyErrorMessage} from './error-message';

describe('plain and private error messages',()=>{
 it('keeps concise Chinese domain instructions including important limits',()=>{
  for(const value of ['密码需为 8–128 个字符。','验证码已过期，请重新获取。','本次通知合计不能超过 4,000 字。','同一请求不会再次收费。','账号已创建，请稍后登录。'])expect(friendlyErrorMessage(new Error(value))).toBe(value);
 });
 it('turns technical network, quota and cancellation failures into next steps without claiming cloud storage',()=>{
  expect(friendlyErrorMessage(new TypeError('Failed to fetch https://private.example.test/key'))).toMatch(/检查网络/);
  expect(friendlyErrorMessage(new DOMException('private-storage-key','QuotaExceededError'))).toMatch(/先导出备份/);
  expect(friendlyErrorMessage(new DOMException('aborted','AbortError'))).toMatch(/可能仍在进行/);
  expect(friendlyErrorMessage(Object.assign(new Error('private-session-key'),{code:'AUTH_REQUIRED'}))).toMatch(/重新登录/);
  expect(friendlyErrorMessage(new Error('NetworkError when attempting to fetch resource.'))).toMatch(/检查网络/);
 });
 it('never forwards URLs, SQL, stack frames, email, keys or arbitrary thrown objects',()=>{
  for(const value of [new Error('请求失败 https://private.example.test/?token=private-value'),new Error('保存失败：SQLITE_ERROR SELECT * FROM secrets'),new Error('错误\n at secretFile:10'),new Error('失败 Bearer '+ 'X'.repeat(43)),new Error('失败：联系 private-user@example.test'),new Error('失败 /Users/private-user/secret.env'),new Error('api_key=private-test-value 操作失败'),{message:'私人对象原文'},undefined,42]){
   const output=friendlyErrorMessage(value);expect(output).toMatch(/请|设置/);expect(output).not.toMatch(/private|SQL|Bearer|secret|https:|secretFile|XXXX|Users|api_key/);
  }
 });
});
