import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAuthService} from '../auth.mjs';
import {ALLOWED_EMAIL_DOMAINS} from '../contracts/email-policy.mjs';

const origin='https://app.example.test',email='review@163.com',password='a simple password';
async function fixture(options={}){
  let time=options.time??Date.parse('2026-10-08T08:00:00Z');const messages=[],identities=[];
  const config={stateFile:options.file||':memory:',signingSecret:'email-test-signing-secret-not-for-deployment',allowedOrigins:[origin]};
  const service={now:()=>time,limits:options.limits,provision:async identity=>{
    identities.push(identity);
    if(options.provision)return options.provision(identity);
    return {key:randomBytes(32).toString('base64url')};
  }};
  if(!options.disabled)service.sendCode=async message=>{messages.push(message);if(options.sendCode)await options.sendCode(message);};
  const auth=await createAuthService(config,service);
  async function request(path,body={},key,ip='test-network',requestOrigin=origin){
    const response=await auth.handle(new Request(`https://service.example.test/auth/${path}`,{
      method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify(body),
    }),ip);
    return {status:response.status,body:await response.json()};
  }
  async function register(username='old-user'){
    const result=await request('register',{username,password,invite:auth.issueInvites(1)[0]});assert.equal(result.status,200);return result.body;
  }
  async function send(address=email,purpose='login',key,ip){
    const result=await request('email/request',{email:address,purpose},key,ip);assert.equal(result.status,200);return result.body;
  }
  const verify=(challenge,code=messages.at(-1).code,key,ip)=>request('email/verify',{challengeId:challenge.challengeId,code},key,ip);
  return {auth,config,messages,identities,request,register,send,verify,now:()=>time,advance:ms=>{time+=ms;}};
}

test('email options are explicit and disabled mail leaves invitation login available',async t=>{
  const f=await fixture({disabled:true});t.after(()=>f.auth.close());
  assert.deepEqual((await f.request('options')).body,{emailEnabled:false,inviteEnabled:true,domains:[...ALLOWED_EMAIL_DOMAINS]});
  assert.equal((await f.request('email/request',{email,purpose:'login'})).status,503);
  assert.equal((await f.request('email/verify',{challengeId:'A'.repeat(43),code:'123456'})).status,503);
  const old=await f.register();assert.equal((await f.request('login',{username:old.username,password})).status,200);
});

test('mail request returns only an opaque challenge and creates accounts after verification',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());
  assert.equal((await f.request('options')).body.emailEnabled,true);
  const challenge=await f.send();
  assert.deepEqual(Object.keys(challenge).sort(),['challengeId','expiresAt','retryAfterSeconds']);
  assert.match(challenge.challengeId,/^[A-Za-z0-9_-]{43}$/);assert.equal(challenge.retryAfterSeconds,60);
  assert.match(f.messages[0].code,/^\d{6}$/);assert.equal(f.messages[0].expiresMinutes,5);
  assert.equal(f.identities.length,0);
  const logged=await f.verify(challenge);assert.equal(logged.status,200);assert.equal(logged.body.email,email);
  assert.match(logged.body.username,/^同学_[a-f0-9]{16}$/);assert.equal(logged.body.key.length,43);
  const identity=f.auth.getIdentity(logged.body.key);assert.equal(identity.provider,'invite');assert.equal(identity.email,email);
  assert.equal((await f.request('status',{},logged.body.key)).body.email,email);
  assert.equal((await f.verify(challenge)).status,400);
});

test('mail validation and origin rules do not send unsupported or untrusted requests',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());
  assert.equal((await f.request('email/request',{email:'user@unlisted.test',purpose:'login'})).status,400);
  assert.equal((await f.request('email/request',{email,purpose:'unknown'})).status,400);
  assert.equal((await f.request('email/request',{email,purpose:'login'},undefined,'test-network','https://attacker.test')).status,403);
  assert.equal((await f.request('email/request',{email,purpose:'bind'})).status,401);
  assert.equal(f.messages.length,0);
});

