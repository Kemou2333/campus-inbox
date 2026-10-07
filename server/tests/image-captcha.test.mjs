import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createService} from '../service.mjs';
import {createImageCaptcha,captchaAnswerHash} from '../image-captcha.mjs';

// All challenges and model replies are local. No platform account, network or paid AI calls.
const origin='https://app.example.test',otherOrigin='https://other.example.test';
const session='a'.repeat(43),secondSession='b'.repeat(43),otherSession='c'.repeat(43);
const accounts=new Map([[session,{id:1}],[secondSession,{id:1}],[otherSession,{id:2}]]);
const settings={apiKey:'mock-model-secret',accessToken:'mock-internal-signing-secret-long-enough',requireAccess:false,requireIdentity:true,
  allowedOrigins:[origin,otherOrigin],dailyLimit:30,accountDailyLimit:10,ipDailyLimit:10};
const result={schemaVersion:4,notices:[{schemaVersion:4,kind:'information',title:'固定响应',summary:'免费的模型模拟响应。',deadline:null,deadlineText:'',tasks:[],timeline:[],materials:[],warnings:[],reminders:[]}]};
const modelResponse=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:2,completion_tokens:3}});
const request=(text,proof,extra={})=>new Request('https://api.example.test/analyze',{method:'POST',
  headers:{Origin:extra.origin||origin,'Content-Type':'application/json',Authorization:'Bearer '+(extra.key||session),
    ...(proof?{'X-Campus-Proof':typeof proof==='string'?proof:JSON.stringify(proof)}:{})},
  body:JSON.stringify({sources:[{text}]}),...(extra.signal?{signal:extra.signal}:{})});

async function fixture(options={}){
  let time=Date.parse('2026-10-07T08:00:00Z'),modelCalls=0,latest;
  const handler=await createService({...settings,...options.config},{now:()=>time,accountForToken:key=>accounts.get(key),
    imageCaptcha:id=>createImageCaptcha(id,()=>123),modelFetch:async()=>{modelCalls++;return modelResponse();}});
  async function challenge(){
    for(const text of ['消息一','消息二'])assert.equal((await handler(request(text),'203.0.113.1')).status,200);
    const response=await handler(request('消息三'),'203.0.113.1');assert.equal(response.status,428);
    const body=await response.json();latest=body.challenge;
    assert.equal(body.code,'VERIFICATION_REQUIRED');assert.equal(latest.type,'image');
    assert.match(latest.image,/^data:image\/png;base64,iVBORw0KGgo/);
    assert.deepEqual(Object.keys(latest).sort(),['expires','image','token','type']);
    const context=JSON.parse(Buffer.from(latest.token.split('.')[0],'base64url'));
    assert.deepEqual(Object.keys(context).sort(),['account','expires','hash','id','ip','origin','type']);
    assert.equal(context.type,'image');
    return {token:latest.token,answer:'0123'};
  }
  return {handler,challenge,calls:()=>modelCalls,advance:ms=>{time+=ms;},latest:()=>latest};
}

test('numeric captcha is a valid raster PNG without textual/SVG answer metadata, and hash is salted by challenge ID',()=>{
  const generated=createImageCaptcha('test-context',()=>123),png=Buffer.from(generated.image.split(',')[1],'base64');
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let offset=8,compressed=[];const types=[];
  while(offset<png.length){
    const length=png.readUInt32BE(offset),type=png.subarray(offset+4,offset+8).toString();types.push(type);
    const data=png.subarray(offset+8,offset+8+length);
    if(type==='IHDR'){assert.equal(data.readUInt32BE(0),240);assert.equal(data.readUInt32BE(4),88);assert.equal(data[8],8);assert.equal(data[9],2);}
    if(type==='IDAT')compressed.push(data);offset+=12+length;
  }
  assert.deepEqual(types,['IHDR','IDAT','IEND']);assert.equal(offset,png.length);
  const pixels=inflateSync(Buffer.concat(compressed));assert.equal(pixels.length,88*(240*3+1));
  let dark=0;for(let row=0;row<88;row++){
    assert.equal(pixels[row*(240*3+1)],0);
    for(let column=0;column<240;column++)if(pixels[row*(240*3+1)+1+column*3]<100)dark++;
  }
  assert.ok(dark>1000,'the PNG contains readable foreground digit pixels');
  assert.equal(generated.answerHash,captchaAnswerHash('test-context','0123'));
  assert.notEqual(generated.answerHash,captchaAnswerHash('different-context','0123'));
  assert.deepEqual(Object.keys(generated).sort(),['answerHash','image']);
});

test('image mode is the default, explicit pow supports legacy clients, and unknown modes fail startup',async()=>{
  await assert.rejects(createService({...settings,captchaMode:'unknown'}),/CAPTCHA_MODE/);
  const handler=await createService({...settings,captchaMode:'pow'},{modelFetch:async()=>modelResponse(),accountForToken:key=>accounts.get(key)});
  for(const text of ['一','二'])assert.equal((await handler(request(text),'network')).status,200);
  const third=await handler(request('三'),'network');assert.equal(third.status,428);assert.equal((await third.json()).challenge.type,'pow');
  const f=await fixture();await f.challenge();assert.equal(f.calls(),2);
});

test('a correct four-digit answer starts one paid call and cannot be replayed, while cached results stay free',async()=>{
  const f=await fixture(),proof=await f.challenge();assert.equal(f.calls(),2);
  assert.equal((await f.handler(request('消息三',proof),'203.0.113.1')).status,200);assert.equal(f.calls(),3);
  assert.equal((await f.handler(request('消息三',proof),'203.0.113.1')).status,400);
  assert.equal((await f.handler(request('消息三'),'203.0.113.1')).status,200);assert.equal(f.calls(),3);
});

