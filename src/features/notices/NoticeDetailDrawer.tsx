import {useRef} from 'react';
import {Box,Button,Drawer,IconButton,Stack,Tooltip,Typography} from '@mui/material';
import Close from '@mui/icons-material/Close';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import {getNoticeStatus,setNoticeCompleted} from '../../domain/notice';
import type {Notice} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import type {NoticeActions} from './NoticeCard';
import {NoticeDetailContent} from './NoticeDetailContent';

export function NoticeDetailDrawer({notice,app,actions,onClose,onExited}:{notice:Notice|null;app:CampusController;actions:NoticeActions;onClose:()=>void;onExited:()=>void}){
 const previous=useRef<Notice|null>(null);if(notice)previous.current=notice;
 const n=notice??previous.current,status=n?getNoticeStatus(n):null,done=status==='completed'||status==='dismissed';
 return <Drawer anchor="right" open={!!notice} onClose={onClose} ModalProps={{disableRestoreFocus:true}} slotProps={{paper:{role:'dialog','aria-modal':true,'aria-labelledby':'notice-detail-title',sx:{width:{xs:'100%',sm:560,md:640},maxWidth:'100%',height:'100dvh',pt:'var(--safe-top)',pb:'var(--safe-bottom)',display:'flex',overflow:'hidden'}},transition:{onExited}}}>
  {n&&<>
   <Stack direction="row" sx={{alignItems:'center',gap:1,p:1.5,borderBottom:'1px solid',borderColor:'divider',flexShrink:0}}>
    <Typography component="span" variant="subtitle1" sx={{flex:1,minWidth:0}}>通知详情</Typography>
    <IconButton aria-label="返回通知列表" onClick={onClose} sx={{flexShrink:0}}><Close/></IconButton>
   </Stack>
   <Box className="notice-detail-scroll" sx={{flex:1,minHeight:0,overflowY:'auto',overflowX:'hidden',overscrollBehavior:'contain',p:{xs:2,sm:3}}}><Typography component="h2" id="notice-detail-title" sx={{fontSize:'1.25rem',fontWeight:700,lineHeight:1.45,overflowWrap:'anywhere',mb:1.5}}>{n.title}</Typography><NoticeDetailContent key={notice?.id??'closed'} notice={n} app={app} actions={actions}/></Box>
   <Stack direction="row" className="notice-detail-actions" sx={{alignItems:'center',gap:.75,p:{xs:1.25,sm:2},borderTop:'1px solid',borderColor:'divider',flexWrap:'wrap',flexShrink:0}}>
    <Button size="small" variant="outlined" aria-label="原文与附件" onClick={()=>actions.details(n)}>原文</Button>
    {n.kind==='task'&&!done&&<Button size="small" onClick={()=>actions.calendar(n)}>创建提醒</Button>}
    <Box sx={{flex:1,minWidth:0}}/>
    <Button size="small" variant="contained" onClick={()=>app.act(n.id,v=>setNoticeCompleted(v,!done),done?'已恢复':'已完成')}>{done?'恢复':n.kind==='task'?'完成':'知悉'}</Button>
    <Tooltip title="删除"><IconButton aria-label={`删除${n.title}`} onClick={()=>app.remove(n.id)} sx={{color:'text.secondary'}}><DeleteOutline/></IconButton></Tooltip>
   </Stack>
  </>}
 </Drawer>;
}
