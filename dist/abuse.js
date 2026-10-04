/* A small, automatic proof slows repeated calls. It is not proof of humanity. */
(()=>{'use strict';
async function solve(challenge,signal){
 if(!challenge||challenge.bits!==16||typeof challenge.token!=='string'||challenge.token.length>1400||!Number.isSafeInteger(challenge.expires)||challenge.expires<=Date.now()||challenge.expires>Date.now()+125000||!crypto.subtle)throw new Error('暂时无法完成安全验证，请稍后再试。');
 const encoder=new TextEncoder(),end=Math.min(challenge.expires,Date.now()+20000);
 for(let start=0;start<10000000;start+=16){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(Date.now()>end)throw new Error('安全验证超时，请稍后再试。');
  const batch=await Promise.all(Array.from({length:16},async(_,i)=>{const nonce=start+i,hash=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(challenge.token+':'+nonce)));return hash[0]===0&&hash[1]===0?nonce:null;}));
  const nonce=batch.find(n=>n!==null);if(nonce!==undefined)return JSON.stringify({token:challenge.token,nonce});
 }
 throw new Error('安全验证未完成，请稍后再试。');
}
globalThis.CampusAbuse=Object.freeze({solve});
})();
