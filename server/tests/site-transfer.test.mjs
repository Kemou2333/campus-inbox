import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSiteTransfer} from '../site-transfer.mjs';
const source='https://kemou2333.github.io',target='https://123.57.30.129';
test('opaque transfer is bounded, sealed, authenticated and deleted after import',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'campus-transfer-'));try{
  const handle=createSiteTransfer({directory,cleanupInterval:0});
  const request=(path,origin,body='{}',token,binary=false)=>handle(new Request('https://local/site-transfer'+path,{method:'POST',headers:{Origin:origin,'Content-Type':binary?'application/octet-stream':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body}),'127.0.0.1');
  assert.equal((await request('',target,JSON.stringify({parts:1,bytes:3}))).status,403);
  assert.equal((await request('',source,JSON.stringify({parts:1,bytes:129*1024*1024}))).status,413);
  const created=await (await request('',source,JSON.stringify({parts:1,bytes:3}))).json();assert.match(created.id,/^[a-f0-9]{32}$/);
  const path='/'+created.id,token=created.token;
  assert.equal((await request(path+'/manifest',target,'{}','x'.repeat(43))).status,400);
  assert.equal((await request(path+'/manifest',target,'{}',token)).status,409);
  assert.equal((await request(path+'/write/0',source,Buffer.alloc(30),token,true)).status,400);
  assert.equal((await request(path+'/write/0',source,Buffer.alloc(31,1),token,true)).status,200);
  assert.equal((await request(path+'/ready',source,'{}',token)).status,200);
  assert.equal((await request(path+'/write/0',source,Buffer.alloc(31),token,true)).status,409);
  assert.equal((await request(path+'/read/0',source,'{}',token)).status,403);
  assert.deepEqual(await (await request(path+'/manifest',target,'{}',token)).json(),{parts:1,bytes:3});
  assert.equal((await (await request(path+'/read/0',target,'{}',token)).arrayBuffer()).byteLength,31);
  assert.equal((await request(path+'/complete',target,'{}',token)).status,200);assert.deepEqual(await readdir(directory),[]);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('expired relay capabilities cannot be read and new admission cleans old ciphertext',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'campus-transfer-'));let time=0;try{
  const handle=createSiteTransfer({directory,now:()=>time,cleanupInterval:0});
  const request=(path,origin,body='{}',token)=>handle(new Request('https://local/site-transfer'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body}),'127.0.0.1');
  const x=await (await request('',source,'{"parts":1,"bytes":1}')).json();time=16*60_000;
  assert.equal((await request('/'+x.id+'/manifest',target,'{}',x.token)).status,400);
  await request('',source,'{"parts":1,"bytes":1}');assert.equal((await readdir(directory)).includes(x.id),false);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('admission limits body readers before buffering and stops one client reserving the whole relay',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'campus-transfer-'));const pending=[];
 try{
  const handle=createSiteTransfer({directory,cleanupInterval:0});
  for(let i=0;i<2;i++){
   let controller;const body=new ReadableStream({start(c){controller=c;}});
   const promise=handle(new Request('https://local/site-transfer',{method:'POST',duplex:'half',headers:{Origin:source,'Content-Type':'application/json'},body}),'same-client');pending.push({controller,promise});
  }
  const rejected=await handle(new Request('https://local/site-transfer',{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:'{}'}),'same-client');assert.equal(rejected.status,429);
  for(const {controller} of pending)controller.close();await Promise.all(pending.map(x=>x.promise));
  const reserve=()=>handle(new Request('https://local/site-transfer',{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify({parts:128,bytes:128*1024*1024})}),'same-client');
  assert.equal((await reserve()).status,200);assert.equal((await reserve()).status,429);
 }finally{await rm(directory,{recursive:true,force:true});}
});
