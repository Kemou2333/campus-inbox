/* Exact time parts, without filling in a missing year or publication date. */
(function(root){
'use strict';
const FIELDS=['type','year','month','day','hour','minute','rawText'];
const PARTS=['year','month','day','hour','minute'];
const TYPES=['date_time','date','partial','relative','unknown'];
const NUMBER='(?:\\d{1,2}|[零〇一二三四五六七八九十两]{1,3})';
function raw(value){if(typeof value!=='string'||value.length>500)throw new Error('原文时间格式不正确');return value.trim();}
function empty(value,type='unknown'){return {type,year:null,month:null,day:null,hour:null,minute:null,rawText:raw(value)};}
function number(value){
 if(value===undefined)return null;
 if(/^\d+$/.test(value))return Number(value);
 const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 if(value==='十')return 10;
 if(value.includes('十')){const [tens,units]=value.split('十');return (tens?digits[tens]:1)*10+(units?digits[units]:0);}
 return Object.hasOwn(digits,value)?digits[value]:NaN;
}
function validDate(year,month,day){
 if(month!==null&&(!Number.isInteger(month)||month<1||month>12))return false;
 if(day!==null&&(!Number.isInteger(day)||day<1||day>31))return false;
 if(year!==null&&(!Number.isInteger(year)||year<1000||year>9999))return false;
 if(month!==null&&day!==null){const leap=year===null||year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];if(day>days[month-1])return false;}
 return true;
}
function classify(value){
 if(value.year!==null&&value.month!==null&&value.day!==null)return value.hour!==null&&value.minute!==null?'date_time':value.hour===null&&value.minute===null?'date':'partial';
 return PARTS.some(key=>value[key]!==null)?'partial':'unknown';
}
function fromText(value){
 const out=empty(value),s=out.rawText;
 if(new RegExp(`(?:月|日|号|时|点)\\s*[-~～—–至到]\\s*(?:\\d|[一二三四五六七八九十])`).test(s))return out;
 if(!s||/(?:每(?:天|日|周|星期|月|年)|隔周|逢周)/.test(s))return out;
 if(new RegExp(`(?:\\d{1,4}|[一二三四五六七八九十]{1,3})\\s*(?:至|到|[-~～—–])\\s*(?:\\d{1,4}|[一二三四五六七八九十]{1,3})(?:年|月|日|号|时|点)`).test(s))return out;
 // A range is not a single confirmed deadline. Keep its complete wording.
 const dates=[...s.matchAll(new RegExp(`(?:(\\d{4})年)?(${NUMBER})月(${NUMBER})(?:日|号)|(\\d{4})[-/]([0-9]{1,2})[-/]([0-9]{1,2})|(${NUMBER})(?:日|号)`,'g'))];
 const clocks=[...s.matchAll(new RegExp(`(\\d{1,2})[:：](\\d{2})|(${NUMBER})(?:时|点)(?:(${NUMBER})分)?`,'g'))];
 const pointIndex=dates[0]?.index??clocks[0]?.index??Infinity;
 const ranges=[...s.matchAll(/(?:至|到|[~～—–])\s*(?:\d|[一二三四五六七八九十])/g)];
 if(dates.length>1||clocks.length>1||ranges.some(m=>m.index>pointIndex)||/(?:上旬|中旬|下旬).*(?:至|到|[~～—–])/.test(s))return out;
 if(dates.length){const m=dates[0];if(m[2]!==undefined){out.year=m[1]===undefined?null:Number(m[1]);out.month=number(m[2]);out.day=number(m[3]);}else if(m[4]!==undefined){out.year=Number(m[4]);out.month=Number(m[5]);out.day=Number(m[6]);}else out.day=number(m[7]);}
 else{
  // "2026级" and "2026—2027学年" are not calendar years.
  const year=s.match(/(?:^|[^\d])(\d{4})年(?!级|度|第|第一|第二|春|秋|学期)/);
  const month=s.match(new RegExp(`(${NUMBER})月`));
  if(year&&!/学年/.test(s))out.year=Number(year[1]);
  if(month)out.month=number(month[1]);
 }
 if(clocks.length){
  const m=clocks[0];if(/^(?:半|一刻|三刻|左右|[:：]\d{2}(?!\d))/.test(s.slice(m.index+m[0].length)))return empty(s);
  out.hour=number(m[1]===undefined?m[3]:m[1]);out.minute=m[2]===undefined?(m[4]===undefined?0:number(m[4])):Number(m[2]);
  const prefix=s.slice(Math.max(0,m.index-6),m.index);
  if(/(?:下午|晚上|傍晚)/.test(prefix)&&out.hour>=1&&out.hour<=11)out.hour+=12;
  // "晚上12点" can refer to a different day; do not choose a day for it.
  if(/(?:晚上|傍晚)/.test(prefix)&&out.hour===12)return empty(s);
 }
 if(!validDate(out.year,out.month,out.day)||out.hour!==null&&(out.hour<0||out.hour>24)||out.minute!==null&&(out.minute<0||out.minute>59)||out.hour===24&&out.minute!==0)return empty(s);
 const relative=/(?:今天|明天|后天|昨天|今晚|今早|明早|本周|下周|上周|这周|周[一二三四五六日天末]|星期[一二三四五六日天])/.test(s);
 if(!dates.length&&relative){out.year=null;out.month=null;out.day=null;out.type='relative';return out;}
 out.type=classify(out);return out;
}
function validate(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||FIELDS.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!FIELDS.includes(key)))throw new Error('结构化时间字段不完整或包含多余字段');
 const out={type:value.type,...Object.fromEntries(PARTS.map(key=>[key,value[key]])),rawText:raw(value.rawText)};
 if(!TYPES.includes(out.type)||PARTS.some(key=>out[key]!==null&&!Number.isInteger(out[key]))||!validDate(out.year,out.month,out.day))throw new Error('结构化时间格式不正确');
 if(out.hour!==null&&(out.hour<0||out.hour>24)||out.minute!==null&&(out.minute<0||out.minute>59)||out.hour===null&&out.minute!==null||out.hour===24&&out.minute!==0)throw new Error('结构化时间钟点不正确');
 if(out.type==='unknown'&&PARTS.some(key=>out[key]!==null)||out.type==='relative'&&['year','month','day'].some(key=>out[key]!==null)||!['unknown','relative'].includes(out.type)&&classify(out)!==out.type)throw new Error('结构化时间精度不一致');
 return out;
}
function normalize(value,timeText){
 const out=validate(value),text=raw(timeText);
 if(out.rawText!==text)throw new Error('结构化时间与原文时间不一致');
 // Unknown is a deliberate safe fallback for ranges, repeats or unsupported text.
 if(out.type==='unknown')return out;
 const expected=fromText(text);
 if(FIELDS.some(key=>out[key]!==expected[key]))throw new Error('结构化时间包含原文未确认的内容');
 return out;
}
function ground(value,timeText,source){
 // No numeric parts means no confirmed precision. Keep this safe empty output
 // usable without guessing a date or discarding the whole paid response.
 const candidate=value?.type==='partial'&&PARTS.every(key=>value[key]===null)?{...value,type:'unknown'}:value;
 validate(candidate);const text=raw(timeText);
 if(typeof source!=='string')return empty(text);
 // "号" and "日" are equivalent date markers; no other facts are borrowed.
 const compact=s=>s.replace(/\s/g,'').replace(/号/g,'日');
 if(!text||!compact(source).includes(compact(text)))return empty(text);
 return fromText(text);
}
const pad=n=>String(n).padStart(2,'0');
function toISO(value){
 const s=validate(value);if(s.type!=='date_time')return null;
 if(s.hour===24){const d=new Date(Date.UTC(s.year,s.month-1,s.day+1));return d.toISOString().slice(0,19);}
 return `${s.year}-${pad(s.month)}-${pad(s.day)}T${pad(s.hour)}:${pad(s.minute)}:00`;
}
function toDate(value){
 const s=validate(value);if(!['date','date_time'].includes(s.type))return null;
 return s.type==='date_time'&&s.hour===24?toISO(s).slice(0,10):`${s.year}-${pad(s.month)}-${pad(s.day)}`;
}
const api=Object.freeze({fromText,validate,normalize,ground,toISO,toDate});root.CampusTime=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
