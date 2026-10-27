import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {open,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isIP} from 'node:net';
import {isAbsolute,join,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {createImageCaptcha,captchaAnswerHash} from './image-captcha.mjs';

const DAILY_BYTES=500_000_000,BYTES_PER_SECOND=2_000_000,HOUR=3_600_000;
const CAPTCHA_LIFETIME=300_000,TICKET_LIFETIME=120_000,REFRESH_INTERVAL=10_000;
const MAX_DOWNLOADS_PER_HOUR=8,MAX_ACTIVE=8,MAX_CAPTCHAS_PER_HOUR=20,CHUNK_BYTES=64*1024;
export const APK_DOWNLOAD_LIMITS=Object.freeze({dailyBytes:DAILY_BYTES,bytesPerSecond:BYTES_PER_SECOND,hourMs:HOUR,captchaLifetimeMs:CAPTCHA_LIFETIME,ticketLifetimeMs:TICKET_LIFETIME,captchaRefreshMs:REFRESH_INTERVAL,ipDownloadsPerHour:MAX_DOWNLOADS_PER_HOUR,globalConcurrent:MAX_ACTIVE,ipConcurrent:1,captchasPerIPHour:MAX_CAPTCHAS_PER_HOUR,captchaAttempts:5});
const VERSION='(?:0|[1-9]\\d{0,3})\\.(?:0|[1-9]\\d{0,3})\\.(?:0|[1-9]\\d{0,3})';
const routePattern=new RegExp('^/downloads/android-v('+VERSION+')/(campus-inbox-\\1\\.apk)$');
const hashPattern=/^[a-f0-9]{64}$/,keyPattern=/^[A-Za-z0-9_-]{43}$/;
const tokenPattern=/^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/;
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const safeTime=value=>Number.isSafeInteger(value)&&value>=0;
const htmlEscape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const shanghaiDay=time=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
const midnightWait=time=>Math.max(1,Math.ceil((86_400_000-((time+8*3_600_000)%86_400_000))/1000));
const githubFor=version=>'https://github.com/Kemou2333/campus-inbox/releases/download/android-v'+version+'/campus-inbox-'+version+'.apk';
const canonicalGithubFor=version=>githubFor(version).replace('/Kemou2333/campus-inbox/','/Kemou2333/note-inbox/');
// Preserve the fixed legacy metadata contract for installed APKs.
const githubForOrigin=(version,publicOrigin)=>new URL(publicOrigin).hostname==='kemou.top'?canonicalGithubFor(version):githubFor(version);
const pathnameFor=release=>'/downloads/android-v'+release.version+'/'+release.filename;
function publicOriginsFor(config){
  const aliases=config.publicOriginAliases??[];
  if(!Array.isArray(aliases)||aliases.length>16)throw new Error('APK download public aliases must be a bounded array');
  const byHost=new Map();
  for(const [index,value] of [config.publicOrigin,...aliases].entries()){
    let url;try{url=new URL(value);}catch{throw new Error('APK download public origin must be exact HTTPS');}
    const hostname=url.hostname.startsWith('[')?url.hostname.slice(1,-1):url.hostname;
    const validHost=isIP(hostname)||hostname.length<=253&&hostname.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
    // Keep the existing loopback-only development origin; aliases are HTTPS only.
    if(typeof value!=='string'||url.origin!==value||!validHost||url.port==='0'||!(url.protocol==='https:'||index===0&&url.protocol==='http:'&&hostname==='127.0.0.1'))throw new Error('APK download public origin must be exact HTTPS');
    if(byHost.has(url.host)&&byHost.get(url.host)!==value)throw new Error('APK download public origins must have distinct hosts');
    byHost.set(url.host,value);
  }
  return byHost;
}
function validIP(value){
  if(typeof value!=='string'||value.includes('%')||!isIP(value))return null;
  if(value.toLowerCase().startsWith('::ffff:')&&isIP(value.slice(7))===4)return value.slice(7);
  return isIP(value)===6?new URL('http://['+value+']/').hostname.slice(1,-1):value;
}
function validateState(state){
  const validMap=(map,limit)=>map&&typeof map==='object'&&!Array.isArray(map)&&Object.keys(map).length<=2000&&Object.entries(map).every(([key,times])=>keyPattern.test(key)&&Array.isArray(times)&&times.length<=limit&&times.every(safeTime));
  if(!exactKeys(state,['version','day','reservedBytes','downloads','captchaRequests'])||state.version!==1||!/^\d{4}-\d{2}-\d{2}$/.test(state.day)||!Number.isSafeInteger(Date.parse(state.day+'T00:00:00+08:00'))
    ||!Number.isSafeInteger(state.reservedBytes)||state.reservedBytes<0||state.reservedBytes>DAILY_BYTES
    ||!validMap(state.downloads,MAX_DOWNLOADS_PER_HOUR)||!validMap(state.captchaRequests,MAX_CAPTCHAS_PER_HOUR))throw new Error('Invalid APK download state');
}
function validateManifest(value){
  if(!exactKeys(value,['schemaVersion','releases'])||value.schemaVersion!==1||!Array.isArray(value.releases)||!value.releases.length||value.releases.length>32)throw new Error('Invalid APK release index');
  const releases=new Map();
  for(const release of value.releases){
    if(!exactKeys(release,['version','filename','sha256','size','github'])||typeof release.version!=='string'||!new RegExp('^'+VERSION+'$').test(release.version)
      ||release.filename!=='campus-inbox-'+release.version+'.apk'||typeof release.sha256!=='string'||!hashPattern.test(release.sha256)
      ||!Number.isSafeInteger(release.size)||release.size<1||release.size>DAILY_BYTES||![githubFor(release.version),canonicalGithubFor(release.version)].includes(release.github)||releases.has(release.version))throw new Error('Invalid APK release entry');
    releases.set(release.version,release);
  }
  return releases;
}
async function readSmallJSON(file,maximum){
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const stat=await handle.stat();if(!stat.isFile()||stat.size<2||stat.size>maximum)throw new Error('Invalid bounded JSON file');const buffer=Buffer.alloc(maximum+1);let size=0;while(size<=maximum){const {bytesRead}=await handle.read(buffer,size,maximum+1-size,size);if(!bytesRead)break;size+=bytesRead;}if(size>maximum)throw new Error('Oversized JSON file');return JSON.parse(buffer.subarray(0,size).toString('utf8'));}finally{await handle.close();}
}
function parseForm(req){
  return new Promise((resolve,reject)=>{
    let chunks=[],size=0,finished=false;
    const timer=setTimeout(()=>fail(408),5000);timer.unref?.();
    function cleanup(){clearTimeout(timer);req.removeListener('data',data);req.removeListener('end',end);req.removeListener('error',failed);req.removeListener('aborted',failed);}
    function fail(status=400){if(finished)return;finished=true;cleanup();req.pause();const error=new Error('Invalid download form');error.status=status;reject(error);}
    function failed(){fail(400);}
    function data(chunk){size+=chunk.length;if(size>1024)return fail(413);chunks.push(chunk);}
    function end(){if(finished)return;finished=true;cleanup();const text=Buffer.concat(chunks).toString('utf8');chunks=[];
      if(/%(?![a-f\d]{2})/i.test(text)){const error=new Error('Invalid URL encoding');error.status=400;return reject(error);}
      const form=new URLSearchParams(text);if([...form.keys()].length!==2||form.getAll('challenge').length!==1||form.getAll('answer').length!==1||[...form.keys()].some(key=>!['challenge','answer'].includes(key))){const error=new Error('Invalid form fields');error.status=400;return reject(error);}resolve({token:form.get('challenge'),answer:form.get('answer')});
    }
    req.on('data',data);req.once('end',end);req.once('error',failed);req.once('aborted',failed);
  });
}
async function* assetChunks(handle,size,signal){
  let at=0;while(at<size){if(signal.aborted)throw new Error('Download closed');const buffer=Buffer.allocUnsafe(Math.min(CHUNK_BYTES,size-at)),{bytesRead}=await handle.read(buffer,0,buffer.length,at);if(!bytesRead)throw new Error('APK asset truncated');at+=bytesRead;yield buffer.subarray(0,bytesRead);}
}
const waitForDrain=(res,signal)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>done(new Error('Slow download connection')),30_000);timer.unref?.();
  const abort=()=>done(new Error('Download closed')),ready=()=>done(),failed=error=>done(error);
  function done(error){clearTimeout(timer);res.removeListener('drain',ready);res.removeListener('close',abort);res.removeListener('error',failed);signal.removeEventListener('abort',abort);error?reject(error):resolve();}
  res.once('drain',ready);res.once('close',abort);res.once('error',failed);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
});
const finishResponse=res=>new Promise((resolve,reject)=>{
  const closed=()=>done(new Error('Download closed')),finished=()=>done(),failed=error=>done(error);
  function done(error){res.removeListener('finish',finished);res.removeListener('close',closed);res.removeListener('error',failed);error?reject(error):resolve();}
  res.once('finish',finished);res.once('close',closed);res.once('error',failed);res.end();
});

