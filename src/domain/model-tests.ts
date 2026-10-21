import {createNotice} from './notice';
import {isExampleNotice} from './examples';
import {LOCAL_DEMO_ID_PREFIX} from './local-demo';
import type {Notice} from './types';

export const MODEL_TEST_MODE_KEY='campus-inbox:model-test-mode:v1';
export const MODEL_TEST_PREFIX=`${LOCAL_DEMO_ID_PREFIX}model-test-`;
export const isModelTestNotice=(notice:Pick<Notice,'id'>)=>notice.id.startsWith(MODEL_TEST_PREFIX);

/** This is a display choice: personal records and curated progress stay untouched. */
export function visibleModelLibrary(records:Notice[],testing:boolean){
 return records.filter(n=>testing?!isExampleNotice(n)||isModelTestNotice(n):!isModelTestNotice(n));
}
export function parseModelTestCatalog(value:unknown):Notice[]{
 if(!value||typeof value!=='object')throw new Error('测试结果格式不正确。');
 const data=value as {version?:unknown;cases?:unknown;manualWordEdits?:unknown;manualContentCorrections?:unknown};
 if(data.manualWordEdits!==false||data.manualContentCorrections!==false||data.version!==1||!Array.isArray(data.cases)||!data.cases.length||data.cases.length>30)throw new Error('测试结果格式不正确。');
 const ids=new Set<string>();
 return data.cases.map((value:unknown)=>{
  if(!value||typeof value!=='object')throw new Error('测试结果格式不正确。');
  const row=value as {id?:unknown;originalText?:unknown;analysis?:unknown;testedAt?:unknown};
  if(typeof row.id!=='string'||!/^[a-z0-9-]{1,64}$/.test(row.id)||ids.has(row.id)||typeof row.originalText!=='string'||typeof row.testedAt!=='string'||!Number.isFinite(Date.parse(row.testedAt)))throw new Error('测试结果格式不正确。');
  ids.add(row.id);
  return {...createNotice(row.analysis,row.originalText,row.testedAt),id:MODEL_TEST_PREFIX+row.id};
 });
}
