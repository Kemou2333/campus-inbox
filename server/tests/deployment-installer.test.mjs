import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

test('restricted installer rejects unexpected files and rolls back restart or health failures on a fake host',async()=>{
  await promisify(execFile)('python3',[fileURLToPath(new URL('./install-release.test.py',import.meta.url))],{timeout:15000});
});
