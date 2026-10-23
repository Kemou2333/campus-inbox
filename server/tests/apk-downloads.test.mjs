import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat,symlink,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setImmediate as immediate} from 'node:timers/promises';
import {createAPKDownloads} from '../apk-downloads.mjs';
import {createImageCaptcha} from '../image-captcha.mjs';

// A local HTTP listener, temporary APK bytes and a deterministic raster only.
// The x-test-verified-ip header is a fixture adapter; production must never trust it.
const secret='test-apk-download-signing-secret-at-least-twenty',origin='https://123.57.30.129',hour=3_600_000;
const version='2.27.1',filename='campus-inbox-'+version+'.apk',path='/downloads/android-v'+version+'/'+filename;
const github='https://github.com/Kemou2333/campus-inbox/releases/download/android-v'+version+'/'+filename;
const initial=Date.parse('2026-10-23T04:00:00Z'),hash=value=>createHash('sha256').update(value).digest('hex');
const gate=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function fixture(extra={}){
  const directory=await mkdtemp(join(tmpdir(),'campus-apk-downloads-')),assets=join(directory,'assets');await mkdir(assets);
  const bytes=Buffer.alloc(extra.size||4096,42),release={version,filename,sha256:hash(bytes),size:bytes.length,github},releaseManifestFile=join(directory,'releases.json'),stateFile=join(directory,'usage.json');
  let time=initial,clock=0,handler,server;const sleeps=[];
  await writeFile(join(assets,filename),bytes);await writeFile(releaseManifestFile,JSON.stringify({schemaVersion:1,releases:[release]}));
  if(extra.state)await writeFile(stateFile,typeof extra.state==='string'?extra.state:JSON.stringify(extra.state));
  const config={directory:assets,releaseManifestFile,stateFile,signingSecret:secret,publicOrigin:origin};
  const options={now:()=>time,monotonicNow:()=>clock,imageCaptcha:id=>createImageCaptcha(id,()=>2468),sleep:async(ms,signal)=>{if(signal.aborted)throw new Error('closed');sleeps.push(ms);clock+=ms;await immediate();if(signal.aborted)throw new Error('closed');},...extra.options};
  const start=async()=>{handler=await createAPKDownloads(config,options);server=http.createServer((req,res)=>{void handler(req,res,req.headers['x-test-verified-ip']||'203.0.113.7');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));};
  await start();
  const request=(url=path,{method='GET',body,ip='203.0.113.7',headers={}}={})=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:url,method,headers:{'X-Test-Verified-IP':ip,...headers,...(body===undefined?{}:{'Content-Length':Buffer.byteLength(body)})}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.once('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks),text:Buffer.concat(chunks).toString('utf8')}));res.once('error',reject);
    });req.once('error',reject);req.end(body);
  });
  const challenge=async(ip='203.0.113.7',url=path)=>{const page=await request(url,{ip});assert.equal(page.status,200,page.text);const token=page.text.match(/name="challenge" value="([^"]+)"/)?.[1];assert(token);return {token,page};};
  const verify=async(token,ip='203.0.113.7',answer='2468',url=path)=>request(url,{ip,method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({challenge:token,answer}).toString()});
  const ticket=async(ip='203.0.113.7')=>{const proof=await challenge(ip),response=await verify(proof.token,ip);assert.equal(response.status,303,response.text);assert(response.headers.location.startsWith(origin+path+'?ticket='));return response.headers.location.slice(origin.length);};
  const restart=async()=>{await handler.close();await new Promise(resolve=>server.close(resolve));await start();};
  return {directory,assets,bytes,release,stateFile,releaseManifestFile,request,challenge,verify,ticket,restart,config,options,sleeps,
    advance:ms=>{time+=ms;},setTime:value=>{time=value;},getTime:()=>time,state:async()=>JSON.parse(await readFile(stateFile,'utf8')),
    port:()=>server.address().port,close:async()=>{await handler.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}};
}

