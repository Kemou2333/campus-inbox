import http from 'node:http';
import {Readable} from 'node:stream';
import {isIP} from 'node:net';
import {isAbsolute,join} from 'node:path';
import {createService} from './service.mjs';
import {createSyncService} from './sync.mjs';
import {createAuthService} from './auth.mjs';
import {createMailSender} from './mail-sender.mjs';
import {createAdminService} from './admin.mjs';
import {createSiteTransfer} from './site-transfer.mjs';
const env=process.env;
process.umask(0o077);
// One portable data root, also understood by backup-state.py. Existing explicit
// per-file paths take priority; changing this variable never moves old files.
const stateDirectory=env.CAMPUS_STATE_DIRECTORY||'/var/lib/campus-inbox';
if(!isAbsolute(stateDirectory))throw new Error('CAMPUS_STATE_DIRECTORY must be absolute');
const adminOrigin=env.ADMIN_ORIGIN||'';
if(adminOrigin&&new URL(adminOrigin).origin!==adminOrigin)throw new Error('ADMIN_ORIGIN must be an exact origin');
if(adminOrigin&&!adminOrigin.startsWith('https://')&&!/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(adminOrigin))throw new Error('ADMIN_ORIGIN requires HTTPS');
const allowedOrigins=[...new Set([...(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean),'https://appassets.androidplatform.net',...(adminOrigin?[adminOrigin]:[])])];
const sendCode=createMailSender({...env,SMTP_OAUTH_STATE_FILE:env.SMTP_OAUTH_STATE_FILE||join(stateDirectory,'smtp-oauth.json')});
let auth;
const sync=await createSyncService({signingSecret:env.CAMPUS_ACCESS_TOKEN,allowedOrigins,stateFile:env.SYNC_STATE_FILE||join(stateDirectory,'sync.sqlite')},{authenticate:key=>auth.getIdentity(key)});
auth=await createAuthService({signingSecret:env.CAMPUS_ACCESS_TOKEN,allowedOrigins,stateFile:env.AUTH_STATE_FILE||join(stateDirectory,'auth.sqlite')},{provision:sync.provision,sendCode});
const handleAI=await createService({apiKey:env.DEEPSEEK_API_KEY,accessToken:env.CAMPUS_ACCESS_TOKEN,requireAccess:false,requireIdentity:true,accountFiveHourLimit:5,accountThreeDayLimit:20,ipFiveHourLimit:5,model:env.AI_MODEL||'deepseek-flash',allowedOrigins,dailyLimit:Number(env.DAILY_REQUEST_LIMIT)||50,stateFile:env.USAGE_STATE_FILE||join(stateDirectory,'usage.json'),
  thinkingMode:env.AI_THINKING_MODE==='none'?'none':'low',captchaMode:env.CAPTCHA_MODE||'image',dailyBudgetRmb:Number(env.AI_DAILY_BUDGET_RMB)||3,oneNoticePerSource:true
},{accountForToken:key=>auth.getIdentity(key)?sync.accountForKey(key):null,jobs:sync.jobs,questions:sync.questions});
const handleAdmin=createAdminService({usernames:(env.ADMIN_USERNAMES||'').split(',').map(name=>name.trim()).filter(Boolean),userIDs:(env.ADMIN_USER_IDS||'').split(',').map(id=>id.trim()).filter(Boolean),allowedOrigins,backupStateFile:env.BACKUP_STATUS_FILE||join(stateDirectory,'backups/status.json')},{auth,sync,ai:handleAI});
const handleTransfer=createSiteTransfer({directory:join(stateDirectory,'site-transfers')});
const handle=(request,ip)=>{const path=new URL(request.url).pathname;return path.startsWith('/site-transfer')?handleTransfer(request,ip):path.startsWith('/admin')?handleAdmin(request):path.startsWith('/auth/')?auth.handle(request,ip):path.startsWith('/sync')?sync.handle(request,ip):handleAI(request,ip);};
const server=http.createServer(async(req,res)=>{
  try{
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
    const peer=req.socket.remoteAddress||'unknown',localProxy=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer);
    // Browsers omit Origin on same-origin GETs. Recover only a configured
    // HTTPS origin confirmed by the local proxy and browser fetch metadata.
    // Explicit origins, cross-site reads and all writes keep the strict gate.
    if(req.method==='GET'&&!headers.has('Origin')&&localProxy&&headers.get('Sec-Fetch-Site')==='same-origin'&&headers.get('X-Forwarded-Proto')==='https'){
      const siteOrigin='https://'+headers.get('Host');
      if(allowedOrigins.includes(siteOrigin))headers.set('Origin',siteOrigin);
    }
    const controller=new AbortController();req.once('aborted',()=>controller.abort());res.once('close',()=>{if(!res.writableEnded)controller.abort();});
    const options={method:req.method,headers,signal:controller.signal};if(!['GET','HEAD'].includes(req.method)){options.body=Readable.toWeb(req);options.duplex='half';}
    const request=new Request('http://localhost'+req.url,options);
    // Only the local reverse proxy may supply a single verified client IP.
    const forwarded=req.headers['x-real-ip'];
    const ip=localProxy&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:peer;
    const response=await handle(request,ip);
    res.writeHead(response.status,{'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',...Object.fromEntries(response.headers)});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'整理服务暂时不可用。'}));}
});
server.requestTimeout=210000;server.headersTimeout=10000;
server.keepAliveTimeout=5000;server.maxRequestsPerSocket=100;server.maxHeadersCount=60;
const bindHost=env.BIND_HOST||'127.0.0.1';
server.listen(Number(env.PORT)||8787,bindHost,()=>console.log('Campus Inbox backend ready'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{await handleAI.drain();handleTransfer.close();auth.close();sync.close();process.exit(0);}));
