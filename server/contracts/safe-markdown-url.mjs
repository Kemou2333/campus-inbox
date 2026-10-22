// GFM's bare autolinks include Chinese sentence punctuation. Explicit Markdown
// destinations stay complete; only a proven bare source label gets this boundary.
export const markdownLiteralURL=value=>value.split(/[（）【】“”，。！？；：、]/u,1)[0];
export function safeMarkdownURL(value,literal=null){
 try{
  const url=new URL(value);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return '';
  if(typeof literal==='string'&&/^(?:https?:\/\/|www\.)/i.test(literal)){
   const bounded=markdownLiteralURL(literal);
   if(bounded!==literal){
    const target=new URL(/^www\./i.test(bounded)?`http://${bounded}`:bounded);
    return ['https:','http:'].includes(target.protocol)&&!target.username&&!target.password?target.href:'';
   }
  }
  return url.href;
 }catch{return '';}
}

/** HAST keeps the original link offsets, so labels cannot impersonate autolinks. */
export function literalMarkdownLabel(node,text){
 const start=node?.position?.start?.offset,end=node?.position?.end?.offset;
 if(start===undefined||end===undefined||node.tagName!=='a')return null;
 const words=item=>item.type==='text'?item.value??'':item.children?.map(words).join('')??'';
 const label=node.children?.map(words).join('')??'';
 return text.slice(start,end)===label?label:null;
}
