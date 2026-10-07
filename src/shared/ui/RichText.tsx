import {Box,Link} from '@mui/material';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeMarkdownURL}
   allowedElements={inline?['p','strong','em','del','code','a','br']:undefined}
   unwrapDisallowed={inline}
   components={{
    p:({children})=>inline?<span>{children}</span>:<p>{children}</p>,
    a:({href,children})=>href?<Link href={href} target="_blank" rel="noopener noreferrer" underline="always">{children}</Link>:<span>{children}</span>,
    img:()=>null,
    input:()=>null
   }}>{text}</Markdown>
 </Box>;
}
