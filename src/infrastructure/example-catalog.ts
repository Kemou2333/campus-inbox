import {parseBackup} from '../domain/notice';

/** Downloading the reviewed catalog is separate from adding it to a library. */
export function createExampleCatalog(fetcher:typeof fetch=fetch){
 let pending:Promise<{records:ReturnType<typeof parseBackup>;registry:unknown}>|null=null;
 function load(){
  if(pending)return pending;
  pending=(async()=>{
   const [response,legacy]=await Promise.all([
    fetcher('./examples.json',{cache:'no-cache',signal:AbortSignal.timeout(10_000)}),
    fetcher('./examples-legacy.json',{cache:'no-cache',signal:AbortSignal.timeout(5000)}).then(async response=>response.ok?await response.json():null).catch(()=>null),
   ]);
   if(!response.ok)throw new Error('示例暂时无法载入。');
   return {records:parseBackup(await response.json()),registry:legacy};
  })().catch(error=>{pending=null;throw error;});
  return pending;
 }
 return {load,prefetch:async()=>{await load();}};
}
