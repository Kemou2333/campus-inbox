import {randomBytes} from 'node:crypto';
import {open} from 'node:fs/promises';
import {canonicalUsername} from './auth.mjs';
import {boundedText,ServiceError,ANALYSIS_LIMITS} from './analyze.mjs';
import {APK_DOWNLOAD_LIMITS} from './apk-downloads.mjs';
import {SYNC_LIMITS} from './sync.mjs';
import {adminHtml} from './admin-ui.mjs';
import {adminTestRuns} from './test-records.mjs';

export async function backupSummary(file){
  if(!file)return {status:'not_configured'};
  let handle;
  try{
    handle=await open(file,'r');const buffer=Buffer.alloc(4097),read=await handle.read(buffer,0,buffer.length,0);if(read.bytesRead>4096)throw new Error('status limit');
    const value=JSON.parse(buffer.subarray(0,read.bytesRead).toString());if(!value||!['running','ok','error'].includes(value.status))throw new Error('status format');
    const safeDate=key=>typeof value[key]==='string'&&value[key].length<=80&&Number.isFinite(Date.parse(value[key]))?value[key]:null;
    const knownErrors=new Set(['BACKUP_CAPACITY','BACKUP_SOURCE_MISSING','BACKUP_INTEGRITY','BACKUP_FAILED']);
    return {status:value.status,lastAttemptAt:safeDate('lastAttemptAt'),lastSuccessAt:safeDate('lastSuccessAt'),sizeBytes:Number.isSafeInteger(value.sizeBytes)&&value.sizeBytes>=0?value.sizeBytes:null,errorCode:knownErrors.has(value.errorCode)?value.errorCode:null};
  }catch(error){return {status:error.code==='ENOENT'?'not_configured':'unavailable'};}finally{await handle?.close();}
}

