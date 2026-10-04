/* Only existing complete dates or dates set by the user drive the local urgency list. */
(()=>{'use strict';const D=globalThis.CampusData,target=globalThis.document?.getElementById('urgent-notices');let signature='';
function items(notices,now=Date.now()){
 const today=new Date(now),start=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime(),end=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1).getTime();
 return notices.flatMap(n=>{const due=D.effectiveDeadline(n);if(!due)return [];const t=Date.parse(due);if(!Number.isFinite(t)||t>now+3*86400000)return [];
 const kind=t<now?'overdue':t>=start&&t<end?'today':'soon',label=kind==='overdue'?'已逾期':kind==='today'?'今天要办':'即将截止';
 return [{id:n.id,title:n.title,due,kind,label,rank:kind==='today'?0:kind==='soon'?1:2}];
 }).sort((a,b)=>a.rank-b.rank||(a.kind==='overdue'?Date.parse(b.due)-Date.parse(a.due):Date.parse(a.due)-Date.parse(b.due)));
}
function render(notices,jump){if(!target)return;const all=items(notices),next=JSON.stringify(all);if(signature===next)return;signature=next;target.replaceChildren();target.hidden=!all.length;if(!all.length)return;
 const head=document.createElement('div');head.className='urgent-head';const h=document.createElement('h3');h.textContent='优先看这里';head.append(h);const count=document.createElement('span');count.textContent=all.length+' 条';head.append(count);target.append(head);
 const grid=document.createElement('div');grid.className='urgent-list';all.slice(0,6).forEach(n=>{const b=document.createElement('button');b.type='button';b.className='urgent-link';b.dataset.kind=n.kind;const status=document.createElement('span');status.className='urgent-label';status.textContent=n.label;const title=document.createElement('strong');title.textContent=n.title;const time=document.createElement('time');time.dateTime=n.due;time.textContent=new Date(n.due).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});b.append(status,title,time);b.addEventListener('click',()=>jump(n.id));grid.append(b);});target.append(grid);
 if(all.length>6){const remaining=document.createElement('button');remaining.type='button';remaining.className='text-button';remaining.textContent=`查看另外 ${all.length-6} 条`;remaining.addEventListener('click',()=>jump(all[6].id));target.append(remaining);}
}
globalThis.CampusFocus=Object.freeze({items,render});if(typeof module!=='undefined')module.exports=globalThis.CampusFocus;
})();
