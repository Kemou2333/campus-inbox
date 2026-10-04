/* RFC 5545 export. No calendar access permission or automatic phone writes. */
(()=>{'use strict';
const escape=v=>String(v).replace(/\\/g,'\\\\').replace(/\r\n?|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line){let out='',segment='',bytes=0;for(const c of line){const size=new TextEncoder().encode(c).length;if(bytes+size>75){out+=segment+'\r\n';segment=' ';bytes=1;}segment+=c;bytes+=size;}return out+segment;}
function stamp(value){if(value===null||value===undefined||value==='')throw new Error('请确认日期和时间。');const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error('请确认日期和时间。');return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function build(n,due){
 const active=n.tasks.filter(t=>!t.completed&&!t.dismissed),description=[n.summary,...active.flatMap(t=>[`${t.assignee?t.assignee+'：':''}${t.text}${t.condition?'（'+t.condition+'）':''}`,...t.details,...t.steps.flatMap((s,i)=>[`${i+1}. ${s.text}`,...s.details])]),'原通知：',n.originalText].join('\n');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Campus Inbox//Campus Calendar//ZH-CN','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+escape(n.id)+'@campus-inbox','DTSTAMP:'+stamp(Date.now()),'DTSTART:'+stamp(due),'SUMMARY:'+escape(n.title+' · 截止'),'DESCRIPTION:'+escape(description),'TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
let selected=null;const $=id=>globalThis.document?.getElementById(id);
function open(n){selected=structuredClone(n);$('calendar-title').textContent='加入日历 · '+n.title;const due=CampusData.effectiveDeadline(n),d=due?new Date(due):null;$('calendar-time').value=d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:'';$('calendar-status').textContent=due?'':`原文没有完整日期，请先确认时间。${n.deadlineText?'原文：'+n.deadlineText:''}`;$('calendar-dialog').showModal();$('calendar-time').focus();}
$('calendar-export')?.addEventListener('click',()=>{try{if(!$('calendar-time').value)throw new Error('请填写日期和时间。');const body=build(selected,$('calendar-time').value),url=URL.createObjectURL(new Blob([body],{type:'text/calendar;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=selected.title.replace(/[\\/:*?"<>|]/g,'')+'.ics';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);$('calendar-dialog').close();}catch(e){$('calendar-status').textContent=e.message;}});
globalThis.CampusCalendar=Object.freeze({open,build,fold,escape});if(typeof module!=='undefined')module.exports=globalThis.CampusCalendar;
})();
