import {Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,Divider,Stack,Typography} from '@mui/material';
import type {Notice} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {RichText} from '../../shared/ui/RichText';
import {AttachmentList} from '../attachments/AttachmentList';
export function DetailDialog({notice,app,onClose}:{notice:Notice|null;app:CampusController;onClose:()=>void}){
 return <Dialog open={!!notice} onClose={onClose}>
  <DialogTitle>{notice?.title}</DialogTitle>
  <DialogContent><Stack spacing={2}>
   {!!notice?.summary&&<Typography component="div"><RichText text={notice.summary}/></Typography>}
   {!!notice?.timeline.length&&<Box><Typography variant="h6" sx={{mb:1}}>时间与地点</Typography><Stack spacing={1}>{notice.timeline.map((item,i)=><Box key={i}><Typography sx={{fontWeight:600}}>{item.label}</Typography><Typography color="text.secondary">{item.timeText||'时间待确认'}{item.location?` · ${item.location}`:''}</Typography></Box>)}</Stack></Box>}
   {!!notice?.materials.length&&<Box><Typography variant="h6" sx={{mb:1}}>需要准备</Typography>{notice.materials.map((text,i)=><Typography component="div" key={i} sx={{mb:.6}}>• <RichText text={text} inline/></Typography>)}</Box>}
   {!!notice?.warnings.length&&<Box><Typography variant="h6" sx={{mb:1,color:'warning.main'}}>注意事项</Typography>{notice.warnings.map((text,i)=><Typography component="div" key={i} sx={{mb:.6}}>• <RichText text={text} inline/></Typography>)}</Box>}
   <AttachmentList ids={notice?.attachments??[]} platform={app.platform}/>
   <Divider/><Typography variant="h6">通知原文</Typography>
   <Box className="detail-original" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.75}}>{notice?.originalText||'未保存原文'}</Box>
  </Stack></DialogContent>
  <DialogActions><Button variant="contained" onClick={onClose}>关闭</Button></DialogActions>
 </Dialog>;
}
