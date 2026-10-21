import {expect,test} from 'vitest';
import dataset from '../public/model-tests.json';
import catalog from '../public/examples.json';
import {parseBackup} from '../src/domain/notice';
import {parseModelTestCatalog,visibleModelLibrary,isModelTestNotice} from '../src/domain/model-tests';
import {isLocalDemoNotice} from '../src/domain/local-demo';
import {auditModelTests} from '../scripts/verify-example-privacy.mjs';

test('raw result preview hides curated samples without mutating personal records or progress',()=>{
 const samples=parseBackup(catalog),raw=parseModelTestCatalog(dataset);
 const personal={...samples[0],id:'personal-notice',completed:true,note:'我的笔记'};
 const edited={...samples[1],favorite:true,note:'示例笔记'};
 const all=[personal,edited,...raw];const before=JSON.stringify(all);
 expect(visibleModelLibrary(all,true)).toEqual([personal,...raw]);
 expect(visibleModelLibrary(all,false)).toEqual([personal,edited]);
 expect(JSON.stringify(all)).toBe(before);
 expect(raw.every(n=>isModelTestNotice(n)&&isLocalDemoNotice(n))).toBe(true);
});
test('published first responses retain exactly reviewed prose and reject tampered or polished data',()=>{
 const records=parseModelTestCatalog(dataset);
 expect(records).toHaveLength(7);expect(auditModelTests(dataset)).toEqual([]);
 expect(records[0].summary).toBe(dataset.cases[0].analysis.summary);
 expect(()=>parseModelTestCatalog({...dataset,manualWordEdits:true})).toThrow();
 const altered=structuredClone(dataset);altered.cases[0].analysis.summary+=' changed';
 expect(auditModelTests(altered).some(n=>n.category==='reviewed_model_result_changed')).toBe(true);
 expect(()=>parseModelTestCatalog({...dataset,cases:[dataset.cases[0],dataset.cases[0]]})).toThrow();
});
