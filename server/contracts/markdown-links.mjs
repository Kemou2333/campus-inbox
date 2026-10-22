import {markdownLinkTargets} from '../vendor/markdown-parser.mjs';
import {markdownLiteralURL,safeMarkdownURL} from './safe-markdown-url.mjs';

const http=value=>{try{return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}};
const spelling=target=>target.literal?markdownLiteralURL(target.literal):target.url;
export function ownSourceLinks(value,source){
 const allowed=markdownLinkTargets(source,{source:true});
 // Plain notices also use Chinese brackets/quotes as prose separators. Reparse
 // only bare autolinks; never cut an explicit Markdown destination/definition.
 for(const target of [...allowed])if(target.literal)allowed.push(...markdownLinkTargets(target.literal.replace(/[（）【】“”，。！？；：、]/gu,'\n')));
 const originals=allowed.map(target=>({...target,href:safeMarkdownURL(target.url,target.literal),raw:spelling(target)})).filter(target=>target.href);
 const matches=target=>{
  if(!http(target.url))return true; // The renderer makes non-HTTP(S) targets inert.
  const href=safeMarkdownURL(target.url,target.literal),raw=spelling(target);
  if(!href)return false; // Credentials must never turn a source prefix into a host.
  const destination=new URL(href);
  return originals.some(original=>original.href===href||original.literal&&/^[\x21-\x7E]+$/.test(raw)&&(destination.pathname!=='/'||destination.search)&&new URL(original.href).origin===destination.origin&&original.raw.startsWith(raw)&&/^\p{Script=Han}/u.test(original.raw.slice(raw.length)));
 };
 const walk=item=>typeof item==='string'?markdownLinkTargets(item).every(matches):Array.isArray(item)?item.every(walk):item&&typeof item==='object'?Object.values(item).every(walk):true;
 return walk(value);
}
