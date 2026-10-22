// These are paid admissions, not HTTP attempts. The service reserves once,
// persists before dispatch, and retains this ledger when its daily totals reset.
export const FIVE_HOURS_MS=5*60*60*1000,THREE_DAYS_MS=3*24*60*60*1000;
const validMap=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=2000;
const validKey=key=>/^[-\w]{43}$/.test(key);
const validTime=value=>Number.isSafeInteger(value)&&value>=0;
const validCounts=value=>validMap(value)&&Object.entries(value).every(([key,count])=>validKey(key)&&Number.isSafeInteger(count)&&count>=0);
export function validateRollingQuota(value){
  const validEvents=map=>validMap(map)&&Object.entries(map).every(([key,times])=>validKey(key)&&Array.isArray(times)&&times.length<=2000&&times.every(validTime));
  if(!value||value.version!==1||!validEvents(value.accounts)||!validEvents(value.ips)
    ||value.legacy!==undefined&&(!value.legacy||typeof value.legacy.day!=='string'||!validTime(value.legacy.at)||!validCounts(value.legacy.accounts)||!validCounts(value.legacy.ips)))throw new Error('Invalid rolling AI quota state');
}
export function createRollingQuota(usage,time){
  if(usage?.rolling!==undefined){validateRollingQuota(usage.rolling);return usage.rolling;}
  const state={version:1,accounts:{},ips:{}};
  // Old daily counters do not contain exact paid-request timestamps. Preserve
  // them once at the latest possible time instead of silently granting a reset.
  // Earlier history cannot be reconstructed from the old daily-only format.
  const end=Date.parse(usage?.day+'T23:59:59.999+08:00'),at=Math.min(time,end);
  if(Number.isSafeInteger(at)&&at>=0&&time-at<THREE_DAYS_MS){
    const accounts={...(usage.accounts||{})},ips=Object.fromEntries(Object.entries(usage.clients||{}).map(([key,value])=>[key,value.requests]));
    if(Object.values(accounts).some(Boolean)||Object.values(ips).some(Boolean))state.legacy={day:usage.day,at,accounts,ips};
  }
  return state;
}
export function pruneRollingQuota(state,time){
  for(const [map,window] of [[state.accounts,THREE_DAYS_MS],[state.ips,FIVE_HOURS_MS]])for(const [key,times] of Object.entries(map)){
    const active=times.filter(at=>time-at<window);if(active.length)map[key]=active;else delete map[key];
  }
  if(state.legacy&&time-state.legacy.at>=THREE_DAYS_MS)delete state.legacy;
}
function waitSeconds(times,legacyCount,legacyTime,limit,window,time){
  const groups=times.filter(at=>time-at<window).map(at=>[at,1]);
  if(legacyCount&&time-legacyTime<window)groups.push([legacyTime,legacyCount]);
  let remaining=groups.reduce((sum,[,count])=>sum+count,0);if(remaining<limit)return 0;
  groups.sort((a,b)=>a[0]-b[0]);
  for(const [at,count] of groups){remaining-=count;if(remaining<limit)return Math.max(1,Math.ceil((at+window-time)/1000));}
  return 0;
}
export function checkRollingQuota(state,{accountKey,ipKey,legacyAccountKey,legacyIPKey,time,accountFiveHourLimit,accountThreeDayLimit,ipFiveHourLimit}){
  const legacy=state.legacy,accountTimes=accountKey?state.accounts[accountKey]||[]:[],ipTimes=state.ips[ipKey]||[];
  const oldAccount=legacy?.accounts[legacyAccountKey]||0,oldIP=legacy?.ips[legacyIPKey]||0;
  const limits=[
    ...(accountKey?[[accountTimes,oldAccount,accountFiveHourLimit,FIVE_HOURS_MS,'ACCOUNT_FIVE_HOUR_LIMIT',`此账号每 5 小时最多使用 AI ${accountFiveHourLimit} 次。`],
      [accountTimes,oldAccount,accountThreeDayLimit,THREE_DAYS_MS,'ACCOUNT_THREE_DAY_LIMIT',`此账号每 3 天最多使用 AI ${accountThreeDayLimit} 次。`]]:[]),
    [ipTimes,oldIP,ipFiveHourLimit,FIVE_HOURS_MS,'IP_FIVE_HOUR_LIMIT',`此网络每 5 小时最多使用 AI ${ipFiveHourLimit} 次。`]
  ];
  for(const [times,count,limit,window,code,error] of limits){const seconds=waitSeconds(times,count,legacy?.at,limit,window,time);if(seconds)return {code,error,retryAfterSeconds:seconds};}
  return null;
}
export function reserveRollingQuota(state,{accountKey,ipKey,time}){
  if(accountKey)(state.accounts[accountKey]??=[]).push(time);
  (state.ips[ipKey]??=[]).push(time);
}
export function remainingRollingAccount(state,{accountKey,legacyAccountKey,time,accountFiveHourLimit,accountThreeDayLimit}){
  const times=state?.accounts[accountKey]||[],legacy=state?.legacy,old=legacy?.accounts[legacyAccountKey]||0;
  const used=window=>times.filter(at=>time-at<window).length+(legacy&&time-legacy.at<window?old:0);
  return Math.max(0,Math.min(accountFiveHourLimit-used(FIVE_HOURS_MS),accountThreeDayLimit-used(THREE_DAYS_MS)));
}
