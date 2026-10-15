import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {expect,test} from 'vitest';
import {auditPublicExamples,publicExampleHash} from '../scripts/verify-example-privacy.mjs';

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

test('explicit names require a local pseudonym marker while field requirements are retained',async()=>{
  const {backup,provenance}=await fixture();
  backup.notices[0].tasks[0].details.push('姓名：示例甲');resign(backup,provenance);
  expect(auditPublicExamples(backup,provenance).some(entry=>entry.category==='unmarked_person_name')).toBe(true);
  backup.notices[0].tasks[0].details.pop();
  backup.notices[0].tasks[0].details.push('姓名：示例甲（化名）','填写姓名、学号和教学班号');resign(backup,provenance);
  expect(auditPublicExamples(backup,provenance)).toEqual([]);
});

test('a catalog and each changed record need human identity review in addition to privacy hashes',async()=>{
  const {backup,provenance}=await fixture();delete provenance.privacyReview.manualIdentityReview;
  expect(auditPublicExamples(backup,provenance).some(entry=>entry.category==='missing_identity_review')).toBe(true);
  provenance.privacyReview.manualIdentityReview=true;delete provenance.results[0].manualIdentityReview;
  expect(auditPublicExamples(backup,provenance).some(entry=>entry.category==='missing_record_identity_review')).toBe(true);
});
