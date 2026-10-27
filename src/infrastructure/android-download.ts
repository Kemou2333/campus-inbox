import {version} from '../../package.json';
import publishedDownload from '../../public/android-download.json';

export interface AndroidDownload {version:string; github:string; primary?:string; aliyun?:string; lanzou:string|null; extractionCode?:string; sizeBytes?:number}
const approvedBundle=parseAndroidDownload(publishedDownload);
// Web builds can precede an APK release. Keep a verified published APK fallback,
// rather than inventing a download for the web package version. Native update
// checks use their separate installed-version and latest-metadata policy.
export const fallbackAndroidDownload:AndroidDownload=approvedBundle?{version:approvedBundle.version,github:approvedBundle.github,lanzou:null}:{version,github:`https://github.com/Kemou2333/campus-inbox/releases/download/android-v${version}/campus-inbox-${version}.apk`,lanzou:null};
export function parseAndroidDownload(value:unknown):AndroidDownload|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(typeof v.version!=='string'||!/^\d+\.\d+\.\d+$/.test(v.version))return null;
 const github=`https://github.com/Kemou2333/campus-inbox/releases/download/android-v${v.version}/campus-inbox-${v.version}.apk`;
 if(v.github!==github)return null;
 const aliyun=`https://123.57.30.129/downloads/android-v${v.version}/campus-inbox-${v.version}.apk`;
 if(v.aliyun!==null&&v.aliyun!==undefined&&v.aliyun!==aliyun)return null;
 const primaryPath=`/downloads/android-v${v.version}/campus-inbox-${v.version}.apk`;
 if(v.primary!==null&&v.primary!==undefined&&![`https://kemou.top:88${primaryPath}`,`https://kemou.top:8443${primaryPath}`].includes(v.primary as string))return null;
 let lanzou:string|null=null;
 if(v.lanzou!==null&&v.lanzou!==undefined){
  if(typeof v.lanzou!=='string')return null;
  try{const url=new URL(v.lanzou);if(url.protocol!=='https:'||url.hostname!=='kemou.lanzouv.com'||url.port||url.username||url.password||!/^\/i[a-zA-Z0-9]+$/.test(url.pathname)||url.search||url.hash)return null;lanzou=url.href;}catch{return null;}
 }
 if(v.extractionCode!==undefined&&(typeof v.extractionCode!=='string'||!/^[a-zA-Z0-9]{4}$/.test(v.extractionCode)||!lanzou))return null;
 return {version:v.version,github,lanzou,...(v.primary?{primary:v.primary as string}:{}),...(v.aliyun?{aliyun}:{}),...(v.extractionCode?{extractionCode:v.extractionCode as string}:{}),...(Number.isInteger(v.sizeBytes)&&Number(v.sizeBytes)>0?{sizeBytes:Number(v.sizeBytes)}:{})};
}

/** Small public manifest only; no account, session, original text or device identity. */
export async function loadAndroidDownload(fetcher:typeof fetch=fetch):Promise<AndroidDownload>{
 const endpoint=window.CampusNative?.postMessage?'https://kemou2333.github.io/campus-inbox/android-download.json':`${import.meta.env.BASE_URL}android-download.json`;
 try{const response=await fetcher(endpoint,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(4000)});if(!response.ok)return fallbackAndroidDownload;return parseAndroidDownload(await response.json())??fallbackAndroidDownload;}catch{return fallbackAndroidDownload;}
}
