import {test,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {auditPublicExamples,auditModelTests} from '../scripts/verify-example-privacy.mjs';
test('human corrections require explicit review and exact published hash',async()=>{
 const data=JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8'));
 const prov=JSON.parse(await readFile(new URL('../public/examples-provenance.json',import.meta.url),'utf8'));
 expect(auditPublicExamples(data,prov)).toEqual([]);
 const p=structuredClone(prov),entry=p.results.find((x:any)=>x.exampleId==='example-reading-v211-5');delete entry.manualCorrectionScope;
 expect(auditPublicExamples(data,p).some((x:any)=>x.category==='missing_correction_review')).toBe(true);
 const changed=structuredClone(data);changed.notices.find((x:any)=>x.id==='example-reading-v211-5').summary='未审查变动';
 expect(auditPublicExamples(changed,prov).some((x:any)=>x.category==='reviewed_content_changed')).toBe(true);
 const raw=JSON.parse(await readFile(new URL('../public/model-tests.json',import.meta.url),'utf8'));raw.manualContentCorrections=true;
 expect(auditModelTests(raw).some((x:any)=>x.category==='missing_raw_result_review')).toBe(true);
});
