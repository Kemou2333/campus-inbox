import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {expect,test} from 'vitest';
import {auditPublicExamples,auditPublicExampleText,publicExampleHash} from '../scripts/verify-example-privacy.mjs';

async function fixture(){
  return {
    backup:JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8')),
    provenance:JSON.parse(await readFile(new URL('../public/examples-provenance.json',import.meta.url),'utf8')),
  };
}
function resign(backup:ReturnType<typeof JSON.parse>,provenance:ReturnType<typeof JSON.parse>){
  const notice=backup.notices[0],source=provenance.results.find((entry:{exampleId:string})=>entry.exampleId===notice.id);
  source.publishedOriginalSha256=createHash('sha256').update(notice.originalText).digest('hex');
  source.publishedRecordSha256=publicExampleHash(notice);
}

test('student identifiers remain blocked after hashes are re-signed, including Markdown and letter prefixes',async()=>{
  for(const text of ['学号：**S00000000**','一卡通号：00000000','学生证号 A00000000','统一身份认证号：00000000']){
    const {backup,provenance}=await fixture();backup.notices[0].tasks[0].details.push(text);resign(backup,provenance);
    const findings=auditPublicExamples(backup,provenance);
    expect(findings.some(entry=>entry.category==='student_identifier')).toBe(true);
    expect(findings.some(entry=>entry.category==='reviewed_content_changed')).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(text);
  }
});

test('explicit names require a reviewed pseudonym without in-body labels while field requirements are retained',async()=>{
  const {backup,provenance}=await fixture();
  backup.notices[0].tasks[0].details.push('姓名：示例甲');resign(backup,provenance);
  expect(auditPublicExamples(backup,provenance).some(entry=>entry.category==='unreviewed_person_name')).toBe(true);
  backup.notices[0].tasks[0].details[backup.notices[0].tasks[0].details.length-1]='姓名：示例甲（化名）';resign(backup,provenance);
  expect(auditPublicExamples(backup,provenance).some(entry=>entry.category==='unreviewed_person_name')).toBe(true);
  backup.notices[0].tasks[0].details.pop();
  backup.notices[0].tasks[0].details.push('姓名：示例甲','填写姓名、学号和教学班号');resign(backup,provenance);
  provenance.privacyReview.approvedPseudonyms.push('示例甲');
  expect(auditPublicExamples(backup,provenance)).toEqual([]);
});

test('removing repeated body declarations still requires a reviewed pseudonym list',async()=>{
  const {backup,provenance}=await fixture();
  expect(backup.notices.every((notice:{originalText:string})=>!notice.originalText.startsWith('【脱敏示例】'))).toBe(true);
  expect(auditPublicExamples(backup,provenance)).toEqual([]);
  delete provenance.privacyReview.approvedPseudonyms;
  expect(auditPublicExamples(backup,provenance).some(entry=>entry.category==='missing_pseudonym_review')).toBe(true);
});

test('a catalog and each changed record need human identity review in addition to privacy hashes',async()=>{
  const {backup,provenance}=await fixture();delete provenance.privacyReview.manualIdentityReview;
  expect(auditPublicExamples(backup,provenance).some(entry=>entry.category==='missing_identity_review')).toBe(true);
  provenance.privacyReview.manualIdentityReview=true;delete provenance.results[0].manualIdentityReview;
  expect(auditPublicExamples(backup,provenance).some(entry=>entry.category==='missing_record_identity_review')).toBe(true);
});

test('natural fictional contacts and reserved paths pass while private and lookalike links fail closed',()=>{
  for(const text of ['QQ群：1234XXXX','李老师：138XXXX1234','课程：www.example.com/courses/math-a；另一入口：example.com/courses/math-b。'])expect(auditPublicExampleText(text,'reviewed')).toEqual([]);
  for(const text of ['www.private.invalid/form','private.invalid/form','www.example.com.private.invalid/form','example.com@private.invalid','example.com/forms/signup?token=private-value','https://private.invalid/form']){
    const findings=auditPublicExampleText(text,'reviewed');
    expect(findings.some(entry=>entry.category==='specific_link'||entry.category==='email')).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(text);
  }
  for(const text of ['QQ群：[群号]','表格：[报名入口]','[平台入口 A]','[通知入口]','[链接已脱敏]'])expect(auditPublicExampleText(text,'reviewed').some(entry=>entry.category==='unnatural_privacy_placeholder')).toBe(true);
});
