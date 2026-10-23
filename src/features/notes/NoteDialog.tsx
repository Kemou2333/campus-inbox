import {useEffect,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,Stack,TextField,Tooltip,Typography,useMediaQuery} from '@mui/material';
import {alpha,useTheme} from '@mui/material/styles';
import Check from '@mui/icons-material/Check';
import Close from '@mui/icons-material/Close';
import EditNote from '@mui/icons-material/EditNote';
import type {CampusController} from '../../app/useCampus';
import type {NoteColor,NoteTarget} from '../../domain/types';
import {RichText} from '../../shared/ui/RichText';
import {updateNote} from '../../domain/notice';
import {noteAppearance,noteColorOptions} from './note-colors';
export interface NoteEditor {noticeID:string;target:NoteTarget;title:string;text:string}

export function NoteDialog({editor,app,onClose}:{editor:NoteEditor|null;app:CampusController;onClose:()=>void}){
 const theme=useTheme(),reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const [text,setText]=useState(''),[color,setColor]=useState<NoteColor>('plain'),[failed,setFailed]=useState(false);
 const [cleared,setCleared]=useState<{text:string;color:NoteColor}|null>(null);
 useEffect(()=>{if(editor){setText(editor.text);setColor(app.notices.find(n=>n.id===editor.noticeID)?.noteColor??'plain');setFailed(false);setCleared(null);}},[editor]);
 const appearance=noteAppearance(color,theme.palette.mode==='dark'),whole=editor?.target.type==='notice';
 function save(value:string,nextColor:NoteColor){if(!editor)return false;const result=app.update(editor.noticeID,n=>updateNote(n,editor.target,value,editor.target.type==='notice'?nextColor:undefined));setFailed(!result);return !!result;}
 function write(value:string,nextColor=color){setText(value);setColor(nextColor);setCleared(null);save(value,nextColor);}
 function clear(){const previous={text,color};write('','plain');setCleared(previous);}
 function undoClear(){if(!cleared)return;write(cleared.text,cleared.color);}
 function close(){if(editor&&failed&&!save(text,color))return;onClose();}
 return <Dialog open={!!editor} onClose={close} aria-labelledby="note-editor-title" slotProps={{paper:{sx:{overflow:'hidden',bgcolor:appearance.paper,color:appearance.ink,transition:reducedMotion?'none':'background-color 180ms ease'}}}}>
  <DialogTitle id="note-editor-title" sx={{display:'flex',alignItems:'center',gap:1.25,pb:1.25}}><Box sx={{display:'flex',alignItems:'center',justifyContent:'center',width:38,height:38,borderRadius:'12px',bgcolor:appearance.paper,color:appearance.accent,border:'1px solid',borderColor:appearance.border}}><EditNote/></Box><Box sx={{flex:1}}>通知笔记</Box><IconButton aria-label="关闭笔记" onClick={close} sx={{mr:-.75}}><Close/></IconButton></DialogTitle>
  <DialogContent><Typography component="div" sx={{mb:2,fontSize:14,lineHeight:1.65,color:'text.secondary'}}><RichText text={editor?.title??''}/></Typography>
   {failed&&<Alert severity="error" sx={{mb:2}}>笔记尚未保存，请保留此窗口并重试。</Alert>}
   {whole&&<Stack direction="row" sx={{alignItems:'center',gap:1,mb:1.75,flexWrap:'wrap'}}><Typography sx={{fontSize:13,color:'text.secondary',mr:.5}}>笔记颜色</Typography><Stack role="radiogroup" aria-label="笔记颜色" direction="row" spacing={0} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const at=noteColorOptions.findIndex(([value])=>value===color),next=event.key==='Home'?0:event.key==='End'?noteColorOptions.length-1:(at+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+noteColorOptions.length)%noteColorOptions.length;write(text,noteColorOptions[next][0]);event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();}}>{noteColorOptions.map(([value,label])=>{const sample=noteAppearance(value,theme.palette.mode==='dark');return <Tooltip title={label} key={value}><IconButton role="radio" tabIndex={color===value?0:-1} aria-checked={color===value} aria-label={`笔记颜色：${label}`} onClick={()=>write(text,value)} sx={{width:44,height:44,p:.25,border:'2px solid',borderColor:color===value?sample.accent:'transparent','&:hover':{bgcolor:alpha(sample.accent,.1)}}}><Box sx={{display:'flex',alignItems:'center',justifyContent:'center',width:23,height:23,borderRadius:'50%',bgcolor:sample.paper,border:'1px solid',borderColor:sample.border,color:sample.accent}}>{color===value&&<Check sx={{fontSize:15}}/>}</Box></IconButton></Tooltip>;})}</Stack></Stack>}
   <Box className="note-editor-surface" sx={{border:0,borderTop:'1px solid',borderColor:appearance.border,borderRadius:0,bgcolor:'transparent',transition:reducedMotion?'none':'background-color 240ms ease, border-color 240ms ease','&:focus-within':{borderColor:appearance.accent,boxShadow:'none'}}}>
    <TextField variant="standard" fullWidth autoFocus multiline minRows={6} maxRows={12} value={text} placeholder="记下办理进度、自己的补充，或下次要确认的事…" onChange={e=>write(e.target.value)} slotProps={{input:{disableUnderline:true},htmlInput:{maxLength:4000,'aria-label':'通知笔记'}}} sx={{'& .MuiInputBase-root':{px:0,pt:1.75,pb:1,fontSize:16,lineHeight:1.85,color:appearance.ink},'& textarea::placeholder':{opacity:.65}}}/>
    <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:1,px:0,pb:1.5}}><Typography sx={{fontSize:12,color:failed?'error.main':'text.secondary'}}>{failed?'尚未保存':'已保存到本机'}</Typography><Typography sx={{fontSize:12,color:'text.secondary',fontVariantNumeric:'tabular-nums'}}>{text.length} / 4,000</Typography></Stack>
   </Box>
   {cleared&&!text&&<Button size="small" onClick={undoClear} sx={{mt:1}}>撤销清空</Button>}
  </DialogContent>
  <DialogActions sx={{justifyContent:'space-between',gap:1}}><Button color="inherit" disabled={!text} onClick={clear} sx={{color:'text.secondary'}}>清空笔记</Button><Button variant="contained" onClick={close} sx={{minWidth:88}}>{failed?'重试保存':'完成'}</Button></DialogActions>
 </Dialog>;
}
