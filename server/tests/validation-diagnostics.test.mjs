import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyze,groundDates,ServiceError} from '../analyze.mjs';
import {createService} from '../service.mjs';

const message='AI 未返回有效的整理结果，请稍后重试。';
const source='学校通知，请按要求提交材料。private-original-notice';
const usage={prompt_tokens:37,completion_tokens:112,completion_tokens_details:{reasoning_tokens:29}};
function batch(){return {schemaVersion:4,notices:[{schemaVersion:4,kind:'task',title:'提交材料',summary:'请按要求提交材料。',deadline:null,deadlineText:'',timeline:[],tasks:[{text:'提交申请',assignee:null,scope:'all',condition:'',details:[],steps:[{text:'填写申请表',details:[]}],time:null,timeText:'',location:null}],materials:[],warnings:[],reminders:[]}]};}
const upstream=value=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value),reasoning_content:'private-model-reasoning'}}],usage});
const task=n=>n.tasks[0],step=n=>task(n).steps[0];

test('strict field limits and time errors have finite diagnostic categories while paid usage remains available',async()=>{
  const cases=[
    ['TITLE',n=>n.title='x'.repeat(41)],
    ['TASK_TEXT',n=>task(n).text='x'.repeat(61)],
    ['TASK_CONDITION',n=>task(n).condition='x'.repeat(121)],
    ['TASK_CONDITION',n=>{task(n).scope='conditional';task(n).condition='';}],
    ['TASK_SCOPE',n=>task(n).scope='private-invalid-scope'],
    ['TASK_DETAILS',n=>task(n).details=['x'.repeat(501)]],
    ['STEP_TEXT',n=>step(n).text='x'.repeat(61)],
    ['STEP_DETAILS',n=>step(n).details=['x'.repeat(501)]],
    ['STEP_DETAILS',n=>step(n).details=Array(6).fill('细节')],
    ['STEP_COUNT',n=>task(n).steps=Array.from({length:11},()=>({text:'步骤',details:[]}))],
    ['STRUCTURED_TIME',n=>task(n).timeSpec={type:'unknown',rawText:''}],
    ['STRUCTURED_TIME',n=>task(n).timeSpec={type:'partial',year:null,month:13,day:1,hour:null,minute:null,rawText:''}],
    ['ISO_TIME',n=>n.deadline=42],
    ['DEADLINE_TEXT',n=>n.deadlineText=null],
    ['TIMELINE_TIME_TEXT',n=>n.deadlineText='x'.repeat(501)],
    ['TIMELINE_LABEL',n=>n.timeline=[{label:'x'.repeat(201),time:null,timeText:'',location:null}]],
    ['TIMELINE_FORMAT',n=>n.timeline={}],
    ['MATERIALS',n=>n.materials={}],
    ['WARNINGS',n=>n.warnings=[{}]],
    ['REMINDERS',n=>n.reminders={}],
    ['TASK_LIST',n=>n.tasks={}],
    ['SCHEMA_VERSION',n=>n.schemaVersion=5],
  ];
  for(const [code,mutate] of cases){
    const value=batch();mutate(value.notices[0]);let calls=0;
    await assert.rejects(analyze(source,{apiKey:'test'},async()=>{calls++;return upstream(value);}),error=>{
      assert(error instanceof ServiceError);assert.equal(error.failureCode,code);assert.equal(error.message,message);assert.equal(error.status,502);
      assert.equal(error.finishReason,'stop');assert.equal(error.usageAvailable,true);assert.deepEqual(error.usage,{input:37,output:112,reasoning:29});
      assert(!JSON.stringify(error).includes('private-'));return true;
    });
    assert.equal(calls,1,'no automatic retry for '+code);
  }
});

test('valid exact text boundaries still pass without rewriting model wording',async()=>{
  const value=batch(),n=value.notices[0],t=task(n),s=step(n);
  n.title='题'.repeat(40);n.summary='摘'.repeat(140);t.text='任'.repeat(60);t.scope='conditional';t.condition='条'.repeat(120);t.details=['细'.repeat(500)];s.text='步'.repeat(60);s.details=Array(5).fill('节'.repeat(500));
  const reply=await analyze(source,{apiKey:'test'},async()=>upstream(value));
  assert.deepEqual(reply.result,value);assert.equal(reply.usageAvailable,true);
});

