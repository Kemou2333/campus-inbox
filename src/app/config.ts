export interface RuntimeConfig { apiEndpoint:string; syncEndpoint:string }
const fallback:RuntimeConfig={apiEndpoint:'https://123.57.30.129/analyze',syncEndpoint:'https://123.57.30.129/sync'};
export async function loadConfig(native:boolean):Promise<RuntimeConfig>{
 const location=native?'https://kemou2333.github.io/campus-inbox/runtime-config.json':'./runtime-config.json';
 try{const response=await fetch(location,{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)return fallback;
 const value=await response.json() as RuntimeConfig;
 if(!['apiEndpoint','syncEndpoint'].every(k=>{
  if(typeof value[k as keyof RuntimeConfig]!=='string')return false;
  const url=new URL(value[k as keyof RuntimeConfig]);
  return url.protocol==='https:'||!native&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 }))return fallback;
 return {apiEndpoint:value.apiEndpoint,syncEndpoint:value.syncEndpoint};
 }catch{return fallback;}
}
