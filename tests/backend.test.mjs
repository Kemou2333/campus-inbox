import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../server/service.mjs';
const origin='https://kemou2333.github.io',token='test-access-code-at-least-twenty-characters';
const result={schemaVersion:3,title:'登记通知',summary:'离校同学填写登记。',deadline:null,deadlineText:'9月30日18:00前',tasks:[{text:'填写离校登记表',assignee:'离校同学',details:['填写姓名与学号'],time:null,timeText:'9月30日18:00前',location:null}],timeline:[],materials:['离校登记表'],warnings:[]};
function request(notice='测试通知',auth=token,from=origin){return new Request('http://localhost/analyze',{method:'POST',headers:{Origin:from,Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({notice})});}
const mock=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:100,completion_tokens:100}}));
test('authorization and origin checks prevent paid upstream requests',async()=>{
  let calls=0;const handler=await createService({apiKey:'test',accessToken:token,allowedOrigins:[origin]},{modelFetch:async()=>{calls++;return mock();}});
  assert.equal((await handler(request('通知','wrong'))).status,401);
  assert.equal((await handler(request('通知',token,'https://other.example'))).status,403);
  assert.equal((await handler(request(''))).status,400);assert.equal(calls,0);
  const preflight=await handler(new Request('http://localhost/analyze',{method:'OPTIONS',headers:{Origin:origin}}));
  assert.equal(preflight.status,204);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/Authorization/);
});
test('valid structured result is cached, thinking is disabled, quota survives restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-test-')),file=join(directory,'usage.json');
  try{
    let calls=0;const modelFetch=async(_url,options)=>{calls++;const payload=JSON.parse(options.body);assert.equal(payload.model,'deepseek-flash');assert.equal(payload.thinking.type,'disabled');assert.equal(payload.max_tokens,3000);return mock();};
    const config={apiKey:'test',accessToken:token,allowedOrigins:[origin],dailyLimit:1,stateFile:file};
    const handler=await createService(config,{modelFetch});
    const response=await handler(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),result);
    assert.equal((await handler(request())).status,200);assert.equal(calls,1);
    assert.equal((await handler(request('另一条通知'))).status,429);
    const state=JSON.parse(await readFile(file,'utf8'));assert.equal(state.requests,1);assert.equal(state.input,100);assert.ok(!JSON.stringify(state).includes('测试通知'));
    const restarted=await createService(config,{modelFetch});assert.equal((await restarted(request('新通知'))).status,429);assert.equal(calls,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('malformed AI schema and incomplete output are rejected',async()=>{
  for(const choice of [{finish_reason:'length',message:{content:'{}'}},{finish_reason:'stop',message:{content:JSON.stringify({...result,tasks:['invalid legacy task']})}}]){
    const handler=await createService({apiKey:'test',accessToken:token,allowedOrigins:[origin]},{modelFetch:async()=>new Response(JSON.stringify({choices:[choice]}))});
    assert.equal((await handler(request())).status,502);
  }
});