test('captcha form, bound single-use ticket and HEAD deliver exact approved bytes without answer or secret disclosure',async t=>{
  const s=await fixture();t.after(s.close);
  const {token,page}=await s.challenge();assert(page.text.includes('GitHub 备用下载'));assert(page.text.includes(github));assert(!page.text.includes('value="2468"'));assert(!page.text.includes(secret));assert(!page.text.includes('203.0.113.7'));
  assert.match(page.headers['content-security-policy'],/default-src 'none'/);assert.match(page.headers['content-security-policy'],/frame-ancestors 'none'/);assert.equal(page.headers['x-frame-options'],'DENY');assert.equal(page.headers['referrer-policy'],'no-referrer');assert.equal(page.headers['cache-control'],'no-store, private');
  assert.equal((await s.request(path,{method:'HEAD'})).status,200);assert.equal((await s.state()).reservedBytes,0);
  const response=await s.verify(token);assert.equal(response.status,303);assert.equal(response.bytes.length,0);const url=response.headers.location.slice(origin.length);
  const head=await s.request(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.bytes.length,0);assert.equal(Number(head.headers['content-length']),s.bytes.length);assert.equal((await s.state()).reservedBytes,0);
  const downloaded=await s.request(url);assert.equal(downloaded.status,200);assert.deepEqual(downloaded.bytes,s.bytes);assert.equal(downloaded.headers['content-type'],'application/vnd.android.package-archive');assert.equal(downloaded.headers['accept-ranges'],'none');assert.equal(downloaded.headers['content-disposition'],'attachment; filename="'+filename+'"');
  const state=await s.state();assert.equal(state.reservedBytes,s.bytes.length);assert.equal(Object.values(state.downloads)[0].length,1);const raw=JSON.stringify(state);for(const value of [token,'2468',secret,'203.0.113.7',filename])assert(!raw.includes(value));assert.equal((await stat(s.stateFile)).mode&0o777,0o600);
  assert.equal((await s.request(url)).status,403);assert.equal((await s.request(url,{method:'HEAD'})).status,403);assert.equal((await s.state()).reservedBytes,s.bytes.length);
});

test('five guesses, 30-second refresh, hourly captcha issuance, expiry, origin and IP binding reject bypasses',async t=>{
  const s=await fixture();t.after(s.close);const {token}=await s.challenge();
  assert.equal((await s.challenge()).token,token,'reload within cooldown reuses the image');
  assert.equal((await s.verify(token,'203.0.113.8')).status,400);
  for(const headers of [{Origin:'https://untrusted.example', 'Content-Type':'application/x-www-form-urlencoded'},{'Content-Type':'application/x-www-form-urlencoded'},{Origin:origin,'Sec-Fetch-Site':'cross-site','Content-Type':'application/x-www-form-urlencoded'}])assert.equal((await s.request(path,{method:'POST',headers,body:new URLSearchParams({challenge:token,answer:'2468'}).toString()})).status,403);
  for(const answer of ['','12','12a4','9999','12345'])assert.equal((await s.verify(token,undefined,answer)).status,400);
  assert.equal((await s.verify(token)).status,400);const cooldown=await s.request();assert.equal(cooldown.status,429);assert.equal(cooldown.headers['retry-after'],'30');
  s.advance(29_999);assert.equal((await s.request()).headers['retry-after'],'1');s.advance(1);const replacement=await s.challenge();assert.notEqual(replacement.token,token);
  s.advance(300_000);assert.equal((await s.verify(replacement.token)).status,400);assert.equal((await s.state()).reservedBytes,0);
  const fresh=await s.challenge();const accepted=await s.verify(fresh.token);assert.equal(accepted.status,303);const url=accepted.headers.location.slice(origin.length);
  assert.equal((await s.request(url,{ip:'203.0.113.8'})).status,403);s.advance(120_000);assert.equal((await s.request(url)).status,403);
  // Issuance is independently bounded and persists through restart.
  const q=await fixture();t.after(q.close);for(let i=0;i<20;i++){await q.challenge();q.advance(30_000);}assert.equal((await q.request()).status,429);await q.restart();assert.equal((await q.request()).status,429);assert.equal((await q.state()).reservedBytes,0);
});

test('five downloads per rolling hour survive restart and expire at the exact one-hour boundary',async t=>{
  const s=await fixture();t.after(s.close);
  for(let i=0;i<5;i++){const url=await s.ticket();assert.equal((await s.request(url)).status,200);if(i<4)s.advance(30_000);}
  s.advance(30_000);const url=await s.ticket(),blocked=await s.request(url);assert.equal(blocked.status,429);assert.equal(blocked.headers['retry-after'],'3450');assert.equal((await s.state()).reservedBytes,s.bytes.length*5);
  await s.restart();s.advance(30_000);const restartedURL=await s.ticket();assert.equal((await s.request(restartedURL)).status,429);
  s.setTime(initial+hour-1);const before=await s.ticket();assert.equal((await s.request(before,{method:'HEAD'})).status,200);
  s.advance(1);assert.equal((await s.request(before)).status,200,'first paid timestamp expires at precisely one hour');assert.equal((await s.state()).reservedBytes,s.bytes.length*6);
});

