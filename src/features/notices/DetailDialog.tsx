import {useEffect,useRef} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Typography} from '@mui/material';
import type {Notice} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {AttachmentList} from '../attachments/AttachmentList';
import {evidenceFor} from '../../domain/source-evidence';
import {HighlightedText,useSearchQuery} from '../../shared/ui/SearchHighlight';
import {effectiveNotice,textField} from '../../domain/corrections';
export function DetailDialog({notice,app,onClose,path,onCorrect,readOnly=false}:{notice:Notice|null;app:CampusController;onClose:()=>void;path?:string;onCorrect?:(notice:Notice,path?:string)=>void;readOnly?:boolean}){
 const query=useSearchQuery();
 const firstMark=useRef<HTMLElement|null>(null),evidence=notice&&path?evidenceFor(notice,path):null;
 const original=notice?.originalText??'',spans=evidence?.segments??[];
 const parts:{text:string;marked:boolean;index?:number}[]=[];let cursor=0;
 for(const span of [...spans].sort((a,b)=>a.start-b.start)){parts.push({text:original.slice(cursor,span.start),marked:false},{text:original.slice(span.start,span.end),marked:true,index:span.index});cursor=span.end;}
 parts.push({text:original.slice(cursor),marked:false});
 useEffect(()=>{if(!notice||!query||path)return;const timer=setTimeout(()=>document.querySelector('.detail-original .search-match')?.scrollIntoView({block:'center',behavior:'instant'}),180);return()=>clearTimeout(timer);},[notice?.id,query,path]);
 useEffect(()=>{if(!notice||!path)return;const timer=setTimeout(()=>firstMark.current?.scrollIntoView({block:'center',behavior:'instant'}),180);return()=>clearTimeout(timer);},[notice?.id,path]);
 return <Dialog open={!!notice} onClose={onClose}>
  <DialogTitle>原文 · {notice?.title}</DialogTitle>
  <DialogContent><Stack spacing={2}>
   {path&&notice&&<><Alert severity={evidence?.segments.length?'info':'warning'}>{evidence?.edited?'这段内容经过人工修改，请重新对照原文。':evidence?.inferred?'下面仅是本机文字匹配的可能出处，请自行核对。':evidence?.segments.length?'出处由 AI 关联；高亮只表示原文位置，不代表内容已核实。':'这段内容尚未关联出处，请对照完整原文。'}</Alert><Box sx={{p:1.25,bgcolor:'action.hover',borderRadius:1}}><Typography variant="body2" color="text.secondary">{textField(notice,path)?.label}</Typography><Typography sx={{mt:.5,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{textField(effectiveNotice(notice),path)?.value}</Typography></Box></>}
   <Box className="detail-original" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.75}}>{original?parts.map((part,i)=>part.marked?<Box component="mark" key={i} data-source-index={part.index} ref={(node:HTMLElement|null)=>{if(i===parts.findIndex(p=>p.marked))firstMark.current=node;}} sx={{bgcolor:'warning.light',color:'warning.contrastText',borderRadius:.5,px:.15}}>{<HighlightedText text={part.text}/>}</Box>:<HighlightedText key={i} text={part.text}/>):'未保存原文'}</Box>
   {!readOnly&&<AttachmentList ids={notice?.attachments??[]} platform={app.platform}/>}
   {readOnly&&!!notice?.attachments.length&&<Typography variant="body2" color="text.secondary">附件保存在用户本机。</Typography>}
  </Stack></DialogContent>
  <DialogActions>{!readOnly&&notice&&onCorrect&&<Button onClick={()=>onCorrect(notice,path)}>修正</Button>}<Button variant="contained" onClick={onClose}>关闭</Button></DialogActions>
 </Dialog>;
}
