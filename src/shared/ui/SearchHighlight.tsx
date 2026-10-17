import {createContext,useContext,Fragment} from 'react';
import {Box} from '@mui/material';

export const SearchQueryContext=createContext('');
export function useSearchQuery(){return useContext(SearchQueryContext);}
export function searchTextParts(text:string,query:string):{text:string;match:boolean}[]{
 const needle=query.trim();if(!needle||needle.length>4000)return [{text,match:false}];
 const pattern=new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');
 const parts:{text:string;match:boolean}[]=[];let cursor=0;
 for(const found of text.matchAll(pattern)){const at=found.index;if(at>cursor)parts.push({text:text.slice(cursor,at),match:false});parts.push({text:found[0],match:true});cursor=at+found[0].length;}
 if(cursor<text.length)parts.push({text:text.slice(cursor),match:false});return parts.length?parts:[{text,match:false}];
}
export const searchMarkStyle={bgcolor:(theme:{palette:{mode:string}})=>theme.palette.mode==='dark'?'#6d541e':'#ffe69a',color:(theme:{palette:{mode:string}})=>theme.palette.mode==='dark'?'#fff4d7':'#402d00',borderRadius:.5,px:.1,boxDecorationBreak:'clone'};
export function HighlightedText({text}:{text:string}){const query=useSearchQuery();return <>{searchTextParts(text,query).map((part,i)=>part.match?<Box component="mark" className="search-match" key={i} sx={searchMarkStyle}>{part.text}</Box>:<Fragment key={i}>{part.text}</Fragment>)}</>;}

/** Text-node-only AST transform: query text never becomes HTML or a pattern. */
export function remarkSearchHighlight({query}:{query:string}){
 return (tree:unknown)=>{
  type Node={type:string;value?:string;children?:Node[];data?:unknown};
  function walk(node:Node){if(!node.children)return;node.children=node.children.flatMap(child=>{
   if(child.type==='text'&&child.value)return searchTextParts(child.value,query).map(part=>part.match?{type:'emphasis',data:{hName:'mark',hProperties:{className:'search-match'}},children:[{type:'text',value:part.text}]}:{type:'text',value:part.text});
   if(!['html','code','inlineCode'].includes(child.type))walk(child);return [child];
  });}walk(tree as Node);
 };
}