test('four wrong answers leave one final attempt; five wrong answers consume the challenge without paid generation',async()=>{
  const f=await fixture(),proof=await f.challenge();
  for(let count=0;count<4;count++){
    const response=await f.handler(request('消息三',{...proof,answer:'9999'}),'203.0.113.1');assert.equal(response.status,400);
    const body=await response.json();assert.equal(body.code,'CAPTCHA_INCORRECT');assert.equal(body.remainingAttempts,4-count);
  }
  assert.equal(f.calls(),2);assert.equal((await f.handler(request('消息三',proof),'203.0.113.1')).status,200);
  const exhausted=await fixture(),old=await exhausted.challenge();
  for(let count=0;count<5;count++)assert.equal((await exhausted.handler(request('消息三',{...old,answer:'9999'}),'203.0.113.1')).status,400);
  assert.equal((await exhausted.handler(request('消息三',old),'203.0.113.1')).status,400);assert.equal(exhausted.calls(),2);
});

test('challenge is bound to text, network, origin and account; device session rotation retains the same verified identity',async()=>{
  const f=await fixture(),proof=await f.challenge();
  for(const [text,ip,extra] of [['不同文字','203.0.113.1',{}],['消息三','203.0.113.2',{}],
    ['消息三','203.0.113.1',{origin:otherOrigin}],['消息三','203.0.113.1',{key:otherSession}]]){
    assert.equal((await f.handler(request(text,proof,extra),ip)).status,400);
  }
  assert.equal(f.calls(),2);
  assert.equal((await f.handler(request('消息三',proof,{key:secondSession}),'203.0.113.1')).status,200);assert.equal(f.calls(),3);
});

test('signed image context cannot be changed or downgraded to a computational proof',async()=>{
  const f=await fixture(),proof=await f.challenge();
  for(const replacement of [{token:proof.token,nonce:0},{...proof,type:'pow'},
    {...proof,token:proof.token.slice(0,-1)+'!'},{...proof,token:'x'.repeat(1801)}]){
    assert.equal((await f.handler(request('消息三',replacement),'203.0.113.1')).status,400);
  }
  assert.equal(f.calls(),2);assert.equal((await f.handler(request('消息三',proof),'203.0.113.1')).status,200);
});

test('malformed answers consume the same five-guess allowance instead of an unlimited alternate format path',async()=>{
  const f=await fixture(),proof=await f.challenge();
  for(const answer of ['',123,'123','12345','12a3'])assert.equal((await f.handler(request('消息三',{...proof,answer}),'203.0.113.1')).status,400);
  assert.equal((await f.handler(request('消息三',proof),'203.0.113.1')).status,400);assert.equal(f.calls(),2);
});

test('simultaneous correct answers consume one challenge and dispatch precisely one paid call',async()=>{
  const f=await fixture(),proof=await f.challenge();
  const responses=await Promise.all([f.handler(request('消息三',proof),'203.0.113.1'),f.handler(request('消息三',proof),'203.0.113.1')]);
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,400]);assert.equal(f.calls(),3);
});

test('image challenges expire exactly at two minutes and do not survive a process restart',async()=>{
  const expired=await fixture(),old=await expired.challenge();expired.advance(120000);
  assert.equal((await expired.handler(request('消息三',old),'203.0.113.1')).status,400);assert.equal(expired.calls(),2);
  const first=await fixture(),proof=await first.challenge(),restarted=await fixture();
  assert.equal((await restarted.handler(request('消息三',proof),'203.0.113.1')).status,400);assert.equal(restarted.calls(),0);
});

test('cancellation before dispatch never reaches the model, even with a correct answer',async()=>{
  const f=await fixture(),proof=await f.challenge(),controller=new AbortController();controller.abort();
  const response=await f.handler(request('消息三',proof,{signal:controller.signal}),'203.0.113.1');
  assert.equal(response.status,499);assert.equal((await response.json()).code,'CANCELLED');assert.equal(f.calls(),2);
});

test('captcha success does not expand account, network, global or rolling request caps',async()=>{
  for(const [configuration,key,ip,expected] of [
    [{accountDailyLimit:3},secondSession,'new-network','ACCOUNT_DAILY_LIMIT'],
    [{ipDailyLimit:3},otherSession,'203.0.113.1','IP_DAILY_LIMIT'],
    [{dailyLimit:3},otherSession,'new-network','DAILY_LIMIT']
  ]){
    const f=await fixture({config:configuration}),proof=await f.challenge();
    assert.equal((await f.handler(request('消息三',proof),'203.0.113.1')).status,200);
    const rejected=await f.handler(request('第四条',undefined,{key}),ip);
    assert.equal(rejected.status,429);assert.equal((await rejected.json()).code,expected);assert.equal(f.calls(),3);
  }
  const f=await fixture(),proof=await f.challenge();
  assert.equal((await f.handler(request('消息三',proof),'203.0.113.1')).status,200);
  for(let count=0;count<2;count++)assert.equal((await f.handler(request('消息三'),'203.0.113.1')).status,200);
  const sixth=await f.handler(request('消息三'),'203.0.113.1');assert.equal(sixth.status,429);
  assert.equal((await sixth.json()).code,'IP_RATE_LIMIT');assert.equal(f.calls(),3);
});
