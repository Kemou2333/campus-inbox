import {expect,test} from 'vitest';
import {auditPublicExampleText} from '../scripts/verify-example-privacy.mjs';

test('reviewed reserved-domain paths stay recognizable inside Markdown presentation',()=>{
 for(const value of ['**www.example.com/forms/basketball-signup**','`www.example.com/forms/basketball-signup`','入口：**www.example.com/forms/basketball-signup**。'])expect(auditPublicExampleText(value,'synthetic')).toEqual([]);
});
test('Markdown does not relax real-domain, hostname-suffix or query/fragment rejection',()=>{
 for(const value of ['**www.private-campus.org/forms/signup**','`www.example.com.evil.test/forms/signup`','**www.example.com/forms/signup?x=1**','`www.example.com/forms/signup#private`','**www.example.com:8443/forms/signup**','**https://www.example.com/forms/signup**'])expect(auditPublicExampleText(value,'synthetic').some(finding=>finding.category==='specific_link')).toBe(true);
});