test('Gmail aliases share a cooldown and later login retains the account UUID',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const first=await f.send('Re.View+school@gmail.com');
  assert.equal(f.messages[0].email,'review@gmail.com');
  assert.equal((await f.request('email/request',{email:'review+different@gmail.com',purpose:'login'})).status,429);
  const logged=await f.verify(first);const owner=f.auth.getIdentity(logged.body.key).subject;
  f.advance(60000);const second=await f.send('review@gmail.com');const again=await f.verify(second);
  assert.equal(again.status,200);assert.equal(f.auth.getIdentity(again.body.key).subject,owner);assert.notEqual(again.body.key,logged.body.key);
});

test('resending cannot cancel another valid login challenge, and each challenge still expires',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const old=await f.send(),oldCode=f.messages[0].code;
  f.advance(60000);const newer=await f.send();assert.equal((await f.verify(old,oldCode)).status,200);
  assert.equal((await f.verify(old,oldCode)).status,400);
  f.advance(300000);assert.equal((await f.verify(newer)).status,400);assert.equal(f.identities.length,1);
});

test('five wrong codes remain exhausted after reopening the SQLite database',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-email-attempt-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const file=join(directory,'auth.sqlite'),f=await fixture({file}),challenge=await f.send(),correct=f.messages[0].code;
  const wrong=correct==='000000'?'000001':'000000';
  for(let i=0;i<5;i++)assert.equal((await f.verify(challenge,wrong)).status,400);
  f.auth.close();
  const reopened=await fixture({file});t.after(()=>reopened.auth.close());
  assert.equal((await reopened.verify(challenge,correct)).status,400);assert.equal(reopened.identities.length,0);
});

test('failed verification throttles guesses across challenges without locking out a correct code on the shared network',async t=>{
  const f=await fixture({limits:{emailVerifyIPMinute:2}});t.after(()=>f.auth.close());
  for(let i=0;i<2;i++)assert.equal((await f.request('email/verify',{challengeId:'A'.repeat(43),code:'123456'})).status,400);
  const challenge=await f.send(),correct=f.messages[0].code,wrong=correct==='000000'?'000001':'000000';
  assert.equal((await f.verify(challenge,wrong)).status,429);
  assert.equal((await f.verify(challenge,correct)).status,200);
});

test('send quotas limit mailbox, network and whole service before sending',async t=>{
  for(const [name,limits,secondEmail,secondIP] of [
    ['mailbox hour',{emailSendHour:1},email,'other-network'],
    ['mailbox day',{emailSendHour:9,emailSendDay:1},email,'other-network'],
    ['network hour',{emailSendIPHour:1},'another@163.com','test-network'],
    ['network day',{emailSendIPHour:9,emailSendIPDay:1},'another@163.com','test-network'],
    ['global day',{emailSendGlobalDay:1},'another@163.com','other-network'],
  ]){
    const f=await fixture({limits});t.after(()=>f.auth.close());await f.send();f.advance(60000);
    const limited=await f.request('email/request',{email:secondEmail,purpose:'login'},undefined,secondIP);
    assert.equal(limited.status,429,name);assert.equal(limited.body.code,'EMAIL_RATE_LIMIT');assert.equal(f.messages.length,1,name);
  }
});

test('mail failure consumes send quota and invalidates its reserved challenge without exposing provider errors',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-email-failure-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const file=join(directory,'auth.sqlite'),f=await fixture({file,limits:{emailSendHour:1},sendCode:()=>{throw new Error('private provider detail');}});t.after(()=>f.auth.close());
  const failed=await f.request('email/request',{email,purpose:'login'});assert.equal(failed.status,503);assert.equal(failed.body.code,'EMAIL_SEND_FAILED');
  assert.equal(failed.body.retryAfterSeconds,60);
  assert.ok(!JSON.stringify(failed.body).includes('private provider detail'));
  const db=new DatabaseSync(file),row=db.prepare('SELECT * FROM email_challenges').get();db.close();
  assert.equal(row.state,'failed');assert.equal((await f.verify({challengeId:row.id},f.messages[0].code)).status,400);
  f.advance(60000);assert.equal((await f.request('email/request',{email,purpose:'login'})).status,429);
});

