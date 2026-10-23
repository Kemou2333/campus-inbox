import {version} from '../../package.json';

export interface AndroidDownload {version:string; github:string; aliyun?:string; lanzou:string|null; extractionCode?:string; sizeBytes?:number}
export const fallbackAndroidDownload:AndroidDownload={version,github:`https://github.com/Kemou2333/campus-inbox/releases/download/android-v${version}/campus-inbox-${version}.apk`,lanzou:null};
export function parseAndroidDownload(value:unknown):AndroidDownload|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(typeof v.version!=='string'||!/^\d+\.\d+\.\d+$/.test(v.version))return null;
 const parts=v.version.split('.').map(Number),current=version.split('.').map(Number);
 for(let i=0;i<3;i++){if(parts[i]>current[i])break;if(parts[i]<current[i])return null;}
 const github=`https://github.com/Kemou2333/campus-inbox/releases/download/android-v${v.version}/campus-inbox-${v.version}.apk`;
 if(v.github!==github)return null;
 const aliyun=`https://123.57.30.129/downloads/android-v${v.version}/campus-inbox-${v.version}.apk`;
 if(v.aliyun!==null&&v.aliyun!==undefined&&v.aliyun!==aliyun)return null;
 let lanzou:string|null=null;
 if(v.lanzou!==null&&v.lanzou!==undefined){
  if(typeof v.lanzou!=='string')return null;
  try{const url=new URL(v.lanzou);if(url.protocol!=='https:'||url.hostname!=='kemou.lanzouv.com'||url.port||url.username||url.password||!/^\/i[a-zA-Z0-9]+$/.test(url.pathname)||url.search||url.hash)return null;lanzou=url.href;}catch{return null;}
 }
 if(v.extractionCode!==undefined&&(typeof v.extractionCode!=='string'||!/^[a-zA-Z0-9]{4}$/.test(v.extractionCode)||!lanzou))return null;
 return {version:v.version,github,lanzou,...(v.aliyun?{aliyun}:{}),...(v.extractionCode?{extractionCode:v.extractionCode as string}:{}),...(Number.isInteger(v.sizeBytes)&&Number(v.sizeBytes)>0?{sizeBytes:Number(v.sizeBytes)}:{})};
}

/** Small public manifest only; no account, session, original text or device identity. */
export async function loadAndroidDownload(fetcher:typeof fetch=fetch):Promise<AndroidDownload>{
 const endpoint=window.CampusNative?.postMessage?'https://kemou2333.github.io/campus-inbox/android-download.json':`${import.meta.env.BASE_URL}android-download.json`;
 try{const response=await fetcher(endpoint,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(4000)});if(!response.ok)return fallbackAndroidDownload;return parseAndroidDownload(await response.json())??fallbackAndroidDownload;}catch{return fallbackAndroidDownload;}
}
