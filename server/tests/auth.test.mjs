import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {canonicalUsername,createAuthService} from '../auth.mjs';

const origin='https://app.example.test',password='a simple password';
async function fixture(options={}){
  let time=Date.parse('2026-10-06T08:00:00Z');const identities=[];
  const config={stateFile:':memory:',signingSecret:'unit-test-signing-secret-not-for-deployment',allowedOrigins:[origin],...options.config};
  const auth=await createAuthService(config,{now:()=>time,provision:identity=>{identities.push(identity);return {key:randomBytes(32).toString('base64url')};},...options.service});
  async function request(path,body={},key,headers={},ip='test-network'){
    const response=await auth.handle(new Request(`https://service.example.test/auth/${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{ }),...headers},body:JSON.stringify(body)}),ip);
    return {response,body:response.status===204?null:await response.json()};
  }
  async function register(username='测试同学',invite=auth.issueInvites(1)[0]){
    const result=await request('register',{username,password,invite});assert.equal(result.response.status,200);return result.body;
  }
  return {auth,config,identities,request,register,advance:ms=>{time+=ms;}};
}

test('username normalization is simple and excludes unsafe or confusing markup',()=>{
  assert.equal(canonicalUsername(' ＴＥＳＴ_同学 '),'test_同学');assert.equal(canonicalUsername('Kemou-233'),'kemou-233');
  for(const value of ['ab','user name','<script>','user@example.com','a'.repeat(25),'你好\u200b同学'])assert.throws(()=>canonicalUsername(value));
});
test('only private issuance creates short random one-use invitations',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const codes=f.auth.issueInvites(30);assert.equal(new Set(codes).size,30);assert.ok(codes.every(c=>/^[A-HJ-NP-Z2-9]{8}$/.test(c)));
  assert.throws(()=>f.auth.issueInvites(31));assert.throws(()=>f.auth.issueInvites(0));assert.equal((await f.request('code',{email:'somewhere@gmail.com'})).response.status,404);
});
test('registration consumes its invitation and provisions a stable account identity',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const invite=f.auth.issueInvites(1)[0],first=await f.register('ＴＥＳＴ_同学',invite.toLowerCase());
  assert.equal(first.username,'test_同学');assert.equal(first.key.length,43);assert.equal(f.auth.getIdentity(first.key).provider,'invite');
  assert.equal((await f.request('register',{invite,username:'another',password})).response.status,400);assert.equal(f.identities.length,1);assert.match(f.identities[0].subject,/^[a-f0-9-]{36}$/);
});
test('duplicate usernames and bad invitations do not bypass registration',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());await f.register('kemou');const invite=f.auth.issueInvites(1)[0];
  assert.equal((await f.request('register',{invite,username:'ＫＥＭＯＵ',password})).response.status,409);
  assert.equal((await f.request('register',{invite:'AAAAAAAA',username:'another',password})).response.status,400);
  assert.equal((await f.request('register',{invite,username:'another',password:'short'})).response.status,400);
});
test('login uses passwords and gives the same error for unknown usernames',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const registered=await f.register('kemou');
  const wrong=await f.request('login',{username:'kemou',password:'wrong password'}),unknown=await f.request('login',{username:'missing-user',password:'wrong password'});
  assert.equal(wrong.response.status,401);assert.equal(unknown.response.status,401);assert.equal(wrong.body.error,unknown.body.error);
  const logged=await f.request('login',{username:'ＫＥＭＯＵ',password});assert.equal(logged.response.status,200);assert.notEqual(logged.body.key,registered.key);assert.equal(f.auth.getIdentity(logged.body.key).subject,f.auth.getIdentity(registered.key).subject);
});
test('five login attempts per minute apply to IP and username',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());await f.register('kemou');
  for(let i=0;i<5;i++)assert.equal((await f.request('login',{username:'kemou',password:'wrong password'})).response.status,401);
  assert.equal((await f.request('login',{username:'kemou',password})).response.status,429);f.advance(60000);assert.equal((await f.request('login',{username:'kemou',password})).response.status,200);
});
test('invalid invitation guesses are counted and the sixth is rate limited',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());
  for(let i=0;i<5;i++)assert.equal((await f.request('register',{invite:'AAAAAAAA',username:'kemou',password})).response.status,400);
  assert.equal((await f.request('register',{invite:'AAAAAAAA',username:'kemou',password})).response.status,429);
});
test('registration capacity and per-IP daily caps leave unused invites unused',async t=>{
  const capacity=await fixture({service:{limits:{accountLimit:1}}});t.after(()=>capacity.auth.close());await capacity.register('first-user');const invite=capacity.auth.issueInvites(1)[0];assert.equal((await capacity.request('register',{invite,username:'second-user',password})).response.status,507);
  const daily=await fixture({service:{limits:{registerIPDay:1}}});t.after(()=>daily.auth.close());await daily.register('first-user');const code=daily.auth.issueInvites(1)[0];assert.equal((await daily.request('register',{invite:code,username:'second-user',password})).response.status,429);
  assert.equal((await daily.request('register',{invite:code,username:'second-user',password},undefined,{},'different-network')).response.status,200);
});
test('session lasts thirty days, active use renews and unused sessions expire',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const session=await f.register(),first=Date.parse(session.expiresAt);f.advance(16*86400000);const identity=f.auth.getIdentity(session.key);assert.ok(Date.parse(identity.expiresAt)>first);f.advance(31*86400000);assert.equal(f.auth.getIdentity(session.key),null);
});
test('logout revokes one device while another can continue using the same account',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const first=await f.register(),second=(await f.request('login',{username:first.username,password})).body;
  assert.equal((await f.request('logout',{},first.key)).response.status,200);assert.equal(f.auth.getIdentity(first.key),null);assert.ok(f.auth.getIdentity(second.key));assert.equal(f.auth.getIdentity(`Bearer ${second.key}`),null);
});
test('malformed and expired sessions cannot access status',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());assert.equal((await f.request('status',{},'invalid')).response.status,401);const session=await f.register();assert.equal((await f.request('status',{},session.key)).body.username,session.username);f.advance(31*86400000);assert.equal((await f.request('status',{},session.key)).response.status,401);
});
test('an untrusted origin cannot register or consume an invitation',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const invite=f.auth.issueInvites(1)[0];assert.equal((await f.request('register',{invite,username:'kemou',password},undefined,{Origin:'https://attacker.test'})).response.status,403);assert.equal((await f.request('register',{invite,username:'kemou',password})).response.status,200);
});
test('concurrent registration cannot consume the same invitation twice',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const invite=f.auth.issueInvites(1)[0];const results=await Promise.all([f.request('register',{invite,username:'first-user',password}),f.request('register',{invite,username:'second-user',password})]);assert.deepEqual(results.map(r=>r.response.status).sort(),[200,400]);
});
test('passwords, invitations and sessions persist as hashes instead of plaintext',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-auth-test-')),file=join(directory,'auth.sqlite');t.after(()=>rm(directory,{recursive:true,force:true}));
  const f=await fixture({config:{stateFile:file}}),invite=f.auth.issueInvites(1)[0],session=await f.register('kemou',invite);f.auth.close();
  const check=new DatabaseSync(file),user=check.prepare('SELECT * FROM invite_users').get(),code=check.prepare('SELECT * FROM invite_codes').get(),stored=check.prepare('SELECT * FROM invite_sessions').get();assert.equal(user.password_hash.length,128);assert.equal(user.salt.length,32);assert.equal(code.code_hash.length,64);assert.equal(stored.key_hash.length,64);assert.ok(![...Object.values(user),...Object.values(code),...Object.values(stored)].some(v=>[password,invite,session.key].includes(v)));check.close();
  const reopened=await createAuthService(f.config);t.after(()=>reopened.close());assert.equal(reopened.getIdentity(session.key)?.username,'kemou');
});
test('private CLI writes invitations to a 600 file and prints only a count',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-invite-cli-'));t.after(()=>rm(directory,{recursive:true,force:true}));const output=join(directory,'private-codes.txt');
  const {stdout}=await promisify(execFile)(process.execPath,['server/manage-invites.mjs','--count','3','--output',output,'--state',join(directory,'auth.sqlite')],{env:{...process.env,CAMPUS_ACCESS_TOKEN:'cli-test-signing-secret-not-for-deployment'}});
  const codes=(await readFile(output,'utf8')).trim().split('\n');assert.equal(codes.length,3);assert.ok(codes.every(c=>/^[A-HJ-NP-Z2-9]{8}$/.test(c)));assert.ok(codes.every(c=>!stdout.includes(c)));assert.equal((await stat(output)).mode&0o777,0o600);
});