test('concurrent redemption consumes the code before asynchronous session provisioning',async t=>{
  let finish;const hold=new Promise(resolve=>{finish=resolve;});
  const f=await fixture({provision:async()=>{await hold;return {key:randomBytes(32).toString('base64url')};}});t.after(()=>f.auth.close());
  const challenge=await f.send(),first=f.verify(challenge);
  const second=await f.verify(challenge);assert.equal(second.status,400);assert.equal(f.identities.length,1);
  finish();assert.equal((await first).status,200);
});

test('verified-email registration keeps capacity and its own network cap separate from invitations',async t=>{
  const full=await fixture({limits:{accountLimit:1}});t.after(()=>full.auth.close());await full.register();
  assert.equal((await full.verify(await full.send())).status,507);
  const daily=await fixture({limits:{registerIPDay:1,emailRegisterIPDay:1}});t.after(()=>daily.auth.close());await daily.register();
  assert.equal((await daily.verify(await daily.send())).status,200);
  const challenge=await daily.send('another@163.com');assert.equal((await daily.verify(challenge)).status,429);
  assert.equal((await daily.verify(challenge,undefined,undefined,'other-network')).status,200);
});

test('rolling mailbox and global budgets do not reopen at clock-hour or midnight boundaries',async t=>{
  const hourly=await fixture();t.after(()=>hourly.auth.close());hourly.advance(57*60000);
  for(let i=0;i<3;i++){await hourly.send();hourly.advance(60000);}
  assert.equal((await hourly.request('email/request',{email,purpose:'login'})).status,429);
  hourly.advance(57*60000);assert.equal((await hourly.request('email/request',{email,purpose:'login'})).status,200);
  const daily=await fixture({limits:{emailSendGlobalDay:1},time:Date.parse('2026-10-08T23:59:00Z')});t.after(()=>daily.auth.close());
  await daily.send();daily.advance(60000);
  assert.equal((await daily.request('email/request',{email:'another@163.com',purpose:'login'},undefined,'other-network')).status,429);
  daily.advance(23*3600000+59*60000);
  assert.equal((await daily.request('email/request',{email:'another@163.com',purpose:'login'},undefined,'other-network')).status,200);
});

test('two simultaneous sends are bounded without charging rejected requests or leaving a slot busy',async t=>{
  let finish;const hold=new Promise(resolve=>{finish=resolve;});
  const f=await fixture({sendCode:()=>hold});t.after(()=>f.auth.close());
  const first=f.request('email/request',{email,purpose:'login'}),second=f.request('email/request',{email:'second@163.com',purpose:'login'});
  const third=await f.request('email/request',{email:'third@163.com',purpose:'login'});
  assert.equal(third.status,429);assert.equal(third.body.code,'EMAIL_SERVICE_BUSY');assert.equal(third.body.retryAfterSeconds,3);assert.equal(f.messages.length,2);
  finish();assert.equal((await first).status,200);assert.equal((await second).status,200);
  assert.equal((await f.request('email/request',{email:'third@163.com',purpose:'login'})).status,200);assert.equal(f.messages.length,3);
});

test('mail failures return the remaining cooldown and release their send slot',async t=>{
  let f;f=await fixture({limits:{emailSendConcurrency:1},sendCode:()=>{f.advance(15000);throw new Error('private error');}});t.after(()=>f.auth.close());
  const failed=await f.request('email/request',{email,purpose:'login'});
  assert.equal(failed.status,503);assert.equal(failed.body.retryAfterSeconds,45);
  const different=await f.request('email/request',{email:'another@163.com',purpose:'login'});assert.equal(different.status,503);assert.equal(different.body.code,'EMAIL_SEND_FAILED');
  assert.equal(f.messages.length,2);
});