test('Shanghai day 200MB budget is pre-reserved, survives restart and midnight retains the independent IP window',async t=>{
  const state={version:1,day:'2026-10-23',reservedBytes:200_000_000-4096,downloads:{},captchaRequests:{}};
  const s=await fixture({state});t.after(s.close);s.setTime(Date.parse('2026-10-23T15:59:59Z'));
  const url=await s.ticket(),last=await s.request(url);assert.equal(last.status,200);assert.equal((await s.state()).reservedBytes,200_000_000);
  const other=await s.ticket('203.0.113.8'),blocked=await s.request(other,{ip:'203.0.113.8'});assert.equal(blocked.status,429);assert.equal(blocked.headers['retry-after'],'1');
  await s.restart();const restarted=await s.ticket('203.0.113.9');assert.equal((await s.request(restarted,{ip:'203.0.113.9'})).status,429);
  s.advance(1000);const renewed=await s.ticket('203.0.113.10');assert.equal((await s.request(renewed,{ip:'203.0.113.10'})).status,200);const after=await s.state();assert.equal(after.day,'2026-10-24');assert.equal(after.reservedBytes,4096);assert.equal(Object.keys(after.downloads).length,2);
});

test('rate pacing streams bounded chunks and keeps the IP slot until response finishes; cancellations retain the full reservation',async t=>{
  const blocked=gate(),started=gate();let first=true;const waits=[];let clock=0;
  const s=await fixture({size:196_608,options:{monotonicNow:()=>clock,sleep:async(ms,signal)=>{waits.push(ms);if(first){first=false;started.resolve();await blocked.promise;}if(signal.aborted)throw new Error('closed');clock+=ms;}}});t.after(s.close);
  const url=await s.ticket(),running=s.request(url);await started.promise;
  assert.equal((await s.state()).reservedBytes,s.bytes.length,'full file is durable before the first chunk');
  assert.equal((await s.request(url)).status,403,'capability is already consumed');s.advance(30_000);const second=await s.ticket();assert.equal((await s.request(second)).status,429,'same IP cannot overlap');
  blocked.resolve();assert.deepEqual((await running).bytes,s.bytes);assert.equal(waits.length,3);assert(waits.every(ms=>Math.abs(ms-32.768)<0.0001));assert(Math.abs(waits.reduce((a,b)=>a+b,0)-s.bytes.length/2_000_000*1000)<0.0001);
  // A stopped connection cannot obtain a partial-refund budget or an extra hourly slot.
  const waiting=gate(),begun=gate();const canceled=await fixture({size:131072,options:{sleep:async(_ms,signal)=>{begun.resolve();await waiting.promise;if(signal.aborted)throw new Error('closed');}}});t.after(canceled.close);
  const cancelURL=await canceled.ticket();const request=http.get({hostname:'127.0.0.1',port:canceled.port(),path:cancelURL,headers:{'X-Test-Verified-IP':'203.0.113.7'}});request.on('error',()=>{});await begun.promise;request.destroy();await immediate();waiting.resolve();await immediate();const saved=await canceled.state();assert.equal(saved.reservedBytes,canceled.bytes.length);assert.equal(Object.values(saved.downloads)[0].length,1);
});

test('global eight active streams and per-IP guards prevent concurrent overspend',async t=>{
  const wait=gate(),eight=gate();let started=0;
  const s=await fixture({options:{sleep:async(_ms,signal)=>{started++;if(started===8)eight.resolve();await wait.promise;if(signal.aborted)throw new Error('closed');}}});t.after(s.close);
  const urls=[];for(let i=0;i<9;i++)urls.push(await s.ticket('203.0.113.'+(20+i)));
  const running=urls.slice(0,8).map((url,i)=>s.request(url,{ip:'203.0.113.'+(20+i)}));await eight.promise;
  const rejected=await s.request(urls[8],{ip:'203.0.113.28'});assert.equal(rejected.status,503);assert.equal((await s.state()).reservedBytes,s.bytes.length*8);
  wait.resolve();assert((await Promise.all(running)).every(response=>response.status===200));assert.equal((await s.request(urls[8],{ip:'203.0.113.28'})).status,200,'capacity rejection did not consume the ticket');
});

