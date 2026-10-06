import {useEffect,useState} from 'react';
import {Alert,Button,Dialog,DialogActions,DialogContent,DialogTitle,TextField,Typography} from '@mui/material';
import type {CampusController} from '../../app/useCampus';
import type {NoteTarget} from '../../domain/types';
import {updateNote} from '../../domain/notice';
export interface NoteEditor {noticeID:string;target:NoteTarget;title:string;text:string}

export function NoteDialog({editor,app,onClose}:{editor:NoteEditor|null;app:CampusController;onClose:()=>void}){
 const [text,setText]=useState('');const [failed,setFailed]=useState(false);
 useEffect(()=>{if(editor){setText(editor.text);setFailed(false);}},[editor]);
 function write(value:string){setText(value);if(!editor)return;const result=app.update(editor.noticeID,n=>updateNote(n,editor.target,value));setFailed(!result);}
 function close(){if(editor&&failed&&!app.update(editor.noticeID,n=>updateNote(n,editor.target,text)))return;onClose();}
 return <Dialog open={!!editor} onClose={close}>
  <DialogTitle>事项笔记</DialogTitle>
  <DialogContent><Typography sx={{mb:2}} color="text.secondary">{editor?.title}</Typography>
   {failed&&<Alert severity="error" sx={{mb:2}}>笔记尚未保存，请保留此窗口并重试。</Alert>}
   <TextField autoFocus multiline minRows={5} maxRows={12} value={text} placeholder="记下办理进度、提交内容或需要确认的事…" onChange={e=>write(e.target.value)} slotProps={{htmlInput:{maxLength:4000,'aria-label':'事项笔记'}}}/>
   <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1,textAlign:'right'}}>{text.length} / 4,000 · {failed?'未保存':'已保存'}</Typography>
  </DialogContent>
  <DialogActions><Button variant="contained" onClick={close}>{failed?'重试保存':'完成'}</Button></DialogActions>
 </Dialog>;
}
