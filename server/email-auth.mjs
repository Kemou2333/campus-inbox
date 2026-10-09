import {createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {ALLOWED_EMAIL_DOMAINS,canonicalEmail} from './contracts/email-policy.mjs';
import {ServiceError} from './analyze.mjs';

const MINUTE=60000,HOUR=60*MINUTE,DAY=24*HOUR,CODE_TTL=5*MINUTE;
const DEFAULT_LIMITS={emailSendHour:3,emailSendDay:6,emailSendIPHour:20,emailSendIPDay:40,emailSendGlobalDay:50,emailVerifyIPMinute:10,emailSendConcurrency:2,emailRegisterIPMinute:5,emailRegisterIPDay:10,emailRegisterGlobalDay:20};

/** Email is another credential for the existing account UUID, never a new cloud owner. */
export function createEmailAuth({db,signingSecret,now=Date.now,limits={},sendCode,getIdentity,sessionFor,createUser,prepareCredentials,setPassword}){
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_identities(email TEXT PRIMARY KEY,user TEXT NOT NULL UNIQUE REFERENCES invite_users(id));
    CREATE TABLE IF NOT EXISTS email_challenges(
      id TEXT PRIMARY KEY,email TEXT NOT NULL,purpose TEXT NOT NULL,target TEXT,
      code_hash TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS email_challenges_email ON email_challenges(email,created);
  `);
  const caps={...DEFAULT_LIMITS,...limits};
  const enabled=typeof sendCode==='function';
  const stmt={
    identity:db.prepare('SELECT invite_users.* FROM email_identities JOIN invite_users ON invite_users.id=email_identities.user WHERE email=?'),
    email:db.prepare('SELECT email FROM email_identities WHERE user=?'),
    bind:db.prepare('INSERT INTO email_identities(email,user) VALUES (?,?)'),
    recent:db.prepare('SELECT created FROM email_challenges WHERE email=? ORDER BY created DESC LIMIT 1'),
    challenge:db.prepare('SELECT * FROM email_challenges WHERE id=?'),
    reserve:db.prepare('INSERT INTO email_challenges(id,email,purpose,target,code_hash,created,expires,attempts,state) VALUES (?,?,?,?,?,?,?,0,?)'),
    state:db.prepare('UPDATE email_challenges SET state=? WHERE id=? AND state=?'),
    attempt:db.prepare('UPDATE email_challenges SET attempts=?,state=? WHERE id=?'),
    clean:db.prepare('DELETE FROM email_challenges WHERE expires<?'),
    usage:db.prepare('SELECT COALESCE(SUM(count),0) AS count,MIN(period) AS oldest FROM invite_usage WHERE bucket=? AND subject=? AND period>?'),
    countUsage:db.prepare('INSERT INTO invite_usage(bucket,subject,period,count,expires) VALUES (?,?,?,1,?) ON CONFLICT(bucket,subject,period) DO UPDATE SET count=count+1'),
    cleanUsage:db.prepare('DELETE FROM invite_usage WHERE expires<?'),
    legacy:db.prepare('SELECT subject,count FROM invite_usage WHERE bucket=? AND expires>?'),
    importUsage:db.prepare('INSERT INTO invite_usage(bucket,subject,period,count,expires) VALUES (?,?,?,?,?) ON CONFLICT(bucket,subject,period) DO UPDATE SET count=count+excluded.count'),
    deleteLegacy:db.prepare('DELETE FROM invite_usage WHERE bucket=?'),
  };
  const transaction=operation=>{db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const digest=value=>createHmac('sha256',signingSecret).update(value).digest('hex');
  const hashCode=(challenge,code)=>digest(JSON.stringify(['email-code',challenge.id,challenge.email,challenge.purpose,challenge.target,code]));
  const error=(message,status=400,code)=>{const issue=new ServiceError(message,status);if(code)issue.code=code;return issue;};
  // Upgrade fixed-window counters once, conservatively retaining their remaining
  // counts for one whole rolling window. Removing the old rows avoids reimport
  // on restart; the migration and new counters use the existing SQLite table.
  transaction(()=>{
    const t=now();
    for(const [bucket,window] of [['email-send-hour',HOUR],['email-send-day',DAY],['email-send-ip-hour',HOUR],['email-send-ip-day',DAY],['email-send-global-day',DAY],['email-verify-ip-minute',MINUTE]]){
      for(const row of stmt.legacy.all(bucket,t))stmt.importUsage.run('rolling:'+bucket,row.subject,t,row.count,t+window);
      stmt.deleteLegacy.run(bucket);
    }
  });
  function rate(bucket,subject,limit,window){
    const t=now(),name='rolling:'+bucket,usage=stmt.usage.get(name,subject,t-window);
    if(usage.count>=limit){
      const issue=error('验证码请求较多，请稍后再试。',429,'EMAIL_RATE_LIMIT');
      issue.retryAfterSeconds=Math.max(1,Math.ceil((usage.oldest+window-t)/1000));throw issue;
    }
    stmt.countUsage.run(name,subject,t,t+window);
  }
  function emailForUser(user){return stmt.email.get(user)?.email;}
  function options(){return {emailEnabled:enabled,inviteEnabled:true,domains:[...ALLOWED_EMAIL_DOMAINS]};}
  function requireEnabled(){if(!enabled)throw error('邮箱登录暂未开放，请使用用户名和密码登录。',503,'EMAIL_UNAVAILABLE');}
  function emailValue(value){try{return canonicalEmail(value);}catch(issue){throw error(issue.message);}}
  function userForEmail(email){return stmt.identity.get(email);}
  function currentIdentity(key){const identity=getIdentity(key);if(!identity)throw error('请先登录原账号，再绑定邮箱。',401,'AUTH_REQUIRED');return identity;}
  let sending=0;

  async function request(body,ip,key){
    requireEnabled();
    const email=emailValue(body.email),purpose=body.purpose;
    if(!['login','bind','register','password'].includes(purpose))throw error('请选择注册或绑定邮箱。');
    const target=purpose==='bind'?currentIdentity(key).subject:null;
    // The public send reply never discloses whether this mailbox has an account.
    // Ownership-sensitive registration/setup checks happen after code validation.
    if(sending>=caps.emailSendConcurrency){
      const issue=error('发信服务暂时繁忙，请稍后再试。',429,'EMAIL_SERVICE_BUSY');issue.retryAfterSeconds=3;throw issue;
    }
    const challenge={id:randomBytes(32).toString('base64url'),email,purpose,target};
    const code=String(randomInt(0,1000000)).padStart(6,'0'),t=now(),expires=t+CODE_TTL;
    // Reserve the send and count it before the asynchronous mail operation. Failed
    // sends still consume the quota so mail outages cannot cause unlimited retries.
    transaction(()=>{
      stmt.cleanUsage.run(t);stmt.clean.run(t-DAY);
      const recent=stmt.recent.get(email);
      if(recent&&t-recent.created<MINUTE){
        const issue=error('请稍后再获取验证码。',429,'EMAIL_RATE_LIMIT');
        issue.retryAfterSeconds=Math.max(1,Math.ceil((recent.created+MINUTE-t)/1000));throw issue;
      }
      const mailbox=digest('email-send:'+email),network=digest('email-ip:'+ip);
      rate('email-send-hour',mailbox,caps.emailSendHour,HOUR);
      rate('email-send-day',mailbox,caps.emailSendDay,DAY);
      rate('email-send-ip-hour',network,caps.emailSendIPHour,HOUR);
      rate('email-send-ip-day',network,caps.emailSendIPDay,DAY);
      rate('email-send-global-day','global',caps.emailSendGlobalDay,DAY);
      stmt.reserve.run(challenge.id,email,purpose,target,hashCode(challenge,code),t,expires,'pending');
    });
    sending++;
    try{
      await sendCode({email,code,expiresMinutes:5,purpose});
      if(now()>=expires){stmt.state.run('expired',challenge.id,'pending');throw error('验证码已过期，请重新获取。',400,'EMAIL_CODE_INVALID');}
      const sent=stmt.state.run('sent',challenge.id,'pending');
      if(sent.changes!==1)throw error('验证码已失效，请重新获取。',400,'EMAIL_CODE_INVALID');
    }catch(issue){
      stmt.state.run('failed',challenge.id,'pending');
      if(issue instanceof ServiceError&&issue.code==='EMAIL_CODE_INVALID')throw issue;
      const failure=error('验证码邮件暂时无法发送，请稍后重试。',503,'EMAIL_SEND_FAILED');
      failure.retryAfterSeconds=Math.max(1,Math.ceil((t+MINUTE-now())/1000));throw failure;
    }finally{sending--;}
    return {challengeId:challenge.id,retryAfterSeconds:60,expiresAt:new Date(expires).toISOString()};
  }

  async function verify(body,ip,key){
    requireEnabled();
    const challengeId=body.challengeId;
    // Derive the password only after a valid code has been presented. Re-read the
    // challenge in the transaction after hashing so concurrent redemption and
    // expiry during hashing cannot create or overwrite an account.
    const preview=typeof challengeId==='string'&&/^[A-Za-z0-9_-]{43}$/.test(challengeId)?stmt.challenge.get(challengeId):null;
    let credentials;
    if(preview&&['register','password'].includes(preview.purpose)&&preview.state==='sent'&&preview.attempts<5&&preview.expires>now()
      &&typeof body.code==='string'&&/^\d{6}$/.test(body.code)&&timingSafeEqual(Buffer.from(preview.code_hash,'hex'),Buffer.from(hashCode(preview,body.code),'hex'))){
      const existing=userForEmail(preview.email);
      if(preview.purpose==='register'&&existing)throw error('此邮箱已注册，请直接登录。',409,'EMAIL_ALREADY_REGISTERED');
      if(preview.purpose==='password'&&(!existing||existing.password_hash))throw error('账号已有密码，请直接登录。',409,'EMAIL_PASSWORD_EXISTS');
      credentials=await prepareCredentials(body,preview.purpose);
    }
    // Expected verification errors are returned from the transaction, not thrown,
    // so wrong-code counters and expired states cannot be rolled back.
    const result=transaction(()=>{
      stmt.cleanUsage.run(now());
      // Network throttling applies to failed guesses. A correct code cannot be
      // locked out by another student (or attacker) sharing the campus NAT.
      const rejected=issue=>{
        try{rate('email-verify-ip-minute',digest('email-verify:'+ip),caps.emailVerifyIPMinute,MINUTE);}
        catch(throttled){return {error:throttled};}
        return {error:issue};
      };
      const challenge=typeof challengeId==='string'&&/^[A-Za-z0-9_-]{43}$/.test(challengeId)?stmt.challenge.get(challengeId):null;
      if(!challenge||challenge.state!=='sent'||challenge.attempts>=5)return rejected(error('验证码无效或已过期，请重新获取。',400,'EMAIL_CODE_INVALID'));
      if(challenge.expires<=now()){
        stmt.state.run('expired',challengeId,'sent');
        return rejected(error('验证码无效或已过期，请重新获取。',400,'EMAIL_CODE_INVALID'));
      }
      const identity=challenge.purpose==='bind'?currentIdentity(key):null;
      if(identity&&identity.subject!==challenge.target)throw error('请使用发起绑定的原账号完成验证。',403,'EMAIL_BIND_ACCOUNT_MISMATCH');
      const attempts=challenge.attempts+1;
      const matches=typeof body.code==='string'&&/^\d{6}$/.test(body.code)
        &&timingSafeEqual(Buffer.from(challenge.code_hash,'hex'),Buffer.from(hashCode(challenge,body.code),'hex'));
      if(!matches){
        stmt.attempt.run(attempts,attempts>=5?'failed':'sent',challengeId);
        return rejected(error(attempts>=5?'验证码尝试次数已用完，请重新获取。':'验证码不正确，请再试一次。',400,'EMAIL_CODE_INVALID'));
      }
      let user=stmt.identity.get(challenge.email),created=false;
      if(identity){
        const oldEmail=emailForUser(identity.subject);
        if(user&&user.id!==identity.subject||oldEmail&&oldEmail!==challenge.email){
          stmt.attempt.run(attempts,'used',challengeId);
          return {error:error('此邮箱无法绑定到当前账号，已有绑定不能覆盖或合并。',409,'EMAIL_BIND_CONFLICT')};
        }
        if(!oldEmail)stmt.bind.run(challenge.email,identity.subject);
        stmt.attempt.run(attempts,'used',challengeId);
        return {bound:{username:identity.username,email:challenge.email,expiresAt:identity.expiresAt}};
      }
      if(challenge.purpose==='register'&&user){
        stmt.attempt.run(attempts,'used',challengeId);
        return {error:error('此邮箱已注册，请直接登录。',409,'EMAIL_ALREADY_REGISTERED')};
      }
      if(challenge.purpose==='password'){
        if(!user||user.password_hash){
          stmt.attempt.run(attempts,'used',challengeId);
          return {error:error('账号已有密码，请直接登录。',409,'EMAIL_PASSWORD_EXISTS')};
        }
        setPassword(user,credentials);
      }
      if(!user){
        const network=digest('email-register:'+ip);
        rate('email-register-ip-minute',network,caps.emailRegisterIPMinute,MINUTE);
        rate('email-register-ip-day',network,caps.emailRegisterIPDay,DAY);
        rate('email-register-global-day','global',caps.emailRegisterGlobalDay,DAY);
        user=createUser(credentials);stmt.bind.run(challenge.email,user.id);created=true;
      }
      stmt.attempt.run(attempts,'used',challengeId);
      return {user,created,email:challenge.email};
    });
    if(result.error)throw result.error;
    if(result.bound)return result.bound;
    // A redeemed code is never reusable, including concurrent submissions. If
    // provisioning fails, keep the UUID and verified email for the next login.
    try{return {...await sessionFor(result.user,ip),email:result.email};}
    catch(issue){throw error(credentials?'邮箱已验证，密码已保存。请稍后使用密码登录。':'邮箱已验证，账号已保留。请稍后重新获取验证码登录。',issue.status||503,result.created?'ACCOUNT_CREATED_LOGIN_PENDING':'EMAIL_LOGIN_PENDING');}
  }
  return {options,emailValue,userForEmail,emailForUser,request,verify};
}
