/* RFC 5545 export. No calendar access permission or automatic phone writes. */
(()=>{'use strict';
const escape=v=>String(v).replace(/\\/g,'\\\\').replace(/\r\n?|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line){let out='',segment='',bytes=0;for(const c of line){const size=new TextEncoder().encode(c).length;if(bytes+size>75){out+=segment+'\r\n';segment=' ';bytes=1;}segment+=c;bytes+=size;}return out+segment;}
function stamp(value){if(value===null||value===undefined||value==='')throw new Error('请确认日期和时间。');const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error('请确认日期和时间。');return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function dateStamp(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('请确认日期。');const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Error('请确认日期。');return value.replace(/-/g,'');}
function build(n,due,allDay=false){
 const active=n.tasks.filter(t=>!t.completed&&!t.dismissed),description=[n.summary,...active.flatMap(t=>[`${t.assignee?t.assignee+'：':''}${t.text}${t.condition?'（'+t.condition+'）':''}`,...t.details,...t.steps.flatMap((s,i)=>[`${i+1}. ${s.text}`,...s.details])]),'原通知：',n.originalText].join('\n');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Campus Inbox//Campus Calendar//ZH-CN','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+escape(n.id)+'@campus-inbox','DTSTAMP:'+stamp(Date.now()),(allDay?'DTSTART;VALUE=DATE:'+dateStamp(due):'DTSTART:'+stamp(due)),'SUMMARY:'+escape(n.title+' · 截止'),'DESCRIPTION:'+escape(description),'TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
let selected=null;const $=id=>globalThis.document?.getElementById(id);
function displayTime(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function open(n){
 selected=structuredClone(n);$('calendar-title').textContent='加入日历 · '+n.title;
 let due=CampusData.effectiveDeadline(n),dateOnly=null;
 if(!due&&n.deadlineSpec&&globalThis.CampusTime){due=CampusTime.toISO(n.deadlineSpec);if(!due)dateOnly=CampusTime.toDate(n.deadlineSpec);}
 $('calendar-all-day').checked=!!dateOnly;$('calendar-time').type=dateOnly?'date':'datetime-local';
 $('calendar-time').value=dateOnly||(due?displayTime(new Date(due)):'');$('calendar-native').hidden=!globalThis.CampusAndroid;
 $('calendar-status').textContent=due||dateOnly?'':`请先确认完整日期。${n.deadlineText?'原文：'+n.deadlineText:''}`;
 $('calendar-dialog').showModal();$('calendar-time').focus();
}
$('calendar-all-day')?.addEventListener('change',()=>{const input=$('calendar-time'),value=input.value,allDay=$('calendar-all-day').checked;input.type=allDay?'date':'datetime-local';input.value=value?(allDay?value.slice(0,10):value.includes('T')?value:value+'T09:00'):'';});
$('calendar-export')?.addEventListener('click',()=>{try{if(!$('calendar-time').value)throw new Error('请填写日期和时间。');const body=build(selected,$('calendar-time').value,$('calendar-all-day').checked),url=URL.createObjectURL(new Blob([body],{type:'text/calendar;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=selected.title.replace(/[\\/:*?"<>|]/g,'')+'.ics';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);$('calendar-dialog').close();}catch(e){$('calendar-status').textContent=e.message;}});
$('calendar-native')?.addEventListener('click',async()=>{const button=$('calendar-native');button.disabled=true;try{if(!$('calendar-time').value)throw new Error('请填写日期和时间。');await CampusAndroid.openCalendar(selected,$('calendar-time').value,$('calendar-all-day').checked);$('calendar-dialog').close();}catch(e){$('calendar-status').textContent=e.message;}finally{button.disabled=false;}});
globalThis.CampusCalendar=Object.freeze({open,build,fold,escape,dateStamp});if(typeof module!=='undefined')module.exports=globalThis.CampusCalendar;
})();