test('service persists only the new category and token totals after a failed paid response',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-validation-diag-')),stateFile=join(directory,'usage.json');
  const origin='https://kemou2333.github.io',token='test-diagnostic-token-at-least-twenty';
  try{
    const invalid=batch();step(invalid.notices[0]).details=['private-model-value'.repeat(30)];let calls=0;
    const handler=await createService({apiKey:'test',accessToken:token,allowedOrigins:[origin],stateFile},{modelFetch:async()=>{calls++;return upstream(invalid);}});
    const response=await handler(new Request('http://localhost/analyze',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({notice:source})}));
    assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:message,code:'AI_FORMAT_INVALID'});assert.equal(calls,1);
    const state=JSON.parse(await readFile(stateFile,'utf8'));
    assert.equal(state.requests,1);assert.equal(state.input,37);assert.equal(state.output,112);assert.equal(state.reasoning,29);assert.equal(state.lastFinishReason,'stop');assert.equal(state.lastFailureCode,'STEP_DETAILS');
    assert.equal(state.costMicro,1164,'usage cost uses output once, including reasoning');
    assert(!JSON.stringify(state).includes('private-'));assert(!JSON.stringify(state).includes(token));
    assert.deepEqual(Object.keys(state).sort(),['costMicro','day','input','lastFailureCode','lastFinishReason','output','reasoning','requests'].sort());
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('diagnostic metadata rejects arbitrary provider strings outside the fixed enum',()=>{
  const error=new ServiceError(message,502,{failureCode:'private-provider-validator-message',finishReason:'private-provider-metadata',code:'private-provider-code',usage});
  assert.equal(error.failureCode,undefined);assert.equal(error.finishReason,'unknown');assert.equal(error.code,undefined);assert(!JSON.stringify(error).includes('private-'));
});

test('grounding cannot fabricate required fields in a malformed model response',async()=>{
  for(const [code,mutate,hasField] of [
    ['ROOT_FIELDS',n=>delete n.deadline,n=>Object.hasOwn(n,'deadline')],
    ['ROOT_FIELDS',n=>delete n.timeline,n=>Object.hasOwn(n,'timeline')],
    ['TASK_FIELDS',n=>delete task(n).time,n=>Object.hasOwn(task(n),'time')],
    ['TIMELINE_FIELDS',n=>{n.timeline=[{label:'提交截止',timeText:'',location:null}];},n=>Object.hasOwn(n.timeline[0],'time')]
  ]){
    const value=batch();mutate(value.notices[0]);
    const grounded=groundDates(value,source);assert.equal(hasField(grounded.notices[0]),false);
    let calls=0;
    await assert.rejects(analyze(source,{apiKey:'test'},async()=>{calls++;return upstream(value);}),error=>{
      assert.equal(error.failureCode,code);assert.equal(error.usageAvailable,true);assert.deepEqual(error.usage,{input:37,output:112,reasoning:29});return true;
    });
    assert.equal(calls,1);
  }
});

test('malformed card, task and timeline values keep finite field diagnostics without normalizing their types',async()=>{
  for(const malformed of [null,[],42,'private-malformed-value']){
    for(const [code,mutate,read] of [
      ['ROOT_FIELDS',v=>v.notices[0]=malformed,v=>v.notices[0]],
      ['TASK_FIELDS',v=>v.notices[0].tasks=[malformed],v=>v.notices[0].tasks[0]],
      ['TIMELINE_FORMAT',v=>v.notices[0].timeline=[malformed],v=>v.notices[0].timeline[0]]
    ]){
      const value=batch();mutate(value);assert.deepEqual(read(groundDates(value,source)),malformed);let calls=0;
      await assert.rejects(analyze(source,{apiKey:'test'},async()=>{calls++;return upstream(value);}),error=>{
        assert.equal(error.failureCode,code);assert.equal(error.message,message);assert.equal(error.usageAvailable,true);assert(!JSON.stringify(error).includes('private-'));return true;
      });
      assert.equal(calls,1);
    }
  }
});

test('provider timeout returns a stable code, retains the reservation and never retries',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-validation-timeout-')),stateFile=join(directory,'usage.json');
  const origin='https://kemou2333.github.io',token='test-timeout-token-at-least-twenty';let calls=0;
  try{
    const handler=await createService({apiKey:'test',accessToken:token,allowedOrigins:[origin],stateFile,timeoutMs:5},{modelFetch:async(_url,{signal})=>{
      calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('private-provider-abort','AbortError')),{once:true}));
    }});
    const response=await handler(new Request('http://localhost/analyze',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({notice:source})}));
    assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'AI 整理超时，请稍后重试。',code:'AI_TIMEOUT'});
    assert.equal(calls,1);const state=JSON.parse(await readFile(stateFile,'utf8'));
    assert.equal(state.requests,1);assert(state.costMicro>0);assert.equal(state.input,0);assert.equal(state.output,0);
    assert(!JSON.stringify(state).includes('private-'));assert(!JSON.stringify(state).includes(token));
  }finally{await rm(directory,{recursive:true,force:true});}
});
