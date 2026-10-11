import {Box,Button,Chip,Paper,Stack,Tooltip,Typography} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import {getNoticeStatus,priority} from '../../domain/notice';
import type {Notice,NoteTarget,Task} from '../../domain/types';
import {RichText} from '../../shared/ui/RichText';
import {compactNoticePreview,noticeOverview} from './notice-overview';

export interface NoticeActions {
 note:(notice:Notice,target:NoteTarget,title:string,text:string)=>void;
 view:(notice:Notice)=>void;
 details:(notice:Notice)=>void;
 calendar:(notice:Notice,task?:Task)=>void;
}

/** The list is a preview of saved text. All changes happen through explicit detail controls. */
export function NoticeCard({notice:n,actions,now,disabled=false}:{notice:Notice;actions:NoticeActions;now:number;disabled?:boolean}){
 const status=getNoticeStatus(n),p=priority(n,now),done=status==='completed'||status==='dismissed';
 const overview=noticeOverview(n),preview=compactNoticePreview(n);
 const statusLabel=p.label&&!done?p.label:done?(status==='dismissed'?'不适用':'已完成'):n.kind==='task'?'待办':'提醒';
 return <Paper component="article" variant="outlined" id={`notice-${n.id}`} className="notice-card" inert={disabled||undefined} aria-labelledby={`notice-heading-${n.id}`} sx={{p:{xs:1.5,sm:2},borderColor:'divider',pointerEvents:disabled?'none':undefined,opacity:done?.88:1}}>
  <Stack direction="row" sx={{alignItems:'flex-start',gap:1}}>
   <Typography component="h2" id={`notice-heading-${n.id}`} sx={{flex:1,minWidth:0,m:0,fontSize:'1.0625rem',fontWeight:700,lineHeight:1.45,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',overflowWrap:'anywhere'}}>{n.title}</Typography>
   <Chip size="small" label={statusLabel} color={p.label&&!done?(p.level==='overdue'?'error':'warning'):'default'} variant="outlined" sx={{flexShrink:0,fontSize:12,height:24}}/>
  </Stack>
  {preview.showSummary&&<Typography component="div" color="text.secondary" className="notice-summary" sx={{mt:.5,fontSize:13,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:1,WebkitBoxOrient:'vertical','& .rich-text':{display:'inline'},'& br':{display:'none'}}}><RichText text={preview.summary} inline/></Typography>}
  <Stack direction="row" sx={{alignItems:'center',gap:1,mt:.75,minHeight:20}}>
   {preview.audienceLabel&&<Typography variant="caption" className="notice-audience-preview" color="text.secondary" sx={{minWidth:0,flex:1,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{preview.audienceLabel}</Typography>}
   <Box sx={{flex:preview.audienceLabel?0:1}}/>
   {overview.notes&&<Tooltip title="已有笔记"><Box component="span" aria-label="已有笔记" sx={{display:'flex',color:'text.secondary'}}><EditNote sx={{fontSize:18}}/></Box></Tooltip>}
   {overview.total>0&&<Typography variant="caption" color="text.secondary" sx={{flexShrink:0,fontVariantNumeric:'tabular-nums'}} aria-label={`已完成${overview.completed}项任务，共${overview.total}项任务`}>{overview.completed}/{overview.total}</Typography>}
  </Stack>
  <Stack direction="row" className="notice-actions" sx={{alignItems:'center',gap:1,mt:.75,minHeight:44}}>
   <Typography variant="caption" className="notice-time-preview" color={p.level==='overdue'&&!done?'error.main':'text.secondary'} sx={{flex:1,minWidth:0,fontVariantNumeric:'tabular-nums',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{preview.timeLabel}{preview.timesCount>1?' · 多个时间':''}</Typography>
   <Button size="small" variant="outlined" aria-label={`查看：${n.title}`} onClick={()=>actions.view(n)} disabled={disabled} sx={{flexShrink:0,minWidth:64,minHeight:44}}>查看</Button>
  </Stack>
 </Paper>;
}
