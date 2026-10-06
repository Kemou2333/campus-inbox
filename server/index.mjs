import http from 'node:http';
import {Readable} from 'node:stream';
import {createService} from './service.mjs';
import {createSyncService} from './sync.mjs';
import {createAuthService} from './auth.mjs';
const env=process.env;
process.umask(0o077);
const allowedOrigins=[...new Set([...(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean),'https://appassets.androidplatform.net'])];
let auth;
const sync=await createSyncService({signingSecret:env.CAMPUS_ACCESS_TOKEN,allowedOrigins,stateFile:env.SYNC_STATE_FILE||'/var/lib/campus-inbox/sync.sqlite'},{authenticate:key=>auth.getIdentity(key)});
auth=await createAuthService({signingSecret:env.CAMPUS_ACCESS_TOKEN,allowedOrigins,stateFile:env.AUTH_STATE_FILE||'/var/lib/campus-inbox/auth.sqlite'},{provision:sync.provision});
const handleAI=await createService({apiKey:env.DEEPSEEK_API_KEY,accessToken:env.CAMPUS_ACCESS_TOKEN,requireAccess:false,requireIdentity:true,accountDailyLimit:Number(env.ACCOUNT_DAILY_REQUEST_LIMIT)||10,ipDailyLimit:Number(env.IP_DAILY_REQUEST_LIMIT)||10,model:env.AI_MODEL||'deepseek-flash',allowedOrigins,dailyLimit:Number(env.DAILY_REQUEST_LIMIT)||30,stateFile:env.USAGE_STATE_FILE||'/var/lib/campus-inbox/usage.json'},{accountForToken:key=>auth.getIdentity(key)?sync.accountForKey(key):null});
const handle=(request,ip)=>{const path=new URL(request.url).pathname;return path.startsWith('/auth/')?auth.handle(request,ip):path.startsWith('/sync')?sync.handle(request,ip):handleAI(request,ip);};
const server=http.createServer(async(req,res)=>{
  try{
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
    const options={method:req.method,headers};if(!['GET','HEAD'].includes(req.method)){options.body=Readable.toWeb(req);options.duplex='half';}
    const request=new Request('http://localhost'+req.url,options);
    const response=await handle(request,req.headers['x-real-ip']||req.socket.remoteAddress);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'整理服务暂时不可用。'}));}
});
server.requestTimeout=75000;server.headersTimeout=10000;
const bindHost=env.BIND_HOST||'127.0.0.1';
server.listen(Number(env.PORT)||8787,bindHost,()=>console.log('Campus Inbox backend ready'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{auth.close();sync.close();process.exit(0);}));
