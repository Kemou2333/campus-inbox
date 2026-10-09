import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,randomBytes,randomUUID,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdir,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
import {boundedText,ServiceError} from './analyze.mjs';
import {createEmailAuth} from './email-auth.mjs';

const scrypt=promisify(derive),DAY=86400000,SESSION_TTL=30*DAY;
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const sha=value=>createHash('sha256').update(value).digest('hex');
const validKey=key=>typeof key==='string'&&/^[A-Za-z0-9_-]{43}$/.test(key);
export function canonicalUsername(value){
  if(typeof value!=='string')throw new ServiceError('请填写用户名。',400);
  const name=value.normalize('NFKC').trim().toLowerCase();
  if([...name].length<3||[...name].length>24||!/^[a-z0-9_\-\p{Script=Han}]+$/u.test(name))throw new ServiceError('用户名需为 3–24 个中文、字母、数字、下划线或短横线。',400);
  return name;
}
function passwordValue(value){if(typeof value!=='string'||value.length<8||value.length>128)throw new ServiceError('密码需为 8–128 个字符。',400);return value;}
function inviteValue(value){
  if(typeof value!=='string')throw new ServiceError('请填写 8 位邀请码。',400);
  const code=value.trim().toUpperCase();
  if(code.length!==8||[...code].some(c=>!ALPHABET.includes(c)))throw new ServiceError('请填写正确的 8 位邀请码。',400);
  return code;
}