test('wrong-code attempt exhaustion persists even when the network failure budget was already exhausted',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-email-throttle-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const file=join(directory,'auth.sqlite'),f=await fixture({file,limits:{emailVerifyIPMinute:1}}),challenge=await f.send(),correct=f.messages[0].code;
  const wrong=correct==='000000'?'000001':'000000';
  assert.equal((await f.verify(challenge,wrong)).status,400);
  for(let i=0;i<4;i++)assert.equal((await f.verify(challenge,wrong)).status,429);
  const time=f.now();f.auth.close();const reopened=await fixture({file,time,limits:{emailVerifyIPMinute:1}});t.after(()=>reopened.auth.close());
  assert.equal((await reopened.verify(challenge,correct)).status,429);reopened.advance(60000);
  assert.equal((await reopened.verify(challenge,correct)).status,400);assert.equal(reopened.identities.length,0);
});

test('shared-campus users can each verify normally while new accounts retain their global ceiling',async t=>{
  const campus=await fixture();t.after(()=>campus.auth.close());
  for(let i=0;i<6;i++){
    assert.equal((await campus.verify(await campus.send(`student${i}@163.com`))).status,200);campus.advance(60000);
  }
  assert.equal(campus.identities.length,6);
  const limited=await fixture({limits:{emailRegisterGlobalDay:1}});t.after(()=>limited.auth.close());
  const first=await limited.verify(await limited.send());assert.equal(first.status,200);
  const next=await limited.send('next@163.com','login',undefined,'other-network');assert.equal((await limited.verify(next,undefined,undefined,'other-network')).status,429);
  limited.advance(60000);assert.equal((await limited.verify(await limited.send(),undefined,undefined,'other-network')).status,200);
  assert.equal(limited.auth.getIdentity(first.body.key).subject,limited.identities.at(-1).subject);
});

test('fixed-window production mail counters migrate once without resetting on restart',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-email-rate-migration-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const file=join(directory,'auth.sqlite'),original=await fixture({file}),time=original.now();original.auth.close();
  const networkHash=createHmac('sha256',original.config.signingSecret).update('email-send:'+email).digest('hex');
  const db=new DatabaseSync(file);db.prepare('INSERT INTO invite_usage(bucket,subject,period,count,expires) VALUES (?,?,?,?,?)').run('email-send-hour',networkHash,Math.floor(time/3600000),3,time+3600000);db.close();
  const migrated=await fixture({file,time});assert.equal((await migrated.request('email/request',{email,purpose:'login'})).status,429);migrated.auth.close();
  const reopened=await fixture({file,time});t.after(()=>reopened.auth.close());
  assert.equal((await reopened.request('email/request',{email,purpose:'login'})).status,429);reopened.advance(3600000);
  assert.equal((await reopened.request('email/request',{email,purpose:'login'})).status,200);
});

test('anonymous login resends cannot invalidate an authenticated binding in progress',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const old=await f.register(),challenge=await f.send(email,'bind',old.key),code=f.messages[0].code;
  f.advance(60000);await f.send(email,'login');
  const bound=await f.verify(challenge,code,old.key);assert.equal(bound.status,200);assert.equal(f.auth.getIdentity(old.key).email,email);
});

test('a mail operation finishing after expiry never activates its code',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-email-late-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const file=join(directory,'auth.sqlite');let f;f=await fixture({file,sendCode:()=>{f.advance(300000);}});t.after(()=>f.auth.close());
  const late=await f.request('email/request',{email,purpose:'login'});assert.equal(late.status,400);assert.equal(late.body.code,'EMAIL_CODE_INVALID');
  const db=new DatabaseSync(file),row=db.prepare('SELECT * FROM email_challenges').get();db.close();
  assert.equal(row.state,'expired');assert.equal((await f.verify({challengeId:row.id},f.messages[0].code)).status,400);
});