const ADMIN_READS_PER_MINUTE=60;
/** Public policy only: never include credentials, identities, paths or raw config. */
export function limitStandards({ai,auth,now=Date.now}){
  const usage=ai.adminSummary(),operation=ai.limitSummary(),login=auth.adminReader.limitSummary(),mail=login.email;
  const effective={ai:{dailyOrganize:usage.dailyRequestLimit,dailyQuestions:usage.dailyQuestionLimit,dailyBudgetRmb:usage.dailyBudgetRmb,organizeAccountFiveHours:usage.accountFiveHourLimit,organizeAccount72Hours:usage.accountThreeDayLimit,organizeIPFiveHours:usage.ipFiveHourLimit,questionAccountFiveHours:usage.questionAccountFiveHourLimit,questionAccount72Hours:usage.questionAccountThreeDayLimit,questionIPFiveHours:usage.questionIPFiveHourLimit,...operation},download:{...APK_DOWNLOAD_LIMITS},auth:login,sync:{...SYNC_LIMITS},input:{...ANALYSIS_LIMITS},admin:{readsPerMinute:ADMIN_READS_PER_MINUTE}};
  const row=(id,label,value,unit,scope,window,notes='',changeControl='代码配置')=>({id,label,value,unit,scope,window,display:String(value)+(unit?' '+unit:''),notes,changeControl});
  const a=effective.ai,d=effective.download,c=effective.input,s=effective.sync;
  const groups=[
    {id:'ai',title:'AI 整理与提问',rows:[
      row('organize-account-5h','整理次数',a.organizeAccountFiveHours,'次','每账号','滚动五小时'),
      row('organize-account-72h','整理次数',a.organizeAccount72Hours,'次','每账号','滚动三天（72小时）'),
      row('organize-ip-5h','整理次数',a.organizeIPFiveHours,'次','每 IP','滚动五小时'),
      row('organize-site-day','整理次数',a.dailyOrganize,'次','全站','上海自然日','','部署配置 DAILY_REQUEST_LIMIT'),
      row('question-account-5h','提问次数',a.questionAccountFiveHours,'次','每账号','滚动五小时'),
      row('question-account-72h','提问次数',a.questionAccount72Hours,'次','每账号','滚动三天（72小时）'),
      row('question-ip-5h','提问次数',a.questionIPFiveHours,'次','每 IP','滚动五小时'),
      row('question-site-day','提问次数',a.dailyQuestions,'次','全站','上海自然日'),
      row('ai-money-day','整理与提问共用预算',a.dailyBudgetRmb,'元','全站','上海自然日','保守估算，不是模型平台账单；单次调用先预留预算。','部署配置 AI_DAILY_BUDGET_RMB'),
      row('ai-account-burst','AI 请求频率',a.accountBurst,'次','每账号','滚动三分钟','整理与提问共用短时频率；缓存及同请求重放不重复收费。'),
      row('ai-ip-burst','已登录 AI 请求频率',a.authenticatedIPBurst,'次','每 IP','滚动三分钟'),
      row('ai-concurrency','模型并发',a.modelConcurrent,'条','全站','同时处理','忙时请稍后再试，不自动发起付费重试。'),
      row('ai-image-threshold','高频 AI 图形验证',a.imageRequestThreshold,'次起','每账号；无账号按 IP','同一滚动三分钟','达到本次计数时要求图片验证。'),
      row('ai-image-life','AI 图片验证码有效期',a.imageLifetimeMs/1000,'秒','每张图','签发后'),
      row('ai-image-attempts','AI 图片验证码尝试',a.imageAttempts,'次','每张图','有效期内'),
      row('ai-image-refresh','AI 换图间隔',a.imageRefreshMs/1000,'秒','同一验证范围','两次换图之间'),
      row('ai-cache','免费整理缓存',a.cacheEntries,'条','服务内存','最长 '+a.cacheTTLms/60000+' 分钟','重启后缓存可丢失；已保存任务和同请求编号仍按原规则恢复。')
    ]},
    {id:'download',title:'安卓主下载',rows:[
      row('download-day','每日预留下载总量',d.dailyBytes/1_000_000,'MB','主站及阿里云兼容入口共用','上海自然日',`${d.dailyBytes/1_000_000} MB = ${d.dailyBytes.toLocaleString('en-US')} 字节；不是服务器套餐余额；失败、取消不退预留。`),
      row('download-speed','单条最高速度',d.bytesPerSecond/1_000_000,'MB/秒','每条下载','传输期间'),
      row('download-ip-concurrency','下载并发',d.ipConcurrent,'条','每 IP','同时进行'),
      row('download-site-concurrency','下载并发',d.globalConcurrent,'条','全站','同时进行'),
      row('download-ip-hour','开始下载次数',d.ipDownloadsPerHour,'次','每 IP','滚动一小时'),
      row('download-captcha-hour','获取验证码次数',d.captchasPerIPHour,'张','每 IP','滚动一小时'),
      row('download-image-life','下载验证码有效期',d.captchaLifetimeMs/60000,'分钟','每张图','签发后','每次新下载都需四位图片验证码。'),
      row('download-image-attempts','下载验证码尝试',d.captchaAttempts,'次','每张图','有效期内'),
      row('download-image-refresh','下载换图间隔',d.captchaRefreshMs/1000,'秒','每 IP','两次换图之间'),
      row('download-ticket','一次性下载凭证有效期',d.ticketLifetimeMs/1000,'秒','每个凭证','验证后','凭证绑定来源、IP、版本，只能使用一次。')
    ]},
    {id:'login',title:'登录与图片验证码',rows:[
      row('login-ip-minute','密码登录频率',login.loginIPMinute,'次','每 IP','滚动一分钟'),
      row('login-ip-hour','密码登录频率',login.loginIPHour,'次','每 IP','滚动一小时'),
      row('login-account-minute','密码登录频率',login.loginUserMinute,'次','每账号','滚动一分钟'),
      row('login-account-hour','密码登录频率',login.loginUserHour,'次','每账号','滚动一小时'),
      row('auth-image-client-minute','登录／注册图形码获取',login.challengeClientMinute,'张','每客户端','滚动一分钟'),
      row('auth-image-ip-minute','登录／注册图形码获取',login.challengeIPMinute,'张','每 IP','滚动一分钟'),
      row('auth-image-ip-hour','登录／注册图形码获取',login.challengeIPHour,'张','每 IP','滚动一小时'),
      row('auth-image-refresh','登录／注册换图间隔',login.imageRefreshMs/1000,'秒','每客户端','两次换图之间'),
      row('auth-image-life','登录／注册验证码有效期',login.imageLifetimeMs/60000,'分钟','每张图','签发后'),
      row('auth-image-attempts','登录／注册验证码尝试',login.imageAttempts,'次','每张图','有效期内'),
      row('auth-image-pending','待处理登录图形码',login.imagePending,'张','全站','同时保留'),
      row('auth-hash-concurrency','密码计算并发',login.hashConcurrent,'个','全站','同时进行'),
      row('accounts-capacity','注册账号容量',login.accountLimit,'个','全站','当前保留的账号'),
      row('sessions','每账号设备会话',login.deviceSessions,'个','每账号','保留最新会话'),
      row('session-life','登录状态有效期',login.sessionLifetimeMs/86400000,'天','每设备会话','活跃时续期'),
      row('invite-register-minute','兼容邀请码注册',login.registerIPMinute,'次','每 IP','固定一分钟'),
      row('invite-register-day','兼容邀请码注册',login.registerIPDay,'次','每 IP','UTC 自然日','常规邮箱注册使用下面的独立限制。')
    ]},
    {id:'mail',title:'邮箱验证码与注册',rows:[
      row('mail-enabled','邮箱发送',mail.enabled?'已启用':'未启用','','当前服务','运行配置','','部署配置 MAIL_LOGIN_ENABLED'),
      row('mail-hour','发送验证码邮件',mail.emailSendHour,'封','每邮箱','滚动一小时'),
      row('mail-day','发送验证码邮件',mail.emailSendDay,'封','每邮箱','滚动24小时'),
      row('mail-ip-hour','发送验证码邮件',mail.emailSendIPHour,'封','每 IP','滚动一小时'),
      row('mail-ip-day','发送验证码邮件',mail.emailSendIPDay,'封','每 IP','滚动24小时'),
      row('mail-site-day','发送验证码邮件',mail.emailSendGlobalDay,'封','全站','滚动24小时','达到任一邮件日上限后，另暂停至上海次日零点；原滚动计数仍正常到期。'),
      row('mail-failure-day','真实发信失败熔断',mail.emailSendFailureDay,'次','全站','上海自然日','实际 SMTP 发送失败达到上限，暂停当天发信；猜错验证码不触发此熔断。'),
      row('mail-concurrency','发信并发',mail.emailSendConcurrency,'封','全站','同时进行'),
      row('mail-resend','邮件重发间隔',mail.resendMs/1000,'秒','每邮箱','两次发送之间'),
      row('mail-code-life','邮件验证码有效期',mail.lifetimeMs/60000,'分钟','每个验证码','发出后'),
      row('mail-code-attempts','邮件验证码尝试',mail.attempts,'次','每个验证码','有效期内','新客户端四位，旧六位客户端继续兼容。'),
      row('mail-verify-ip-minute','无效邮件验证码请求',mail.emailVerifyIPMinute,'次','每 IP','滚动一分钟'),
      row('mail-register-ip-minute','邮箱注册账号',mail.emailRegisterIPMinute,'个','每 IP','滚动一分钟'),
      row('mail-register-ip-day','邮箱注册账号',mail.emailRegisterIPDay,'个','每 IP','滚动24小时'),
      row('mail-register-site-day','邮箱注册账号',mail.emailRegisterGlobalDay,'个','全站','滚动24小时')
    ]},
    {id:'input',title:'正文与模型请求',rows:[
      row('notice-count','一次整理来源数量',c.sources,'条','每次整理','本次请求'),
      row('notice-chars','通知原文合计长度',c.noticeCharacters,'字符','每次整理；提问原文','本次请求','程序按字符串长度检查。'),
      row('question-chars','问题长度',c.questionCharacters,'字符','每次提问','本次请求'),
      row('answer-chars','回答长度',c.answerCharacters,'字符','每次提问结果','本次返回'),
      row('evidence-count','提问原文依据',c.evidenceItems,'条','每次提问结果','每条最多 '+c.evidenceCharacters+' 字符，合计 '+c.evidenceTotalCharacters+' 字符'),
      row('ai-body','AI 请求体大小',a.bodyBytes/1000,'KB','每次请求','传输时'),
      row('auth-body','账号请求体大小',login.bodyBytes/1024,'KiB','每次请求','传输时'),
      row('model-timeout','当前模型请求超时',a.modelTimeoutMs/1000,'秒','每次整理或提问','从模型调用开始','当前思考模式：'+a.thinkingMode+'。','部署配置 AI_THINKING_MODE'),
      row('model-organize-tokens','整理输出上限',a.organizeOutputTokens,'Token','每次整理','包括模型思考消耗'),
      row('model-question-tokens','提问输出上限',c.questionTokens,'Token','每次提问','包括模型思考消耗')
    ]},
    {id:'sync',title:'云同步与任务容量',rows:[
      row('sync-rate','同步频率',s.requestsPerMinute,'次','每账号','滚动一分钟'),
      row('sync-create-ip-day','首次创建云同步空间',s.createPerIPDay,'个','每 IP','上海自然日','现有账号登录不重复占用创建次数。'),
      row('sync-create-site-day','首次创建云同步空间',s.createGlobalDay,'个','全站','上海自然日'),
      row('sync-changes','一次上传同步变更',s.changesPerRequest,'条','每次请求','本次传输'),
      row('sync-account-count','云同步账号容量',s.accounts,'个','全站','当前保留的账号'),
      row('sync-live','云通知数量',s.liveRecords,'条','每账号','当前通知'),
      row('sync-account-bytes','云通知文字容量',s.accountBytes/1048576,'MiB','每账号','当前保存'),
      row('sync-global-bytes','云通知文字容量',s.globalBytes/1048576,'MiB','全站','当前保存'),
      row('sync-record','单条云通知大小',s.recordBytes/1024,'KiB','每条通知','当前保存'),
      row('sync-history','云通知历史条目',s.historyRecords,'条','每账号','含删除记录；不是版本备份数'),
      row('sync-body','同步请求体',s.bodyBytes/1048576,'MiB','每次请求','本次传输'),
      row('sync-page','单页同步返回',s.pageRecords,'条','每次分页','最多 '+s.pageBytes/1024+' KiB'),
      row('jobs-account-count','保存的整理任务',s.accountJobs,'条','每账号','当前保存'),
      row('jobs-one','单个整理任务空间',s.jobBytes/1024,'KiB','每个任务','含输入与结果，接收时预留'),
      row('jobs-account-bytes','整理任务保存空间',s.accountJobBytes/1048576,'MiB','每账号','当前保存'),
      row('jobs-global-bytes','整理任务保存空间',s.globalJobBytes/1048576,'MiB','全站','当前保存')
    ]},
    {id:'admin',title:'后台读取',rows:[row('admin-reads','后台读取频率',ADMIN_READS_PER_MINUTE,'次','每管理员账号','滚动一分钟','后台当前只读；不开放在线改额度或权限。')]}
  ];
  return {schemaVersion:1,generatedAt:new Date(now()).toISOString(),readOnly:true,timeZone:'Asia/Shanghai',status:'effective',notice:'按下表当前生效值执行。滚动窗口按每条记录到期释放，上海自然日零点重置；不同入口共用计数。',effective,groups};
}

