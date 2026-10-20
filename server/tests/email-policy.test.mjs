import test from 'node:test';
import assert from 'node:assert/strict';
import {ALLOWED_EMAIL_DOMAINS,canonicalEmail,canonicalLoginEmail} from '../contracts/email-policy.mjs';

test('registration allowlist contains only reviewed providers and exact Chongqing University domains',()=>{
 assert.deepEqual(ALLOWED_EMAIL_DOMAINS,['qq.com','foxmail.com','163.com','126.com','yeah.net','139.com','189.cn','sina.com','sina.cn','sohu.com','gmail.com','cqu.edu.cn','stu.cqu.edu.cn','alu.cqu.edu.cn']);
 for(const domain of ALLOWED_EMAIL_DOMAINS){const address=`${domain==='qq.com'?'12345678':'student'}@${domain}`;assert.equal(canonicalEmail(address),address);}
 for(const domain of ['outlook.com','temp-mail.test','mail.cqu.edu.cn','another.edu.cn','qq.com.attacker.test','example.com'])assert.throws(()=>canonicalEmail(`student@${domain}`));
 assert.equal(canonicalEmail('student@qq.com'),'student@qq.com');assert.throws(()=>canonicalEmail('student+alias@163.com'));assert.throws(()=>canonicalEmail('a@b@qq.com'));
});
test('Gmail dot and plus variants share a canonical verification identity while old verified providers remain readable',()=>{
 assert.equal(canonicalEmail(' Stu.Dent+school@gmail.com '),'student@gmail.com');
 assert.equal(canonicalLoginEmail('Student@previous-provider.example'),'student@previous-provider.example');
 for(const value of ['x@@163.com','student\n@163.com','a..b@163.com','a@invalid','a@-invalid.example','a'.repeat(65)+'@163.com'])assert.throws(()=>canonicalLoginEmail(value));
});