test('email-only accounts reject password login safely and login failures retain their verified identity',async t=>{
  let fail=true;
  const f=await fixture({provision:()=>{if(fail){const issue=new Error('sync space unavailable');issue.status=429;throw issue;}return {key:randomBytes(32).toString('base64url')};}});t.after(()=>f.auth.close());
  const challenge=await f.send(),pending=await f.verify(challenge);
  assert.equal(pending.status,429);assert.equal(pending.body.code,'ACCOUNT_CREATED_LOGIN_PENDING');
  assert.equal((await f.verify(challenge)).status,400);const oldSubject=f.identities[0].subject;
  fail=false;f.advance(60000);const logged=await f.verify(await f.send());assert.equal(logged.status,200);
  assert.equal(f.auth.getIdentity(logged.body.key).subject,oldSubject);
  const rejected=await f.request('login',{username:logged.body.username,password});assert.equal(rejected.status,401);assert.equal(rejected.body.error,'用户名或密码不正确。');
});

test('binding an old account keeps its UUID and password while requiring the same authenticated account',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const old=await f.register(),other=await f.register('other-user');
  const owner=f.auth.getIdentity(old.key).subject,challenge=await f.send(email,'bind',old.key);
  assert.equal((await f.verify(challenge,undefined,other.key)).status,403);
  assert.equal((await f.verify(challenge,undefined)).status,401);
  const bound=await f.verify(challenge,undefined,old.key);assert.equal(bound.status,200);
  assert.equal(bound.body.username,old.username);assert.equal(bound.body.email,email);assert.equal(f.auth.getIdentity(old.key).subject,owner);
  assert.equal((await f.request('status',{},old.key)).body.email,email);
  const passwordLogin=await f.request('login',{username:old.username,password});assert.equal(passwordLogin.status,200);assert.equal(passwordLogin.body.email,email);
  f.advance(60000);const emailLogin=await f.verify(await f.send());assert.equal(emailLogin.status,200);
  assert.equal(f.auth.getIdentity(emailLogin.body.key).subject,owner);assert.ok(f.identities.some(identity=>identity.provider==='invite'&&identity.subject===owner));
});

test('verified binding cannot replace an account email or merge two existing accounts',async t=>{
  const f=await fixture();t.after(()=>f.auth.close());const first=await f.register(),second=await f.register('second-user');
  const bound=await f.verify(await f.send(email,'bind',first.key),undefined,first.key);assert.equal(bound.status,200);
  f.advance(60000);const conflict=await f.verify(await f.send(email,'bind',second.key),undefined,second.key);assert.equal(conflict.status,409);assert.equal(conflict.body.code,'EMAIL_BIND_CONFLICT');
  const replacement=await f.verify(await f.send('replacement@163.com','bind',first.key),undefined,first.key);assert.equal(replacement.status,409);
  assert.equal(f.auth.getIdentity(first.key).email,email);assert.equal(f.auth.getIdentity(second.key).email,undefined);
});

test('persisted codes are HMAC hashes and email sessions survive reopening',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'campus-email-storage-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const file=join(directory,'auth.sqlite'),f=await fixture({file}),challenge=await f.send(),code=f.messages[0].code;
  const logged=await f.verify(challenge);assert.equal(logged.status,200);const owner=f.auth.getIdentity(logged.body.key).subject;f.auth.close();
  const db=new DatabaseSync(file),stored=db.prepare('SELECT * FROM email_challenges').get();
  assert.match(stored.code_hash,/^[a-f0-9]{64}$/);assert.ok(!Object.values(stored).includes(code));assert.equal(stored.state,'used');db.close();
  const reopened=await fixture({file});t.after(()=>reopened.auth.close());
  assert.equal(reopened.auth.getIdentity(logged.body.key).subject,owner);assert.equal(reopened.auth.getIdentity(logged.body.key).email,email);
  assert.equal((await reopened.verify(challenge,code)).status,400);
});

