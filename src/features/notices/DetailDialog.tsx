import {Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,Stack} from '@mui/material';
import type {Notice} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {AttachmentList} from '../attachments/AttachmentList';
export function DetailDialog({notice,app,onClose}:{notice:Notice|null;app:CampusController;onClose:()=>void}){
 return <Dialog open={!!notice} onClose={onClose}>
  <DialogTitle>原文 · {notice?.title}</DialogTitle>
  <DialogContent><Stack spacing={2}>
   <Box className="detail-original" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.75}}>{notice?.originalText||'未保存原文'}</Box>
   <AttachmentList ids={notice?.attachments??[]} platform={app.platform}/>
  </Stack></DialogContent>
  <DialogActions><Button variant="contained" onClick={onClose}>关闭</Button></DialogActions>
 </Dialog>;
}
