// Pure model checks executed as JS. This does not compile ArkUI or validate an SDK.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';

const source = await readFile(new URL('../entry/src/main/ets/model/Models.ets', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source, {mode: 'strip'});
const model = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const fixtures = JSON.parse(await readFile(new URL('../entry/src/main/resources/rawfile/demo-notices.json', import.meta.url), 'utf8'));
for(const entry of fixtures) assert.equal(model.validateRecord(entry.notice), entry.notice);
for(const bad of [null, {}, {...fixtures[0].notice, schemaVersion:4}, {...fixtures[0].notice, tasks:null}]) {
  assert.throws(()=>model.validateRecord(bad));
}
assert.equal(model.displayTime(null, '课程结束前'), '课程结束前');
assert.equal(model.displayTime(null, ''), '');
assert.equal(model.readable('完成 **5** 个任务'), '完成 5 个任务');
assert.equal(model.validID('../../private'), false);
assert.equal(model.emptyState().selectedDemo, -1);
assert.deepEqual(model.emptyState().deletedRows, []);
console.log('Pure native model checks passed; ArkTS/ArkUI compilation remains unverified.');