test('path traversal, arbitrary assets, forged IP headers, Range and malformed forms cannot bypass verification',async t=>{
  const s=await fixture();t.after(s.close);
  for(const url of ['/downloads/../../usage.json','/downloads/android-v2.27.1/../../usage.json','/downloads/android-v2.27.1/%63ampus-inbox-2.27.1.apk',path+'?ticket=x',path+'?unknown=1',path+'?ticket=x&ticket=y','/downloads/android-v2.27.2/campus-inbox-2.27.2.apk'])assert.notEqual((await s.request(url)).status,200);
  const ticket=await s.ticket();assert.equal((await s.request(ticket,{headers:{Range:'bytes=0-10'}})).status,416);
  const foreign=await s.request(ticket,{ip:'203.0.113.8',headers:{'X-Real-IP':'203.0.113.7','X-Forwarded-For':'203.0.113.7'}});assert.equal(foreign.status,403);assert.equal((await s.request(ticket)).status,200);
  for(const value of ['not-an-ip','127.0.0.1,8.8.8.8','localhost'])assert.equal((await s.request(path,{ip:value})).status,400);
  const proof=await s.challenge('203.0.113.9');
  for(const [type,body,status] of [['application/json','{}',415],['application/x-www-form-urlencoded','challenge='+proof.token+'&answer=2468&answer=2468',400],['application/x-www-form-urlencoded','challenge=%GG&answer=2468',400],['application/x-www-form-urlencoded','x'.repeat(1025),413]])assert.equal((await s.request(path,{ip:'203.0.113.9',method:'POST',headers:{Origin:origin,'Content-Type':type},body})).status,status);
  assert.equal((await s.request(path,{method:'DELETE'})).status,405);assert.equal((await s.state()).reservedBytes,s.bytes.length);
});

test('missing or malformed hot manifest, symlink assets, size/hash mismatch and corrupt state fail only downloads closed',async t=>{
  const s=await fixture();t.after(s.close);
  await rename(s.releaseManifestFile,s.releaseManifestFile+'.old');assert.equal((await s.request()).status,503);
  await writeFile(s.releaseManifestFile,JSON.stringify({schemaVersion:1,releases:[{...s.release,github:'https://attacker.example/'+filename}]}));assert.equal((await s.request()).status,503);
  await writeFile(s.releaseManifestFile,JSON.stringify({schemaVersion:1,releases:[s.release]}));const proof=await s.ticket();
  await rename(join(s.assets,filename),join(s.assets,'original.apk'));await symlink(join(s.assets,'original.apk'),join(s.assets,filename));assert.equal((await s.request(proof)).status,503);
  const bad=await fixture();t.after(bad.close);const url=await bad.ticket();await writeFile(join(bad.assets,filename),Buffer.alloc(bad.bytes.length,99));assert.equal((await bad.request(url)).status,503);assert.equal((await bad.state()).reservedBytes,bad.bytes.length,'uncertain failed transfer keeps its conservative reservation');
  const corrupt=await fixture({state:'{"version":1,"reservedBytes":-1}'});t.after(corrupt.close);const response=await corrupt.request();assert.equal(response.status,503);assert(response.text.includes(github));
});


test('simultaneous different IPs cannot spend the final shared daily allowance twice',async t=>{
  const s=await fixture({state:{version:1,day:'2026-10-23',reservedBytes:200_000_000-4096,downloads:{},captchaRequests:{}}});t.after(s.close);
  const a=await s.ticket('203.0.113.70'),b=await s.ticket('203.0.113.71');
  const responses=await Promise.all([s.request(a,{ip:'203.0.113.70'}),s.request(b,{ip:'203.0.113.71'})]);assert.deepEqual(responses.map(response=>response.status).sort(),[200,429]);
  const state=await s.state();assert.equal(state.reservedBytes,200_000_000);assert.equal(Object.keys(state.downloads).length,1);
});

test('an atomically replaced approved release index hot-loads a new version without a backend restart',async t=>{
  const s=await fixture();t.after(s.close);const nextVersion='2.27.2',nextFilename='campus-inbox-'+nextVersion+'.apk',nextPath='/downloads/android-v'+nextVersion+'/'+nextFilename;
  const bytes=Buffer.alloc(1024,77),next={version:nextVersion,filename:nextFilename,sha256:hash(bytes),size:bytes.length,github:'https://github.com/Kemou2333/campus-inbox/releases/download/android-v'+nextVersion+'/'+nextFilename};
  assert.equal((await s.request(nextPath)).status,404);await writeFile(join(s.assets,nextFilename),bytes);await writeFile(s.releaseManifestFile+'.next',JSON.stringify({schemaVersion:1,releases:[s.release,next]}));await rename(s.releaseManifestFile+'.next',s.releaseManifestFile);
  const proof=await s.challenge('203.0.113.80',nextPath),verified=await s.verify(proof.token,'203.0.113.80','2468',nextPath);assert.equal(verified.status,303);
  const result=await s.request(verified.headers.location.slice(origin.length),{ip:'203.0.113.80'});assert.equal(result.status,200);assert.deepEqual(result.bytes,bytes);
});