/** Only deployment configuration grants this read-only capability. User input,
 * synced records, request headers and registered display names cannot grant it. */
export function createAdminService(config,{auth,sync,ai,now=Date.now}){
  const names=new Set((config.usernames||[]).map(canonicalUsername));
  const userIDs=new Set((config.userIDs||[]).map(value=>{
    if(typeof value!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.trim()))throw new Error('ADMIN_USER_IDS contains an invalid account ID');
    return value.trim().toLowerCase();
  }));
  // Pin already-existing account UUIDs at boot. Registering an allowed-looking
  // name after startup cannot turn a normal account into an administrator.
  const owners=new Set(auth.adminReader.list({limit:500}).filter(account=>names.has(account.username)||userIDs.has(account.id)).map(account=>account.id));
  const origins=new Set(config.allowedOrigins||[]);
  const rates=new Map(),enabled=names.size>0||userIDs.size>0;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
  return async function handle(request){
    const url=new URL(request.url),origin=request.headers.get('Origin'),accepted=origins.has(origin);
    const reply=(body,status=200)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Vary':'Origin',...(accepted?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'}:{})}});
    if(!enabled)return reply({error:'接口不存在。'},404);
    if(url.pathname==='/admin'||url.pathname==='/admin/'){
      if(!['GET','HEAD'].includes(request.method))return reply({error:'请使用支持的请求方法。'},405);
      const nonce=randomBytes(24).toString('base64');
      return new Response(request.method==='HEAD'?null:adminHtml(nonce),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; base-uri 'none'; frame-ancestors 'none'; frame-src https://kemou2333.github.io; form-action 'self'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'`}});
    }
    if(!accepted)return reply({error:'此应用未获准访问后台。'},403);
    if(request.method==='OPTIONS')return reply({},204);
    if(!['GET','POST'].includes(request.method))return reply({error:'后台仅支持读取。'},405);
    const key=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1],identity=key?auth.getIdentity(key):null;
    if(!identity)return reply({error:'请先登录管理员账号。',code:'AUTH_REQUIRED'},401);
    if(identity.provider!=='invite'||!owners.has(identity.subject))return reply({error:'此账号没有后台权限。'},403);
    const t=now(),times=(rates.get(identity.subject)||[]).filter(time=>t-time<60000);
    if(times.length>=ADMIN_READS_PER_MINUTE)return reply({error:'后台刷新较多，请稍后再试。'},429);
    times.push(t);rates.set(identity.subject,times);
    for(const [id,entries] of rates)if(!entries.some(time=>t-time<60000))rates.delete(id);
    try{
      if(request.method==='POST'){
        if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))throw new ServiceError('读取请求必须使用 JSON。',415);
        let value;try{value=JSON.parse(await boundedText(request.body,1024));}catch{throw new ServiceError('读取请求格式不正确。',400);}
        if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length)throw new ServiceError('后台不接受修改参数。',400);
      }
      if(url.pathname==='/admin/limits')return reply(limitStandards({ai,auth,now}));
      if(url.pathname==='/admin/summary')return reply({accounts:auth.adminReader.count(),...sync.adminReader.summary(),daily:sync.adminReader.daily(),usage:ai.adminSummary(),backup:await backupSummary(config.backupStateFile),readOnly:true});
      if(url.pathname==='/admin/test-runs')return reply({records:adminTestRuns(),readOnly:true,includedInBusinessStatistics:false});
      if(url.pathname==='/admin/accounts'){
        const raw=url.searchParams.get('offset')||'0';if(!/^\d{1,5}$/.test(raw))throw new ServiceError('分页位置不正确。',400);
        const offset=Number(raw),accounts=auth.adminReader.list({offset,limit:51}),hasMore=accounts.length>50;
        return reply({accounts:accounts.slice(0,50).map(account=>({...account,accountLabel:account.email||'旧账号',...sync.adminReader.accountStats(account.id)})),hasMore,nextOffset:hasMore?offset+50:null});
      }
      const recordsPath=url.pathname.match(/^\/admin\/accounts\/([0-9a-f-]{36})\/records(?:\/(.+))?$/);
      if(recordsPath){
        const subject=recordsPath[1];
        if(recordsPath[2]){
          let id;try{id=decodeURIComponent(recordsPath[2]);if(!id||id.length>150||id!==id.trim())throw 0;}catch{throw new ServiceError('通知编号不正确。',400);}
          const result=sync.adminReader.record(subject,id);return result?reply(result):reply({error:'通知不存在或已删除。'},404);
        }
        const raw=url.searchParams.get('before');let before;
        if(raw){try{if(raw.length>1024)throw 0;before=JSON.parse(Buffer.from(raw,'base64url').toString());if(!Array.isArray(before)||before.length!==2||!Number.isSafeInteger(before[0])||before[0]<1||typeof before[1]!=='string'||!before[1]||before[1].length>150)throw 0;}catch{throw new ServiceError('分页位置不正确。',400);}}
        const rows=sync.adminReader.records({subject,before,limit:21}),hasMore=rows.length>20,records=rows.slice(0,20),last=records.at(-1);
        return reply({records,hasMore,nextBefore:hasMore?Buffer.from(JSON.stringify([last.version,last.id])).toString('base64url'):null});
      }
      if(url.pathname==='/admin/jobs'){
        const subject=url.searchParams.get('account')||undefined,beforeRaw=url.searchParams.get('before');
        if(subject&&!/^[0-9a-f-]{36}$/.test(subject))throw new ServiceError('账号编号不正确。',400);
        let before;
        if(beforeRaw){try{if(beforeRaw.length>500)throw 0;before=JSON.parse(Buffer.from(beforeRaw,'base64url').toString());if(!Array.isArray(before)||before.length!==2||typeof before[0]!=='string'||!Number.isFinite(Date.parse(before[0]))||typeof before[1]!=='string'||!/^[0-9a-f-]{36}$/.test(before[1]))throw 0;}catch{throw new ServiceError('分页位置不正确。',400);}}
        const rows=sync.adminReader.jobs({subject,before,limit:21}),hasMore=rows.length>20,jobs=rows.slice(0,20),last=jobs.at(-1);
        const accountsByID=new Map(auth.adminReader.list({limit:500}).map(account=>[account.id,account]));
        return reply({jobs:jobs.map(job=>{const account=accountsByID.get(job.ownerSubject);return {...job,accountLabel:account?(account.email||'旧账号'):'已停用账号',...(account?.email?{email:account.email}:{})};}),hasMore,nextBefore:hasMore?Buffer.from(JSON.stringify([last.createdAt,last.id])).toString('base64url'):null});
      }
      if(/^\/admin\/jobs\/[0-9a-f-]{36}$/.test(url.pathname)){
        const job=sync.adminReader.job(url.pathname.split('/').at(-1));
        return job?reply({job}):reply({error:'任务不存在。'},404);
      }
      return reply({error:'接口不存在。'},404);
    }catch(error){return reply({error:error instanceof ServiceError?error.message:'后台暂时无法读取。'},error.status||503);}
  };
}
