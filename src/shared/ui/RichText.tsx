import {Box,Link} from '@mui/material';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ReadingNode={type:string;value?:string;children?:ReadingNode[];position?:{start:{offset?:number};end:{offset?:number}}};
/** CommonMark treats % and Chinese brackets as punctuation. Closing emphasis next to
 * Chinese prose can therefore remain literal (e.g. **20%**的视频). Repair only
 * untouched prose text nodes, never escaped text, code, links or their destinations. */
function remarkChineseEmphasis(){
 return (tree:unknown,file:{value:unknown})=>{
  const source=String(file.value);
  function walk(parent:ReadingNode){
   if(!parent.children||['link','linkReference','code','inlineCode','html'].includes(parent.type))return;
   parent.children=parent.children.flatMap(node=>{
    if(node.type!=='text'||!node.value){walk(node);return [node];}
    const start=node.position?.start.offset,end=node.position?.end.offset;
    // A backslash escape/entity changes the source spelling; retain its literal intent.
    if(start===undefined||end===undefined||source.slice(start,end)!==node.value)return [node];
    const value=node.value,parts:ReadingNode[]=[];let cursor=0;
    for(const match of value.matchAll(/(\*\*|__)([^\n*_`]+?)\1/g)){
     const at=match.index,content=match[2],before=value[at-1]??'',after=value[at+match[0].length]??'';
     if(/^\s|\s$/.test(content)||!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(before+after))continue;
     if(at>cursor)parts.push({type:'text',value:value.slice(cursor,at)});
     parts.push({type:'strong',children:[{type:'text',value:content}]});cursor=at+match[0].length;
    }
    if(!parts.length)return [node];
    if(cursor<value.length)parts.push({type:'text',value:value.slice(cursor)});
    return parts;
   });
  }
  walk(tree as ReadingNode);
 };
}

export function safeMarkdownURL(value:string){
 try {const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}
}
/** Text and safe links only: no HTML execution or remote image downloads. */
export function RichText({text,inline=false}:{text:string;inline?:boolean}){
 return <Box component={inline?'span':'div'} className="rich-text" sx={{overflowWrap:'anywhere',
  '& p':{m:0,whiteSpace:'pre-wrap'},'& p + p':{mt:.75},'& strong':{fontWeight:700,color:'text.primary'},
  '& ul, & ol':{my:.75,pl:2.5},'& li + li':{mt:.35},'& li > p':{display:'inline'},
  '& code':{fontFamily:'inherit',fontSize:'.95em',bgcolor:'action.hover',px:.5,borderRadius:.5},
  '& pre':{whiteSpace:'pre-wrap',p:1.5,bgcolor:'action.hover',borderRadius:2,overflow:'auto'},
  '& blockquote':{m:0,my:.75,pl:1.5,borderLeft:'3px solid',borderColor:'divider'},
  '& table':{display:'block',overflowX:'auto',borderCollapse:'collapse',my:1},'& th, & td':{border:'1px solid',borderColor:'divider',p:1,textAlign:'left'},
  '& h1, & h2, & h3, & h4, & h5, & h6':{fontSize:'1em',fontWeight:700,mt:1,mb:.5}}}>
  <Markdown remarkPlugins={[remarkGfm,remarkChineseEmphasis]} skipHtml urlTransform={safeMarkdownURL}
   allowedElements={inline?['p','strong','em','del','code','a','br']:undefined}
   unwrapDisallowed={inline}
   components={{
    p:({children})=>inline?<span>{children}</span>:<p>{children}</p>,
    a:({href,children})=>{
     if(!href)return <span>{children}</span>;
     const words=typeof children==='string'?children:Array.isArray(children)&&children.every(item=>typeof item==='string')?children.join(''):'';
     const bare=words===href||safeMarkdownURL(words)===href;
     return <Link href={href} title={bare?href:undefined} target="_blank" rel="noopener noreferrer" underline="always">{bare?new URL(href).host:children}</Link>;
    },
    img:()=>null,
    input:()=>null
   }}>{text}</Markdown>
 </Box>;
}
