import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {modelPayload} from '../analyze.mjs';

test('published first responses match their final actual input-specific production prompts',async()=>{
 const dataset=JSON.parse(await readFile(new URL('../../public/model-tests.json',import.meta.url),'utf8'));
 assert.equal(dataset.manualWordEdits,false);assert.equal(dataset.manualContentCorrections,false);assert(dataset.cases.length>0);
 for(const row of dataset.cases){
  const payload=modelPayload({sources:[{text:row.originalText}]},{thinkingMode:'low'});
  assert.equal(createHash('sha256').update(payload.messages[0].content).digest('hex'),row.promptSha256,row.id);
 }
});
