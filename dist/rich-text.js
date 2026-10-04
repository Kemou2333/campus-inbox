/* Restricted inline formatting: create DOM nodes, never interpret user HTML. */
(function(root){
'use strict';
const datePattern=/(?:\d{4}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*[日号](?:\s*\d{1,2}(?::|：)\d{2})?(?:之前|前|内)?|\d{1,2}(?::|：)\d{2}|(?:今天|今日|明天)(?:中午|上午|下午|晚上|内)?(?:前|内)?/g;
function plain(parent,value){let end=0;for(const m of value.matchAll(datePattern)){parent.append(document.createTextNode(value.slice(end,m.index)));const mark=document.createElement('mark');mark.className='text-time';mark.textContent=m[0];parent.append(mark);end=m.index+m[0].length;}parent.append(document.createTextNode(value.slice(end)));}
function url(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function render(parent,value){
 const text=String(value),pattern=/\*\*([^*\n]{1,500})\*\*|`([^`\n]{1,500})`|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s<>"()]+)\)|https?:\/\/[^\s<>"，。；）)]+/g;let end=0;
 for(const m of text.matchAll(pattern)){
  plain(parent,text.slice(end,m.index));let el;
  if(m[1]){el=document.createElement('strong');plain(el,m[1]);}
  else if(m[2]){el=document.createElement('code');el.textContent=m[2];}
  else{const href=url(m[4]||m[0]);if(!href){plain(parent,m[0]);end=m.index+m[0].length;continue;}el=document.createElement('a');el.href=href;el.textContent=m[3]||m[0];el.target='_blank';el.rel='noopener noreferrer';}
  parent.append(el);end=m.index+m[0].length;
 }
 plain(parent,text.slice(end));return parent;
}
root.CampusRichText={render};
})(globalThis);