export async function createAuthService(config,options={}){
  if(!config.signingSecret||config.signingSecret.length<20)throw new Error('Auth signing secret is missing');
  const file=config.stateFile||'/var/lib/campus-inbox/auth.sqlite';
  if(file!==':memory:')await mkdir(dirname(file),{recursive:true,mode:0o700});
  const db=new DatabaseSync(file,{timeout:1000});
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-2048;
    CREATE TABLE IF NOT EXISTS invite_users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invite_codes(code_hash TEXT PRIMARY KEY,created INTEGER NOT NULL,used_by TEXT REFERENCES invite_users(id),used_at INTEGER);
    CREATE TABLE IF NOT EXISTS invite_sessions(key_hash TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES invite_users(id),created INTEGER NOT NULL,expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS invite_sessions_user ON invite_sessions(user);
    CREATE TABLE IF NOT EXISTS invite_usage(bucket TEXT NOT NULL,subject TEXT NOT NULL,period INTEGER NOT NULL,count INTEGER NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(bucket,subject,period));`);
  if(file!==':memory:')await chmod(file,0o600);
  const stmt={
    user:db.prepare('SELECT * FROM invite_users WHERE username=?'),
    count:db.prepare('SELECT COUNT(*) AS count FROM invite_users'),
    insertUser:db.prepare('INSERT INTO invite_users(id,username,salt,password_hash,created) VALUES (?,?,?,?,?)'),
    invite:db.prepare('SELECT * FROM invite_codes WHERE code_hash=?'),
    issueInvite:db.prepare('INSERT INTO invite_codes(code_hash,created) VALUES (?,?)'),
    useInvite:db.prepare('UPDATE invite_codes SET used_by=?,used_at=? WHERE code_hash=? AND used_by IS NULL'),
    session:db.prepare('SELECT invite_users.id,invite_users.username,invite_sessions.expires FROM invite_sessions JOIN invite_users ON invite_users.id=invite_sessions.user WHERE invite_sessions.key_hash=?'),
    insertSession:db.prepare('INSERT INTO invite_sessions(key_hash,user,created,expires) VALUES (?,?,?,?)'),
    renewSession:db.prepare('UPDATE invite_sessions SET expires=? WHERE key_hash=?'),
    deleteSession:db.prepare('DELETE FROM invite_sessions WHERE key_hash=?'),
    pruneSessions:db.prepare('DELETE FROM invite_sessions WHERE user=? AND key_hash NOT IN (SELECT key_hash FROM invite_sessions WHERE user=? ORDER BY created DESC,rowid DESC LIMIT 20)'),
    usage:db.prepare('SELECT count FROM invite_usage WHERE bucket=? AND subject=? AND period=?'),
    countUsage:db.prepare('INSERT INTO invite_usage(bucket,subject,period,count,expires) VALUES (?,?,?,1,?) ON CONFLICT(bucket,subject,period) DO UPDATE SET count=count+1'),
    cleanUsage:db.prepare('DELETE FROM invite_usage WHERE expires<?'),
    cleanSessions:db.prepare('DELETE FROM invite_sessions WHERE expires<?'),
  };
  const now=options.now||Date.now,limits={accountLimit:500,registerIPDay:5,registerIPMinute:5,loginIPMinute:5,loginUserMinute:5,...options.limits};
  const transaction=operation=>{db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const hashSubject=value=>createHmac('sha256',config.signingSecret).update('invite-auth:'+value).digest('hex');
  let hashing=0;
  async function hashPassword(password,salt){
    if(hashing>=4)throw new ServiceError('登录服务暂时繁忙，请稍后重试。',429);
    hashing++;
    try{return await scrypt(password,salt,64,{N:8192,r:8,p:1,maxmem:16*1024*1024});}
    finally{hashing--;}
  }
  function rate(bucket,subject,limit,window){
    const period=Math.floor(now()/window);
    if((stmt.usage.get(bucket,subject,period)?.count||0)>=limit)throw new ServiceError('请求较多，请稍后再试。',429);
    stmt.countUsage.run(bucket,subject,period,(period+1)*window);
  }
  function clean(){stmt.cleanUsage.run(now());stmt.cleanSessions.run(now());}
  async function sessionFor(user,ip){
    const issued=options.provision?await options.provision({provider:'invite',subject:user.id},ip):{key:randomBytes(32).toString('base64url')};
    if(!validKey(issued?.key))throw new ServiceError('登录暂时不可用，请稍后重试。',503);
    const t=now(),expires=t+SESSION_TTL;
    transaction(()=>{stmt.insertSession.run(sha(issued.key),user.id,t,expires);stmt.pruneSessions.run(user.id,user.id);});
    const email=emailAuth.emailForUser(user.id);
    return {key:issued.key,username:user.username,expiresAt:new Date(expires).toISOString(),...(email?{email}:{})};
  }
  async function register(body,ip){
    const username=canonicalUsername(body.username),password=passwordValue(body.password),invite=inviteValue(body.invite),codeHash=sha(invite),network=hashSubject('ip:'+ip);
    // Commit the attempt counter before validation; failed guesses must not roll it back.
    transaction(()=>{clean();rate('register-minute',network,limits.registerIPMinute,60000);});
    if((stmt.usage.get('register-day',network,Math.floor(now()/DAY))?.count||0)>=limits.registerIPDay)throw new ServiceError('今日注册次数已达上限。',429);
    const code=stmt.invite.get(codeHash);if(!code||code.used_by)throw new ServiceError('邀请码无效或已使用。',400);
    if(stmt.user.get(username))throw new ServiceError('此用户名已被使用，请换一个。',409);
    if(stmt.count.get().count>=limits.accountLimit)throw new ServiceError('当前注册容量已满，请联系维护者。',507);
    const salt=randomBytes(16).toString('hex'),passwordHash=(await hashPassword(password,salt)).toString('hex');
    const user={id:randomUUID(),username};
    transaction(()=>{
      const code=stmt.invite.get(codeHash);if(!code||code.used_by)throw new ServiceError('邀请码无效或已使用。',400);
      if(stmt.user.get(username))throw new ServiceError('此用户名已被使用，请换一个。',409);
      if(stmt.count.get().count>=limits.accountLimit)throw new ServiceError('当前注册容量已满，请联系维护者。',507);
      rate('register-day',network,limits.registerIPDay,DAY);
      stmt.insertUser.run(user.id,username,salt,passwordHash,now());stmt.useInvite.run(user.id,now(),codeHash);
    });
    try{return await sessionFor(user,ip);}
    catch(error){
      const issue=new ServiceError('账号已创建。请稍后使用用户名和密码登录。',error.status||503);
      issue.code='ACCOUNT_CREATED_LOGIN_PENDING';throw issue;
    }
  }
  async function login(body,ip){
    let username,user;
    if(typeof body.username==='string'&&body.username.includes('@')){
      username=emailAuth.emailValue(body.username);user=emailAuth.userForEmail(username);
    }else{username=canonicalUsername(body.username);user=stmt.user.get(username);}
    const password=passwordValue(body.password);
    // Email and username aliases share the account's guessing budget.
    transaction(()=>{clean();rate('login-ip',hashSubject('ip:'+ip),limits.loginIPMinute,60000);rate('login-user',hashSubject('user:'+(user?.id||username)),limits.loginUserMinute,60000);});
    const hasPassword=!!user&&/^[a-f0-9]{128}$/.test(user.password_hash),salt=hasPassword?user.salt:'00000000000000000000000000000000';
    const actual=await hashPassword(password,salt),expected=hasPassword?Buffer.from(user.password_hash,'hex'):Buffer.alloc(64);
    const matches=timingSafeEqual(actual,expected);
    if(!hasPassword||!matches)throw new ServiceError('用户名或密码不正确。',401);
    return sessionFor(user,ip);
  }
  /** Private CLI only: no HTTP endpoint or admin page issues invitations. */
  function issueInvites(count){
    if(!Number.isSafeInteger(count)||count<1||count>30)throw new Error('每次请生成 1–30 个邀请码');
    return transaction(()=>Array.from({length:count},()=>{
      const code=[...randomBytes(8)].map(b=>ALPHABET[b&31]).join('');stmt.issueInvite.run(sha(code),now());return code;
    }));
  }
  function getIdentity(key){
    if(!validKey(key))return null;
    const hash=sha(key),session=stmt.session.get(hash),t=now();
    if(!session)return null;
    if(session.expires<=t){stmt.deleteSession.run(hash);return null;}
    let expires=session.expires;if(expires-t<15*DAY){expires=t+SESSION_TTL;stmt.renewSession.run(expires,hash);}
    const email=emailAuth.emailForUser(session.id);
    return {provider:'invite',subject:session.id,username:session.username,expiresAt:new Date(expires).toISOString(),...(email?{email}:{})};
  }
  const emailAuth=createEmailAuth({db,signingSecret:config.signingSecret,now,limits:options.limits,sendCode:options.sendCode,getIdentity,sessionFor,
    async prepareCredentials(body,purpose){
      const password=passwordValue(body.password),username=purpose==='register'?canonicalUsername(body.username):undefined;
      if(username&&stmt.user.get(username))throw new ServiceError('此用户名已被使用，请换一个。',409);
      const salt=randomBytes(16).toString('hex'),passwordHash=(await hashPassword(password,salt)).toString('hex');
      return {username,salt,passwordHash};
    },
    setPassword(user,credentials){
      const changed=db.prepare("UPDATE invite_users SET salt=?,password_hash=? WHERE id=? AND salt='' AND password_hash=''").run(credentials.salt,credentials.passwordHash,user.id);
      if(changed.changes!==1)throw new ServiceError('账号已有密码，请直接登录。',409);
    },
    createUser(credentials){
      if(stmt.count.get().count>=limits.accountLimit)throw new ServiceError('当前注册容量已满，请联系维护者。',507);
      let username=credentials?.username;
      if(username&&stmt.user.get(username))throw new ServiceError('此用户名已被使用，请换一个。',409);
      if(!username)do{username='同学_'+randomBytes(8).toString('hex');}while(stmt.user.get(username));
      const user={id:randomUUID(),username};
      // Legacy OTP clients can still create an email-only account. Empty
      // credentials reject password login until verified first-password setup.
      stmt.insertUser.run(user.id,username,credentials?.salt||'',credentials?.passwordHash||'',now());return user;
    }
  });
  async function handle(request,ip='unknown'){
    const origin=request.headers.get('Origin'),allowed=(config.allowedOrigins||[]).includes(origin),path=new URL(request.url).pathname;
    const reply=(body,status=200)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'}:{})}});
    if(!['/auth/register','/auth/login','/auth/status','/auth/logout','/auth/options','/auth/email/request','/auth/email/verify'].includes(path))return reply({error:'接口不存在。'},404);
    if(!allowed)return reply({error:'此应用未获准登录。'},403);
    if(request.method==='OPTIONS')return reply({},204);
    if(request.method!=='POST')return reply({error:'请使用 POST 登录。'},405);
    if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return reply({error:'登录请求必须使用 JSON。'},415);
    try{
      let body;try{body=JSON.parse(await boundedText(request.body,4096));}catch(error){if(error.status===413)throw new ServiceError('登录请求内容过大。',413);throw new ServiceError('登录请求不是有效 JSON。',400);}
      if(!body||typeof body!=='object'||Array.isArray(body))throw new ServiceError('登录内容格式不正确。',400);
      if(path==='/auth/options')return reply(emailAuth.options());
      if(path==='/auth/register')return reply(await register(body,ip));
      if(path==='/auth/login')return reply(await login(body,ip));
      const key=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
      if(path==='/auth/email/request')return reply(await emailAuth.request(body,ip,key));
      if(path==='/auth/email/verify')return reply(await emailAuth.verify(body,ip,key));
      if(path==='/auth/logout'){if(key)stmt.deleteSession.run(sha(key));return reply({ok:true});}
      const identity=getIdentity(key);if(!identity)return reply({error:'登录已过期，请重新登录。'},401);
      return reply({username:identity.username,expiresAt:identity.expiresAt,...(identity.email?{email:identity.email}:{})});
    }catch(error){return reply({error:error instanceof ServiceError?error.message:'登录暂时不可用，请稍后再试。',
      ...(error instanceof ServiceError&&error.code?{code:error.code}:{}),
      ...(error instanceof ServiceError&&error.retryAfterSeconds?{retryAfterSeconds:error.retryAfterSeconds}:{})},error.status||503);}
  }
  return {handle,getIdentity,issueInvites,close:()=>db.close()};
}