test('email registration verifies once, stores a password hash and then logs in by password without sending mail',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'campus-email-password-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'auth.sqlite'),f=await fixture({file});t.after(()=>f.auth.close());
 const challenge=await f.send(email,'register'),code=f.messages.at(-1).code;
 assert.equal(f.identities.length,0);assert.equal(f.messages[0].purpose,'register');
 const short=await f.request('email/verify',{challengeId:challenge.challengeId,code,username:'student-one',password:'short'});assert.equal(short.status,400);
 const registered=await f.request('email/verify',{challengeId:challenge.challengeId,code,username:'ＳＴＵＤＥＮＴ-one',password});
 assert.equal(registered.status,200);assert.equal(registered.body.username,'student-one');
 const owner=f.auth.getIdentity(registered.body.key).subject;
 const byEmail=await f.request('login',{username:' REVIEW@163.COM ',password});
 const byUsername=await f.request('login',{username:'STUDENT-one',password});
 assert.equal(byEmail.status,200);assert.equal(byUsername.status,200);
 assert.equal(f.auth.getIdentity(byEmail.body.key).subject,owner);assert.equal(f.auth.getIdentity(byUsername.body.key).subject,owner);
 assert.equal(f.messages.length,1);assert.equal((await f.verify(challenge,code)).status,400);
 const db=new DatabaseSync(file),user=db.prepare('SELECT * FROM invite_users').get(),identityCount=db.prepare('SELECT COUNT(*) AS count FROM email_identities').get();db.close();
 assert.match(user.password_hash,/^[a-f0-9]{128}$/);assert.match(user.salt,/^[a-f0-9]{32}$/);assert.ok(!Object.values(user).includes(password));assert.equal(identityCount.count,1);
});

test('email registration cannot overwrite an existing bound account or its password',async t=>{
 const f=await fixture();t.after(()=>f.auth.close());const old=await f.register(),owner=f.auth.getIdentity(old.key).subject;
 await f.verify(await f.send(email,'bind',old.key),undefined,old.key);f.advance(60000);
 const register=await f.send(email,'register'),rejected=await f.request('email/verify',{challengeId:register.challengeId,code:f.messages.at(-1).code,username:'replacement',password:'another password'});assert.equal(rejected.status,409);assert.equal(rejected.body.code,'EMAIL_ALREADY_REGISTERED');
 f.advance(60000);const setup=await f.send(email,'password'),conflict=await f.request('email/verify',{challengeId:setup.challengeId,code:f.messages.at(-1).code,password:'another password'});assert.equal(conflict.status,409);assert.equal(conflict.body.code,'EMAIL_PASSWORD_EXISTS');
 const logged=await f.request('login',{username:email,password});assert.equal(logged.status,200);assert.equal(f.auth.getIdentity(logged.body.key).subject,owner);assert.equal(f.messages.length,3);
});

test('legacy email-only accounts set a password after verification and retain their cloud owner',async t=>{
 const f=await fixture();t.after(()=>f.auth.close());const original=(await f.verify(await f.send())).body,owner=f.auth.getIdentity(original.key).subject;
 f.advance(60000);const challenge=await f.send(email,'password'),code=f.messages.at(-1).code,wrong=code==='000000'?'000001':'000000';
 const invalid=await f.request('email/verify',{challengeId:challenge.challengeId,code:wrong,password});assert.equal(invalid.status,400);
 assert.equal((await f.request('login',{username:email,password})).status,401);
 const saved=await f.request('email/verify',{challengeId:challenge.challengeId,code,password});assert.equal(saved.status,200);
 assert.equal(f.auth.getIdentity(saved.body.key).subject,owner);assert.equal(saved.body.username,original.username);
 const login=await f.request('login',{username:email,password});assert.equal(login.status,200);assert.equal(f.auth.getIdentity(login.body.key).subject,owner);
 f.advance(60000);const again=await f.send(email,'password'),rejected=await f.request('email/verify',{challengeId:again.challengeId,code:f.messages.at(-1).code,password:'another password'});assert.equal(rejected.status,409);assert.equal(f.messages.length,3);
});

