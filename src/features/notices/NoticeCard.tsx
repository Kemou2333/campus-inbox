import {useRef} from 'react';
import {alpha,Box,Button,Chip,Collapse,IconButton,Paper,Stack,Tooltip,Typography,useMediaQuery} from '@mui/material';
import EditNote from '@mui/icons-material/EditNote';
import Check from '@mui/icons-material/Check';
import Undo from '@mui/icons-material/Undo';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Schedule from '@mui/icons-material/Schedule';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import PeopleOutline from '@mui/icons-material/PeopleOutlined';
import {getNoticeStatus,priority,setNoticeCompleted} from '../../domain/notice';
import type {Notice,NoteTarget,Task} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {RichText} from '../../shared/ui/RichText';
import {plainReadingText} from '../../domain/reading';
import {displayTime,noticeOverview,summaryPreview} from './notice-overview';
import {NoticeDetailContent} from './NoticeDetailContent';

export interface NoticeActions {
 note:(notice:Notice,target:NoteTarget,title:string,text:string)=>void;
 details:(notice:Notice)=>void;
 calendar:(notice:Notice,task?:Task)=>void;
}
export function NoticeCard({notice:n,app,actions,now,expanded,onExpandedChange,disabled=false}:{notice:Notice;app:CampusController;actions:NoticeActions;now:number;expanded:boolean;onExpandedChange:()=>void;disabled?:boolean}){
 const status=getNoticeStatus(n),p=priority(n,now),done=status==='completed'||status==='dismissed';
 const overview=noticeOverview(n),preview=summaryPreview(n),reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const expandButton=useRef<HTMLButtonElement>(null),bodyID=`notice-body-${n.id}`;
 const summary=plainReadingText(preview.text).trim();
 const showSummary=!!summary&&summary!==plainReadingText(n.title).trim();
 const audience=overview.audiences.length===1&&Array.from(overview.audiences[0]).length<=36?overview.audiences[0]:overview.audiences.length>1?`共${overview.audiences.length}类对象 · 展开查看`:'特定同学 · 适用条件见详情';
 const deadline=!!(n.localDeadline||n.deadlineText||n.deadline),time=overview.times[0]??'';
 const tone=p.level==='overdue'&&!done?'error':'primary';
 function closeFromBottom(){onExpandedChange();requestAnimationFrame(()=>{expandButton.current?.focus({preventScroll:true});document.getElementById(`notice-${n.id}`)?.scrollIntoView({block:'start',behavior:reducedMotion?'instant':'smooth'});});}
 return <Paper component="article" variant="outlined" id={`notice-${n.id}`} className="notice-card" inert={disabled||undefined} aria-labelledby={`notice-heading-${n.id}`} sx={{p:{xs:2,sm:2.5},borderColor:'divider',pointerEvents:disabled?'none':undefined,opacity:done?.85:1}}>
  <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:1,mb:1.25}}>
   <Chip size="small" label={p.label&&!done?p.label:done?(status==='dismissed'?'不适用':'已完成'):n.kind==='task'?'待办':'提醒'} color={done?'default':p.label?(p.level==='overdue'?'error':'warning'):n.kind==='task'?'primary':'secondary'} variant={p.label&&!done?'filled':'outlined'} sx={{fontSize:13,fontWeight:700,height:28}}/>
   <Stack direction="row" sx={{alignItems:'center',gap:.75}}>
    {overview.notes&&<Tooltip title="已有笔记"><EditNote aria-label="已有笔记" sx={{fontSize:20,color:'primary.main'}}/></Tooltip>}
    {overview.total>0&&<Typography variant="body2" color="text.secondary" sx={{fontVariantNumeric:'tabular-nums'}} aria-label={`已完成${overview.completed}项任务，共${overview.total}项任务`}>{overview.completed}/{overview.total} 项完成</Typography>}
   </Stack>
  </Stack>
  <Typography component="h2" id={`notice-heading-${n.id}`} sx={{m:0,fontSize:{xs:24,sm:28},fontWeight:750,lineHeight:1.35,overflowWrap:'anywhere'}}>{n.title}</Typography>
  {showSummary&&<Typography component="div" className="notice-summary" color="text.secondary" sx={{mt:1,fontSize:16,lineHeight:1.7}}><RichText text={preview.text}/></Typography>}
  {!!overview.audiences.length&&<Stack direction="row" className="notice-audiences" sx={{mt:1.5,px:1.25,py:1,gap:1,alignItems:'flex-start',border:'1px solid',borderColor:'warning.main',borderRadius:'12px',bgcolor:theme=>alpha(theme.palette.warning.main,.07)}}>
   <PeopleOutline sx={{fontSize:20,mt:.25,color:'warning.main'}}/><Box sx={{minWidth:0}}><Typography component="div" sx={{fontSize:12,fontWeight:700,color:'warning.main'}}>适用人群</Typography><Typography className="notice-audience-preview" sx={{fontSize:15,lineHeight:1.6,overflowWrap:'anywhere'}}>{audience}</Typography></Box>
  </Stack>}
  {!!(time||overview.locations.length===1)&&<Stack className="notice-overview" spacing={.75} sx={{mt:1.25,p:1.25,borderRadius:'12px',border:'1px solid',borderColor:`${tone}.main`,bgcolor:theme=>alpha(theme.palette[tone].main,.08)}}>
   {!!time&&<Stack direction="row" sx={{alignItems:'flex-start',gap:1}}><Schedule sx={{fontSize:20,mt:.25,color:`${tone}.main`}}/><Box sx={{minWidth:0}}><Typography sx={{fontSize:12,fontWeight:700,color:`${tone}.main`}}>{deadline?'截止时间':'时间'}</Typography><Typography className="notice-time-preview" sx={{fontSize:17,fontWeight:700,lineHeight:1.5,fontVariantNumeric:'tabular-nums',overflowWrap:'anywhere'}}>{displayTime(time.replace(/^截止[：:]\s*/,''))}</Typography>{overview.times.length>1&&<Typography sx={{fontSize:13,color:'text.secondary'}}>其他时间见详情</Typography>}</Box></Stack>}
   {overview.locations.length===1&&<Stack direction="row" sx={{alignItems:'flex-start',gap:1}}><PlaceOutlined sx={{fontSize:20,mt:.2,color:'primary.main'}}/><Typography sx={{fontSize:15,lineHeight:1.6,overflowWrap:'anywhere'}}>{overview.locations[0]}</Typography></Stack>}
  </Stack>}
  <Stack direction="row" className="notice-actions" sx={{alignItems:'center',gap:.75,mt:1.75}}>
   <Button ref={expandButton} className="notice-expand" variant={expanded?'contained':'outlined'} aria-expanded={expanded} aria-controls={bodyID} aria-label={`${expanded?'收起详情':'展开详情'}：${n.title}`} onClick={onExpandedChange} disabled={disabled} endIcon={<ExpandMore sx={{transform:expanded?'rotate(180deg)':'none'}}/>} sx={{flex:1,minWidth:0,fontSize:15}}>{expanded?'收起详情':'展开详情'}</Button>
   <Tooltip title={done?'恢复':n.kind==='task'?'完成':'知悉'}><span><IconButton className="notice-complete" aria-label={done?'恢复':n.kind==='task'?'完成':'知悉'} onClick={()=>app.act(n.id,v=>setNoticeCompleted(v,!done),done?'已恢复':'已完成')} disabled={disabled} sx={{color:'success.main',bgcolor:theme=>alpha(theme.palette.success.main,.1)}}>{done?<Undo/>:<Check/>}</IconButton></span></Tooltip>
   <Tooltip title="删除"><IconButton aria-label={`删除${n.title}`} onClick={()=>app.remove(n.id)} disabled={disabled} sx={{color:'text.secondary'}}><DeleteOutline/></IconButton></Tooltip>
  </Stack>
  <Box id={bodyID} className="notice-body" aria-hidden={!expanded}>
   <Collapse in={expanded} timeout={reducedMotion?0:240} unmountOnExit>
    <Box sx={{mt:2,pt:2,borderTop:'1px solid',borderColor:'divider'}}>
     <Stack direction="row" spacing={1} sx={{mb:2,flexWrap:'wrap',rowGap:1}}><Button variant="outlined" size="small" onClick={()=>actions.details(n)}>原文与附件</Button>{n.kind==='task'&&!done&&<Button variant="outlined" size="small" onClick={()=>actions.calendar(n)}>创建提醒</Button>}</Stack>
     <NoticeDetailContent notice={n} app={app} actions={actions}/>
     <Button fullWidth onClick={closeFromBottom} sx={{mt:2}}>收起并返回标题</Button>
    </Box>
   </Collapse>
  </Box>
 </Paper>;
}
