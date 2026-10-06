import {Fragment} from 'react';
import {Box,Link} from '@mui/material';

/** A small Markdown subset. HTML and executable links are never rendered. */
export function RichText({text}:{text:string}){
 const tokens=text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>「」【】]+|\d{1,4}年\d{1,2}月\d{1,2}[日号](?:\s*\d{1,2}[:：]\d{2})?|\d{1,2}月\d{1,2}[日号](?:\s*\d{1,2}[:：]\d{2})?|\d{1,2}[:：]\d{2})/g);
 return <Box component="span" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{tokens.map((token,i)=>{
  if(token.startsWith('**'))return <strong key={i}>{token.slice(2,-2)}</strong>;
  if(token.startsWith('`'))return <Box component="code" key={i} sx={{fontFamily:'inherit',bgcolor:'action.hover',px:.6,borderRadius:1}}>{token.slice(1,-1)}</Box>;
  const markdown=token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
  if(markdown)return <Link key={i} href={markdown[2]} target="_blank" rel="noopener noreferrer">{markdown[1]}</Link>;
  if(/^https?:\/\//.test(token)){
   const url=token.replace(/[。，、；：！？）]+$/,'');const tail=token.slice(url.length);
   return <Fragment key={i}><Link href={url} target="_blank" rel="noopener noreferrer">{url}</Link>{tail}</Fragment>;
  }
  if(/^\d/.test(token)&&/[月:：]/.test(token))return <Box component="strong" key={i} sx={{color:'primary.main',fontWeight:650}}>{token}</Box>;
  return <Fragment key={i}>{token}</Fragment>;
 })}</Box>;
}