test('email and username password guesses share one per-account budget across networks',async t=>{
 const f=await fixture();t.after(()=>f.auth.close());const old=await f.register();await f.verify(await f.send(email,'bind',old.key),undefined,old.key);
 for(let i=0;i<5;i++)assert.equal((await f.request('login',{username:i%2?old.username:email,password:'wrong password'},undefined,'network-'+i)).status,401);
 assert.equal((await f.request('login',{username:old.username,password},undefined,'fresh-network')).status,429);
 f.advance(60000);assert.equal((await f.request('login',{username:email,password},undefined,'fresh-network')).status,200);
});

test('concurrent password registrations with one code cannot create duplicate email identities',async t=>{
 const f=await fixture();t.after(()=>f.auth.close());const challenge=await f.send(email,'register'),code=f.messages.at(-1).code;
 const results=await Promise.all(['first-user','second-user'].map(username=>f.request('email/verify',{challengeId:challenge.challengeId,code,username,password})));
 assert.deepEqual(results.map(result=>result.status).sort(),[200,400]);assert.equal(f.identities.length,1);
});

test('verified password registration preserves rolling account ceilings and leaves a throttled code usable',async t=>{
 const f=await fixture({limits:{emailRegisterIPDay:1}});t.after(()=>f.auth.close());
 const first=await f.send(email,'register');assert.equal((await f.request('email/verify',{challengeId:first.challengeId,code:f.messages.at(-1).code,username:'first-user',password})).status,200);
 const second=await f.send('another@163.com','register'),code=f.messages.at(-1).code;
 const body={challengeId:second.challengeId,code,username:'second-user',password};
 assert.equal((await f.request('email/verify',body)).status,429);
 assert.equal((await f.request('email/verify',body,undefined,'other-network')).status,200);
});

test('a verified password account survives provisioning failure and can recover by ordinary login',async t=>{
 let unavailable=true;const f=await fixture({provision:()=>{if(unavailable){const issue=new Error('sync fixture unavailable');issue.status=429;throw issue;}return {key:randomBytes(32).toString('base64url')};}});t.after(()=>f.auth.close());
 const challenge=await f.send(email,'register'),code=f.messages.at(-1).code;
 const result=await f.request('email/verify',{challengeId:challenge.challengeId,code,username:'new-user',password});
 assert.equal(result.status,429);assert.equal(result.body.code,'ACCOUNT_CREATED_LOGIN_PENDING');assert.match(result.body.error,/使用密码登录/);
 unavailable=false;const logged=await f.request('login',{username:email,password});assert.equal(logged.status,200);assert.equal(f.identities[0].subject,f.auth.getIdentity(logged.body.key).subject);assert.equal(f.messages.length,1);
});

test('public registration and first-password send replies do not reveal mailbox membership',async t=>{
 const f=await fixture();t.after(()=>f.auth.close());const old=await f.register();await f.verify(await f.send(email,'bind',old.key),undefined,old.key);f.advance(60000);
 for(const [address,purpose] of [[email,'register'],['new@163.com','register'],['unknown@163.com','password']]){
  const reply=await f.request('email/request',{email:address,purpose});assert.equal(reply.status,200);assert.deepEqual(Object.keys(reply.body).sort(),['challengeId','expiresAt','retryAfterSeconds']);
  if(purpose==='password')assert.equal((await f.request('email/verify',{challengeId:reply.body.challengeId,code:f.messages.at(-1).code,password})).status,409);
 }
 assert.equal(f.identities.length,1);
});
