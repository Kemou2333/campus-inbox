/** Source spans are deterministic UTF-16 slices of the saved, trimmed original. */
export function segmentSource(value){
 if(typeof value!=='string')return [];
 const source=value.trim(),segments=[];let start=0;
 function add(end){const raw=source.slice(start,end),left=raw.length-raw.trimStart().length,right=raw.trimEnd().length;if(right>left)segments.push({index:segments.length+1,start:start+left,end:start+right,text:source.slice(start+left,start+right)});start=end;}
 for(let i=0;i<source.length;i++){
  if(/[\r\n。！？]/.test(source[i])||i-start>=319){if(/[\uD800-\uDBFF]/.test(source[i])&&/[\uDC00-\uDFFF]/.test(source[i+1]||''))i++;add(i+1);}
 }
 if(start<source.length)add(source.length);return segments;
}
export function evidencePaths(analysis){
 const paths=[];const put=(path,value)=>{if(typeof value==='string'&&value.trim())paths.push(path);};
 for(const field of ['title','summary','deadlineText'])put(field,analysis?.[field]);
 for(const field of ['materials','warnings','reminders','reminderTitles'])for(const [i,value] of (analysis?.[field]||[]).entries())put(`${field}.${i}`,typeof value==='object'?value?.text:value);
 for(const [i,t] of (analysis?.timeline||[]).entries())for(const field of ['label','timeText','location'])put(`timeline.${i}.${field}`,t[field]);
 for(const [i,t] of (analysis?.tasks||[]).entries()){
  for(const field of ['text','assignee','condition','timeText','location'])put(`tasks.${i}.${field}`,t[field]);
  for(const [j,value] of (t.details||[]).entries())put(`tasks.${i}.details.${j}`,value);
  for(const [j,s] of (t.steps||[]).entries()){
   put(`tasks.${i}.steps.${j}.text`,s.text);
   for(const [k,value] of (s.details||[]).entries())put(`tasks.${i}.steps.${j}.details.${k}`,value);
  }
 }
 return paths;
}
export function parseSourceRefs(value,analysis,sourceText){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>180)throw new Error('出处格式不正确');
 const paths=evidencePaths(analysis),allowed=new Set(paths),groups=new Map(),limit=sourceText===undefined?12000:segmentSource(sourceText).length,result={};
 for(const field of ['tasks','timeline'])for(const [i] of (analysis?.[field]||[]).entries()){
  const group=`${field}.${i}`,children=paths.filter(path=>path.startsWith(group+'.'));
  if(children.length)groups.set(group,children);
  if(field==='tasks')for(const [j] of (analysis.tasks[i].steps||[]).entries()){
   const step=`${group}.steps.${j}`,stepChildren=paths.filter(path=>path.startsWith(step+'.'));
   if(stepChildren.length)groups.set(step,stepChildren);
  }
 }
 for(const [path,refs] of Object.entries(value)){
  if(!allowed.has(path)&&!groups.has(path)||!Array.isArray(refs)||!refs.length||refs.length>8||refs.some(id=>!Number.isSafeInteger(id)||id<1||id>limit)||new Set(refs).size!==refs.length)throw new Error('出处无法对应原文');
 }
 // A model can cite one task's supporting paragraph once. Persist expanded
 // field references so every visible sentence still has its own source link.
 for(const [group,children] of groups)if(Object.hasOwn(value,group))for(const path of children)result[path]=[...value[group]];
 // More specific references override inherited ones, regardless of key order.
 for(const [path,refs] of Object.entries(value))if(allowed.has(path))result[path]=[...refs];
 if(Object.keys(result).length>180)throw new Error('出处格式不正确');
 return result;
}
function correctionLimit(path){
 if(path==='title')return 200;if(path==='summary')return 2000;if(path==='deadlineText')return 500;
 if(/^reminderTitles\.\d+$/.test(path))return 16;
 if(/^tasks\.\d+\.assignee$/.test(path))return 80;if(/^tasks\.\d+\.condition$/.test(path))return 120;
 if(/^tasks\.\d+\.steps\.\d+\.text$/.test(path))return 60;
 if(/^tasks\.\d+\.steps\.\d+\.details\.\d+$/.test(path))return 500;
 if(/^timeline\.\d+\.label$/.test(path))return 200;
 if(/\.(?:timeText|location)$/.test(path))return 500;return 2000;
}
export function parseCorrections(value,analysis){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['updatedAt','values'].includes(k))||typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt))||!Array.isArray(value.values)||value.values.length>150||new TextEncoder().encode(JSON.stringify(value)).length>30720)throw new Error('人工修正格式不正确');
 const allowed=new Set(evidencePaths(analysis)),seen=new Set();
 // Empty but existing scalar fields can also be corrected.
 for(const [i,t] of (analysis.tasks||[]).entries())for(const field of ['scope','assignee','condition','timeText','location'])allowed.add(`tasks.${i}.${field}`);
 allowed.add('deadlineText');
 for(const [i] of (analysis.timeline||[]).entries())for(const field of ['label','timeText','location'])allowed.add(`timeline.${i}.${field}`);
 const values=value.values.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['path','value'].includes(k))||!allowed.has(item.path)||seen.has(item.path)||typeof item.value!=='string'||item.value.length>correctionLimit(item.path)||(/^reminderTitles\./.test(item.path)&&Array.from(item.value.trim()).length<2))throw new Error('人工修正无法对应通知字段');
  const required=/^(?:title|summary|reminderTitles\.\d+|(?:materials|warnings|reminders)\.\d+|tasks\.\d+\.(?:text|details\.\d+|steps\.\d+\.(?:text|details\.\d+))|timeline\.\d+\.label)$/.test(item.path);
  if(!item.value.trim()&&required)throw new Error('人工修正内容不能为空');
  if(/^tasks\.\d+\.scope$/.test(item.path)&&!['all','conditional','role','unspecified'].includes(item.value))throw new Error('人工修正适用范围不正确');
  seen.add(item.path);return {path:item.path,value:item.value};
 });
 const tasks=(analysis.tasks||[]).map(t=>({...t}));
 for(const item of values){const match=item.path.match(/^tasks\.(\d+)\.(scope|assignee|condition)$/);if(match)tasks[Number(match[1])][match[2]]=item.value;}
 if(tasks.some(t=>t.scope==='conditional'&&!t.condition?.trim()||t.scope==='role'&&!t.assignee?.trim()))throw new Error('人工修正适用范围缺少对象或条件');
 return {updatedAt:value.updatedAt,values};
}
