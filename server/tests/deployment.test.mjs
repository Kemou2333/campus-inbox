import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const releaseFiles=['server/index.mjs','server/analyze.mjs','server/service.mjs','server/image-captcha.mjs','server/auth.mjs','server/sync.mjs','server/email-auth.mjs','server/mail-sender.mjs','server/manage-invites.mjs','worker/prompt.mjs','server/contracts/data.js','server/contracts/time.js','server/contracts/email-policy.mjs','server/vendor/nodemailer-10.0.16.mjs','server/vendor/NODEMAILER-LICENSE','server/vendor/NODEMAILER-SOURCE.md'];
test('CI release and restricted installer agree on all runtime and vendor files',async()=>{
  const project=new URL('../../',import.meta.url);
  const [workflow,installer]=await Promise.all([readFile(new URL('.github/workflows/backend.yml',project),'utf8'),readFile(new URL('server/install-release.py',project),'utf8')]);
  const packaged=workflow.match(/tar -czf backend-release\.tar\.gz ([^\n]+)/)?.[1].trim().split(/\s+/);
  const allowed=[...(installer.match(/^allowed=\{([^\n]+)\}/m)?.[1]||'').matchAll(/'([^']+)'/g)].map(match=>match[1]);
  assert.deepEqual(packaged?.sort(),[...releaseFiles].sort());assert.deepEqual(allowed.sort(),[...releaseFiles].sort());
});

// Reproduce the limited production archive without a frontend build, a package
// manifest, node_modules, model requests, or real server credentials.
test('the complete production release boots without dist or frontend dependencies',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'campus-release-'));
  const files=releaseFiles;
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
      env:{PORT:String(port),BIND_HOST:'127.0.0.1',DEEPSEEK_API_KEY:'test-only-key',CAMPUS_ACCESS_TOKEN:'test-only-signing-secret-at-least-twenty-characters',ALLOWED_ORIGINS:'https://kemou2333.github.io',MAIL_LOGIN_ENABLED:'false',USAGE_STATE_FILE:join(folder,'usage.json'),SYNC_STATE_FILE:join(folder,'sync.sqlite'),AUTH_STATE_FILE:join(folder,'auth.sqlite')},
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
    const options=await fetch('http://127.0.0.1:'+port+'/auth/options',{method:'POST',headers:{Origin:'https://kemou2333.github.io','Content-Type':'application/json'},body:'{}'});
    assert.equal(options.status,200);const availability=await options.json();assert.equal(availability.emailEnabled,false);assert.equal(availability.inviteEnabled,true);
    // A forwarded list is not a real address; different malformed headers must
    // not turn one local peer into unlimited separate registration buckets.
    for(let i=0;i<6;i++){
      const attempt=await fetch('http://127.0.0.1:'+port+'/auth/register',{method:'POST',
        headers:{Origin:'https://kemou2333.github.io','Content-Type':'application/json','X-Real-IP':`198.51.100.${i},203.0.113.1`},
        body:JSON.stringify({username:'proxy-test',password:'test-only-password',invite:'ABCDEFGH'})});
      assert.equal(attempt.status,i<5?400:429);
    }
    const valid=await fetch('http://127.0.0.1:'+port+'/auth/register',{method:'POST',headers:{Origin:'https://kemou2333.github.io','Content-Type':'application/json','X-Real-IP':'198.51.100.99'},body:JSON.stringify({username:'proxy-test',password:'test-only-password',invite:'ABCDEFGH'})});
    assert.equal(valid.status,400);
  }finally{
    if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
    await rm(folder,{recursive:true,force:true});
  }
});
