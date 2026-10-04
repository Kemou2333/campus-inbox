import http from 'node:http';
import {Readable} from 'node:stream';
import {createService} from './service.mjs';
const env=process.env;
const handle=await createService({apiKey:env.DEEPSEEK_API_KEY,accessToken:env.CAMPUS_ACCESS_TOKEN,requireAccess:false,ipDailyLimit:Number(env.IP_DAILY_REQUEST_LIMIT)||10,model:env.AI_MODEL||'deepseek-flash',allowedOrigins:(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean),dailyLimit:Number(env.DAILY_REQUEST_LIMIT)||30,stateFile:env.USAGE_STATE_FILE||'/var/lib/campus-inbox/usage.json'});
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
server.listen(Number(env.PORT)||8787,'127.0.0.1',()=>console.log('Campus Inbox backend ready on loopback'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
