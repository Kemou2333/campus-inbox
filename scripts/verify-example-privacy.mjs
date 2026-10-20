import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export function canonicalExample(value){
  if(Array.isArray(value))return value.map(canonicalExample);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,entry])=>[key,canonicalExample(entry)]));
  return value;
}
export function publicExampleHash(value){return createHash('sha256').update(JSON.stringify(canonicalExample(value))).digest('hex');}

/** A publishing gate, not an automatic anonymizer. A human reviews names,
 * roles, links, indirect identification and meaning before signing hashes.
 * Errors contain paths/categories only; never print a sensitive value. */
export function auditPublicExamples(backup,provenance){
  const findings=[];
  const add=(path,category)=>findings.push({path,category});
  if(!Array.isArray(backup?.notices)||!Array.isArray(provenance?.results))return [{path:'catalog',category:'invalid_catalog'}];
  const review=provenance.privacyReview;
  if(review?.manualReview!==true||review.policyVersion!==2||!review.disclosure?.includes('脱敏')||review.contentCorrections!==false||review.publicBodyDisclosureRequired!==false)add('privacyReview','missing_manual_review');
  // Identity verification is a human attestation tied to the reviewed record
  // hash. A regex cannot distinguish an unfamiliar real name from a role.
  if(review?.manualIdentityReview!==true||!Array.isArray(review.identityCategoriesReviewed)||!['personal_names','student_identifiers'].every(category=>review.identityCategoriesReviewed.includes(category)))add('privacyReview','missing_identity_review');
  const approvedPseudonyms=Array.isArray(review?.approvedPseudonyms)&&review.approvedPseudonyms.length>0&&review.approvedPseudonyms.length<=32&&review.approvedPseudonyms.every(name=>typeof name==='string'&&/^[\u4e00-\u9fff]{2,4}$/.test(name))?new Set(review.approvedPseudonyms):new Set();
  if(!approvedPseudonyms.size||approvedPseudonyms.size!==review?.approvedPseudonyms?.length)add('privacyReview','missing_pseudonym_review');
  const sources=new Map(provenance.results.map(result=>[result.exampleId,result]));
  if(sources.size!==provenance.results.length||sources.size!==backup.notices.length)add('results','provenance_count_mismatch');
  function scan(value,path){
    if(Array.isArray(value)){value.forEach((entry,index)=>scan(entry,`${path}[${index}]`));return;}
    if(value&&typeof value==='object'){Object.entries(value).forEach(([key,entry])=>scan(entry,`${path}.${key}`));return;}
    if(typeof value!=='string')return;
    const checks=[
      ['specific_link',/https?:\/\/[^\s]+/i],
      ['link_parameter',/(?:params|token|key|signature|code)=[a-z0-9_-]{8,}/i],
      ['phone',/(?<!\d)1[3-9]\d{9}(?!\d)/],
      ['email',/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i],
      ['identity_number',/(?<!\d)\d{17}[\dXx](?!\d)/],
      ['group_number',/(?:QQ|Q ?Q|群号|qq群|QQ群)[^\n]{0,25}\d{5,12}/i],
      ['student_identifier',/(?:学号|学生编号|学生证号|一卡通号|校园卡号|统一(?:身份)?认证号)\s*[：:=]?\s*[*_`]{0,2}\s*[A-Za-z]?\d[A-Za-z\d-]{5,23}\b/],
    ];
    for(const [category,pattern] of checks)if(pattern.test(value))add(path,category);
    // Approved fictional identities live in the signed human review rather
    // than repeated labels in every notice. Generic field requirements stay.
    const labelledName=/(?:姓名|联系人姓名|负责人姓名)\s*[：:]\s*[*_`]{0,2}\s*([\u4e00-\u9fff]{2,4})(?![\u4e00-\u9fff])/g;
    for(const match of value.matchAll(labelledName))if(!approvedPseudonyms.has(match[1]))add(path,'unreviewed_person_name');
  }
  backup.notices.forEach((notice,index)=>{
    const path=`notices[${index}]`,source=sources.get(notice.id);
    scan(notice,path);
    if(typeof notice.originalText!=='string'||!notice.originalText.trim())add(`${path}.originalText`,'missing_original');
    if(notice.originalText?.startsWith('【脱敏示例】'))add(`${path}.originalText`,'redundant_body_disclosure');
    if(source?.manualPrivacyEdits!==true||source.manualWordEdits!==true||source.manualContentCorrections!==false)add(path,'undisclosed_privacy_edits');
    if(source?.manualIdentityReview!==true)add(path,'missing_record_identity_review');
    if(!source||source.publishedOriginalSha256!==createHash('sha256').update(notice.originalText??'').digest('hex')||source.publishedRecordSha256!==publicExampleHash(notice))add(path,'reviewed_content_changed');
  });
  return findings;
}

async function main(){
  const publicRoot=new URL('../public/',import.meta.url);
  const backup=JSON.parse(await readFile(new URL('examples.json',publicRoot),'utf8'));
  const provenance=JSON.parse(await readFile(new URL('examples-provenance.json',publicRoot),'utf8'));
  const findings=auditPublicExamples(backup,provenance);
  const demo=JSON.parse(await readFile(new URL('../src/features/onboarding/demo-notice.json',import.meta.url),'utf8'));
  const catalogNotice=backup.notices.find(notice=>notice.id===demo?.notice?.id);
  if(!catalogNotice||publicExampleHash(catalogNotice)!==publicExampleHash(demo.notice))findings.push({path:'onboarding.notice',category:'demo_must_match_reviewed_catalog'});
  findings.push(...auditPublicExamples({notices:[demo.notice]},{privacyReview:provenance.privacyReview,results:[demo.provenance]}).map(finding=>({...finding,path:'onboarding.'+finding.path})));
  const guestDemos=JSON.parse(await readFile(new URL('../src/features/onboarding/guest-demo-notices.json',import.meta.url),'utf8'));
  for(const [index,guestDemo] of guestDemos.entries()){
    const catalogNotice=backup.notices.find(notice=>notice.id===guestDemo?.notice?.id);
    if(!catalogNotice||publicExampleHash(catalogNotice)!==publicExampleHash(guestDemo.notice))findings.push({path:`guestDemos[${index}].notice`,category:'demo_must_match_reviewed_catalog'});
    findings.push(...auditPublicExamples({notices:[guestDemo.notice]},{privacyReview:provenance.privacyReview,results:[guestDemo.provenance]}).map(finding=>({...finding,path:`guestDemos[${index}].`+finding.path})));
  }
  for(const name of ['examples-legacy.json','examples-legacy-2.4.json']){
    const registry=JSON.parse(await readFile(new URL(name,publicRoot),'utf8'));
    if(!Array.isArray(registry)||registry.some(entry=>!entry||Object.keys(entry).sort().join(',')!=='fingerprint,id'||typeof entry.id!=='string'||!/^example-(?:reading|v1)-[a-z0-9-]+$/.test(entry.id)||!/^[a-f0-9]{64}$/.test(entry.fingerprint)))findings.push({path:name,category:'legacy_must_be_fingerprints_only'});
  }
  if(findings.length){console.error(JSON.stringify({ok:false,findings}));process.exitCode=1;}
  else console.log(JSON.stringify({ok:true,reviewedNotices:backup.notices.length,policyVersion:provenance.privacyReview.policyVersion}));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])await main();