/** A separate, single-process download gate. It never reads accounts or invokes AI. */
export async function createAPKDownloads(config,options={}){
  if(!config||!['directory','releaseManifestFile','stateFile'].every(key=>typeof config[key]==='string'&&isAbsolute(config[key]))||typeof config.signingSecret!=='string'||config.signingSecret.length<20)throw new Error('APK download configuration is incomplete');
  const publicOrigins=publicOriginsFor(config);
  function publicOriginFor(req){
    const host=req.headers.host;
    // Exact configured authorities only. Never derive a redirect from Origin or
    // forwarded headers; reject duplicated Host before Node's first-value view.
    if(typeof host!=='string'||host.length>259||!/^[A-Za-z0-9.:[\]-]+$/.test(host))return null;
    if(Array.isArray(req.rawHeaders)&&req.rawHeaders.filter((_,index)=>index%2===0&&req.rawHeaders[index].toLowerCase()==='host').length!==1)return null;
    return publicOrigins.get(host.toLowerCase())||null;
  }
  const now=options.now||Date.now,monotonicNow=options.monotonicNow||(()=>performance.now()),sleep=options.sleep||((ms,signal)=>delay(ms,undefined,{signal})),imageCaptcha=options.imageCaptcha||createImageCaptcha;
  const sign=value=>createHmac('sha256',config.signingSecret).update(value).digest('base64url');
  const challenges=new Map(),tickets=new Map(),active=new Map(),verifiedAssets=new Map();
  let state,unavailable=false,queue=Promise.resolve(),closed=false;
  try{state=await readSmallJSON(config.stateFile,1_000_000);validateState(state);}catch(error){if(error.code==='ENOENT')state={version:1,day:shanghaiDay(now()),reservedBytes:0,downloads:{},captchaRequests:{}};else unavailable=true;}
  function prune(time){
    if(shanghaiDay(time)<state.day)throw new Error('APK state date is in the future');
    if(state.day!==shanghaiDay(time)){state.day=shanghaiDay(time);state.reservedBytes=0;}
    for(const map of [state.downloads,state.captchaRequests])for(const [key,times] of Object.entries(map)){const alive=times.filter(at=>time-at<HOUR);if(alive.length)map[key]=alive;else delete map[key];}
    for(const [key,value] of challenges)if(value.expires<=time)challenges.delete(key);
    for(const [key,value] of tickets)if(value.expires<=time)tickets.delete(key);
  }
  async function persist(){
    const temporary=config.stateFile+'.tmp-'+process.pid+'-'+randomBytes(8).toString('hex');
    try{const file=await open(temporary,'wx',0o600);try{await file.writeFile(JSON.stringify(state));await file.sync();}finally{await file.close();}await rename(temporary,config.stateFile);const directory=await open(dirname(config.stateFile),constants.O_RDONLY);try{await directory.sync();}finally{await directory.close();}}catch(error){await unlink(temporary).catch(()=>{});unavailable=true;throw error;}
  }
  function ledger(action){const run=queue.catch(()=>{}).then(async()=>{if(unavailable||closed)throw new Error('APK downloads unavailable');prune(now());return action();});queue=run.catch(()=>{});return run;}
  async function releases(){return validateManifest(await readSmallJSON(config.releaseManifestFile,65536));}
  async function releaseFor(version){return (await releases()).get(version);}
  async function latest(req,res,publicOrigin){
    if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return html(req,res,405,'请使用浏览器读取更新信息。');}
    try{
      const approved=[...(await releases()).values()];
      approved.sort((left,right)=>{const a=left.version.split('.').map(Number),b=right.version.split('.').map(Number);for(let i=0;i<3;i++)if(a[i]!==b[i])return b[i]-a[i];return 0;});
      const release=approved[0],body=JSON.stringify({version:release.version,aliyun:publicOrigin+pathnameFor(release),github:githubForOrigin(release.version,publicOrigin),lanzou:null,sizeBytes:release.size,sha256:release.sha256});
      securityHeaders(res,undefined,publicOrigin);res.statusCode=200;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Length',Buffer.byteLength(body));res.end(req.method==='HEAD'?undefined:body);
    }catch{html(req,res,503,'更新信息暂时不可用，请稍后再试。');}
  }
  const tokenFor=(kind,value)=>value.id+'.'+sign('apk:'+kind+':'+value.id+':'+value.ipKey+':'+value.version+':'+value.expires+':'+value.publicOrigin);
  function tokenRecord(kind,token,map,ipKey,version,publicOrigin){
    if(typeof token!=='string'||!tokenPattern.test(token))return null;
    const value=map.get(token.split('.')[0]);if(!value||value.ipKey!==ipKey||value.version!==version||value.publicOrigin!==publicOrigin||value.expires<=now())return null;
    const expected=tokenFor(kind,value);return timingSafeEqual(Buffer.from(token),Buffer.from(expected))?value:null;
  }
  function securityHeaders(res,nonce,publicOrigin=config.publicOrigin){
    res.setHeader('Cache-Control','no-store, private');res.setHeader('Pragma','no-cache');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'none'; img-src data:; style-src "+(nonce?"'nonce-"+nonce+"'":"'none'")+"; form-action "+publicOrigin+"; base-uri 'none'; frame-ancestors 'none'");
  }
  function html(req,res,status,message,release,challenge,retry){
    for(const name of ['Content-Disposition','Accept-Ranges','X-Download-Options'])res.removeHeader(name);
    // A navigation POST gets Origin:null under no-referrer in Chrome. Preserve the
    // same-origin form source without sending referrers to the GitHub fallback.
    const publicOrigin=publicOriginFor(req)||config.publicOrigin;
    const nonce=randomBytes(16).toString('base64');securityHeaders(res,nonce,publicOrigin);res.setHeader('Referrer-Policy','same-origin');res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');if(retry)res.setHeader('Retry-After',String(retry));
    const path=release?pathnameFor(release):'/downloads/',action=publicOrigin+path;
    const form=challenge?'<form method="post" action="'+htmlEscape(action)+'"><label for="answer">图中的四位数字</label><img src="'+htmlEscape(challenge.image)+'" width="240" height="88" alt="四位数字验证码"><input type="hidden" name="challenge" value="'+htmlEscape(tokenFor('challenge',challenge))+'"><input id="answer" name="answer" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" required aria-label="四位数字验证码"><button type="submit">验证并下载</button></form>':'';
    const links=release?'<p><a href="'+htmlEscape(action)+'">'+(challenge?'换一张验证码':'重新获取验证码')+'</a><span class="muted"> · 换图需间隔'+REFRESH_INTERVAL/1000+'秒</span></p><p class="backup"><a href="'+htmlEscape(githubForOrigin(release.version,publicOrigin))+'" rel="noopener noreferrer">GitHub 备用下载</a></p>':'';
    const body='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>拾笺 · Note Inbox · 安卓下载</title><style nonce="'+nonce+'">*{box-sizing:border-box}body{margin:0;background:#f4f7f6;color:#193a37;font:16px/1.7 system-ui,sans-serif}main{max-width:480px;margin:32px auto;padding:24px;background:#fff;border:1px solid #dce8e4;border-radius:20px}h1{font-size:25px;line-height:1.3}p{overflow-wrap:anywhere}label{display:block;font-weight:600;margin-top:20px}img{display:block;max-width:100%;object-fit:contain;margin:8px 0}input,button{font:inherit;border-radius:12px;min-height:48px;padding:10px 14px}input:not([type=hidden]){width:100%;border:1px solid #a9c4bd;font-size:22px;letter-spacing:.3em}button{width:100%;margin-top:14px;border:0;background:#087f71;color:white;font-weight:600;cursor:pointer}a{color:#087f71;text-underline-offset:3px}.muted,small{color:#627b74;font-size:14px}.backup{border-top:1px solid #e1ebe7;padding-top:18px}@media(max-width:520px){main{margin:12px;padding:20px}}</style></head><body><main><h1>拾笺 · Note Inbox 安卓下载</h1>'+(release?'<p class="muted">版本 '+htmlEscape(release.version)+' · '+(release.size/1_000_000).toFixed(2)+' MB</p>':'')+'<p role="status">'+htmlEscape(message)+'</p>'+form+links+'<small>每次下载前验证。主下载每日总量500 MB，每个网络每小时最多8次下载、同时1次；单条最高2 MB/s。额度用完时可选择GitHub备用下载。</small></main></body></html>';
    res.setHeader('Content-Length',Buffer.byteLength(body));res.end(req.method==='HEAD'?undefined:body);
  }
  function apkHeaders(res,release,publicOrigin){securityHeaders(res,undefined,publicOrigin);res.statusCode=200;res.setHeader('Content-Type','application/vnd.android.package-archive');res.setHeader('Content-Disposition','attachment; filename="'+release.filename+'"');res.setHeader('Content-Length',String(release.size));res.setHeader('Accept-Ranges','none');res.setHeader('X-Download-Options','noopen');}
  async function issueChallenge(ipKey,version,publicOrigin){
    return ledger(async()=>{
      const time=now(),times=state.captchaRequests[ipKey]||[],previous=[...challenges.values()].find(value=>value.ipKey===ipKey);
      if(times.length&&time-times.at(-1)<REFRESH_INTERVAL){
        if(previous?.version===version&&previous.publicOrigin===publicOrigin&&previous.attempts<APK_DOWNLOAD_LIMITS.captchaAttempts)return {challenge:previous};
        return {status:429,message:'请稍候再更换验证码。',retry:Math.max(1,Math.ceil((times.at(-1)+REFRESH_INTERVAL-time)/1000))};
      }
      if(times.length>=MAX_CAPTCHAS_PER_HOUR)return {status:429,message:'验证码请求较多，请稍后再试，或使用GitHub备用下载。',retry:Math.max(1,Math.ceil((times[0]+HOUR-time)/1000))};
      if(challenges.size>=512||!state.captchaRequests[ipKey]&&Object.keys(state.captchaRequests).length>=2000)return {status:503,message:'下载验证暂时繁忙，请稍后再试。'};
      state.captchaRequests[ipKey]=[...times,time];await persist();
      if(previous)challenges.delete(previous.id);
      const id=randomBytes(16).toString('hex'),image=imageCaptcha(id);
      if(typeof image?.image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image.image)||image.image.length>100000||!hashPattern.test(image.answerHash))throw new Error('Invalid APK image challenge');
      const value={id,ipKey,version,publicOrigin,expires:time+CAPTCHA_LIFETIME,attempts:0,answerHash:image.answerHash,image:image.image};challenges.set(id,value);return {challenge:value};
    });
  }
  async function checkAsset(handle,release,signal){
    const stat=await handle.stat({bigint:true});if(!stat.isFile()||stat.size!==BigInt(release.size))throw new Error('APK asset size mismatch');
    const fingerprint=[release.sha256,stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
    if(verifiedAssets.get(release.filename)===fingerprint)return;
    const hash=createHash('sha256');for await(const chunk of assetChunks(handle,release.size,signal))hash.update(chunk);
    if(hash.digest('hex')!==release.sha256)throw new Error('APK asset digest mismatch');
    if(verifiedAssets.size>=32)verifiedAssets.delete(verifiedAssets.keys().next().value);verifiedAssets.set(release.filename,fingerprint);
  }
  async function download(req,res,release,ticket,ipKey,publicOrigin){
    if(active.has(ipKey))return html(req,res,429,'此网络已有下载正在进行，请等待完成。',release,null,3);
    if(active.size>=MAX_ACTIVE)return html(req,res,503,'当前下载较多，请稍后再试，或使用GitHub备用下载。',release,null,5);
    const controller=new AbortController(),abort=()=>controller.abort();active.set(ipKey,{controller,res});res.once('close',abort);res.once('error',abort);
    const timer=setTimeout(()=>{controller.abort();res.destroy();},Math.ceil(release.size/BYTES_PER_SECOND*1000)+120_000);timer.unref?.();
    let handle;
    try{
      // Consume before any await, so concurrent/replayed GETs cannot admit twice.
      tickets.delete(ticket.id);
      handle=await open(join(config.directory,release.filename),constants.O_RDONLY|constants.O_NOFOLLOW);
      const admitted=await ledger(async()=>{
        const time=now(),times=state.downloads[ipKey]||[];
        if(times.length>=MAX_DOWNLOADS_PER_HOUR)return {status:429,message:'此网络一小时内已下载8次，请稍后再试。',retry:Math.max(1,Math.ceil((times[0]+HOUR-time)/1000))};
        if(state.reservedBytes>DAILY_BYTES-release.size)return {status:429,message:'主下载今日额度已用完，请明天再试，或使用GitHub备用下载。',retry:midnightWait(time)};
        if(!state.downloads[ipKey]&&Object.keys(state.downloads).length>=2000)return {status:503,message:'下载服务暂时繁忙，请稍后再试。'};
        state.reservedBytes+=release.size;state.downloads[ipKey]=[...times,time];await persist();return null;
      });
      if(admitted)return html(req,res,admitted.status,admitted.message,release,null,admitted.retry);
      await checkAsset(handle,release,controller.signal);if(controller.signal.aborted)throw new Error('Download closed');
      apkHeaders(res,release,publicOrigin);
      let nextAt=monotonicNow(),sent=0;
      for await(const chunk of assetChunks(handle,release.size,controller.signal)){
        if(controller.signal.aborted)throw new Error('Download closed');if(sent+chunk.length>release.size)throw new Error('APK asset grew');
        nextAt=Math.max(nextAt,monotonicNow())+chunk.length*1000/BYTES_PER_SECOND;await sleep(Math.max(0,nextAt-monotonicNow()),controller.signal);
        if(controller.signal.aborted)throw new Error('Download closed');sent+=chunk.length;if(!res.write(chunk))await waitForDrain(res,controller.signal);
      }
      if(sent!==release.size)throw new Error('APK asset truncated');await finishResponse(res);
    }catch{
      if(!res.destroyed&&!res.headersSent)html(req,res,503,'下载暂时不可用，请重新验证或使用GitHub备用下载。',release);else if(!res.destroyed)res.destroy();
    }finally{clearTimeout(timer);res.removeListener('close',abort);res.removeListener('error',abort);await handle?.close().catch(()=>{});active.delete(ipKey);}
  }
  const handle=async(req,res,verifiedIP)=>{
    let release;
    try{
      const publicOrigin=publicOriginFor(req);
      if(!publicOrigin)return html(req,res,400,'下载站点地址不正确，请使用正式下载入口。');
      // Release discovery is public, bounded and independent of the download
      // traffic ledger. It remains available after the day's bytes are spent.
      if(req.url==='/downloads/android-latest.json')return await latest(req,res,publicOrigin);
      if(typeof req.url==='string'&&req.url.startsWith('/downloads/android-latest.json?'))return html(req,res,400,'更新信息地址不接受参数。');
      const ip=validIP(verifiedIP);if(!ip)return html(req,res,400,'无法确认下载网络，请稍后再试。');
      if(typeof req.url!=='string'||req.url.length>2048||!req.url.startsWith('/')||req.url.includes('#'))return html(req,res,404,'下载地址不存在。');
      const rawPath=req.url.split('?')[0],match=rawPath.match(routePattern);if(!match)return html(req,res,404,'下载地址不存在。');
      try{release=await releaseFor(match[1]);}catch{return html(req,res,503,'下载目录暂时不可用，请稍后再试。');}
      if(!release||release.filename!==match[2])return html(req,res,404,'此版本尚未提供下载。');
      if(closed||unavailable)return html(req,res,503,'下载服务暂时不可用，请使用GitHub备用下载。',release);
      if(!['GET','HEAD','POST'].includes(req.method)){res.setHeader('Allow','GET, HEAD, POST');return html(req,res,405,'请使用浏览器打开下载地址。',release);}
      const query=new URL(req.url,publicOrigin).searchParams;
      if([...query.keys()].some(key=>key!=='ticket')||query.getAll('ticket').length>1)return html(req,res,400,'下载地址参数不正确，请重新打开下载页。',release);
      if(req.headers.range||req.headers['if-range'])return html(req,res,416,'请从验证页开始一次完整下载。',release);
      const ipKey=sign('apk:ip:'+ip);
      if(req.method==='POST'){
        if(query.size||req.headers.origin!==publicOrigin||req.headers['sec-fetch-site']==='cross-site')return html(req,res,403,'请从本站下载页完成验证。',release);
        if(!/^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')return html(req,res,415,'验证表单格式不正确，请重新打开下载页。',release);
        const length=req.headers['content-length'];if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>1024)){res.setHeader('Connection','close');html(req,res,413,'验证内容过长，请重新打开下载页。',release);res.once('finish',()=>req.destroy());return;}
        let form;try{form=await parseForm(req);}catch(error){res.setHeader('Connection','close');html(req,res,error.status||400,'验证内容不正确，请重新打开下载页。',release);res.once('finish',()=>req.destroy());return;}
        const value=tokenRecord('challenge',form.token,challenges,ipKey,release.version,publicOrigin);
        if(!value||value.attempts>=APK_DOWNLOAD_LIMITS.captchaAttempts)return html(req,res,400,'验证码已失效，请重新获取。',release);
        value.attempts++;
        if(typeof form.answer!=='string'||!/^\d{4}$/.test(form.answer)||!timingSafeEqual(Buffer.from(captchaAnswerHash(value.id,form.answer),'hex'),Buffer.from(value.answerHash,'hex')))return html(req,res,400,value.attempts>=APK_DOWNLOAD_LIMITS.captchaAttempts?'验证码尝试次数已用完，请稍后换一张。':'数字不正确，请再试一次。',release,value.attempts<5?value:null);
        challenges.delete(value.id);
        if(tickets.size>=256)return html(req,res,503,'下载验证暂时繁忙，请稍后再试。',release);
        for(const [id,previous] of tickets)if(previous.ipKey===ipKey&&previous.version===release.version)tickets.delete(id);
        const ticket={id:randomBytes(16).toString('hex'),ipKey,version:release.version,publicOrigin,expires:now()+TICKET_LIFETIME};tickets.set(ticket.id,ticket);
        securityHeaders(res,undefined,publicOrigin);res.statusCode=303;res.setHeader('Location',publicOrigin+pathnameFor(release)+'?ticket='+tokenFor('ticket',ticket));res.setHeader('Content-Length','0');res.end();return;
      }
      if(query.has('ticket')){
        const ticket=tokenRecord('ticket',query.get('ticket'),tickets,ipKey,release.version,publicOrigin);
        if(!ticket)return html(req,res,403,'本次下载验证已失效，请重新获取验证码。',release);
        if(req.method==='HEAD'){apkHeaders(res,release,publicOrigin);res.end();return;}
        return await download(req,res,release,ticket,ipKey,publicOrigin);
      }
      if(req.method==='HEAD')return html(req,res,200,'请打开下载页完成四位数字验证。',release);
      const issued=await issueChallenge(ipKey,release.version,publicOrigin);
      return html(req,res,issued.status||200,issued.message||'完成四位数字验证，即可下载安卓安装包。',release,issued.challenge,issued.retry);
    }catch{if(!res.destroyed&&!res.headersSent)return html(req,res,503,'下载服务暂时不可用，请稍后再试。',release);if(!res.destroyed)res.destroy();}
  };
  handle.close=async()=>{closed=true;for(const {controller,res} of active.values()){controller.abort();res.destroy();}await queue;challenges.clear();tickets.clear();};
  return handle;
}
