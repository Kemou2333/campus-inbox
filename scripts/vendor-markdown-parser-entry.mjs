// Build-time entry: the same parse core/extensions used by remark-parse + remark-gfm.
import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfm} from 'micromark-extension-gfm';
import {gfmFromMarkdown} from 'mdast-util-gfm';

export function markdownLinkTargets(text,{source=false}={}){
 const tree=fromMarkdown(text,{extensions:[gfm()],mdastExtensions:[gfmFromMarkdown()]}),definitions=new Map(),targets=[];
 function visit(node,fn){fn(node);for(const child of node.children??[])visit(child,fn);}
 visit(tree,node=>{if(node.type==='definition'&&!definitions.has(node.identifier.toUpperCase()))definitions.set(node.identifier.toUpperCase(),node);});
 visit(tree,node=>{
  if(node.type==='link'||node.type==='linkReference'){
   const url=node.type==='link'?node.url:definitions.get(node.identifier.toUpperCase())?.url;
   if(typeof url!=='string')return;
   const label=node.children?.map(child=>child.type==='text'?child.value:'').join('')??'';
   const start=node.position?.start.offset,end=node.position?.end.offset;
   const literal=node.type==='link'&&start!==undefined&&end!==undefined&&text.slice(start,end)===label?label:null;
   targets.push({url,literal});
  }else if(source&&node.type==='definition')targets.push({url:node.url,literal:null});
  else if(source&&(node.type==='code'||node.type==='inlineCode'))targets.push(...markdownLinkTargets(node.value));
 });
 return targets;
}
