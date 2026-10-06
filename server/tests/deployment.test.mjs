import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

// Reproduce the limited production archive without a frontend build, a package
// manifest, node_modules, model requests, or real server credentials.
test('the complete production release boots without dist or frontend dependencies',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'campus-release-'));
  const files=['server/index.mjs','server/analyze.mjs','server/service.mjs','server/auth.mjs','server/sync.mjs','server/manage-invites.mjs','worker/prompt.mjs','server/contracts/data.js','server/contracts/time.js'];
  const project=new URL('../../',import.meta.url);
  let child;
  try{
    for(const file of files){
      await mkdir(join(folder,file.slice(0,file.lastIndexOf('/'))),{recursive:true});
      await copyFile(new URL(file,project),join(folder,file));
    }
    const reservation=createServer();
    reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
    const port=reservation.address().port;
    await new Promise(resolve=>reservation.close(resolve));
    child=spawn(process.execPath,[join(folder,'server/index.mjs')],{
      cwd:folder,
      env:{PORT:String(port),BIND_HOST:'127.0.0.1',DEEPSEEK_API_KEY:'test-only-key',CAMPUS_ACCESS_TOKEN:'test-only-signing-secret-at-least-twenty-characters',ALLOWED_ORIGINS:'https://kemou2333.github.io',USAGE_STATE_FILE:join(folder,'usage.json'),SYNC_STATE_FILE:join(folder,'sync.sqlite'),AUTH_STATE_FILE:join(folder,'auth.sqlite')},
      stdio:['ignore','pipe','pipe']
    });
    let output='',error='';
    child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Release did not become ready: '+error)),3000);
      child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Release exited: '+code+' '+error));});
      child.stdout.on('data',()=>{if(output.includes('backend ready')){clearTimeout(timeout);resolve();}});
    });
    const response=await fetch('http://127.0.0.1:'+port+'/health');
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'ok'});
  }finally{
    if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
    await rm(folder,{recursive:true,force:true});
  }
});
