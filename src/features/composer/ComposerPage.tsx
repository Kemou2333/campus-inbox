import {useRef,useState} from 'react';
import {Alert,Box,Button,IconButton,LinearProgress,Paper,Stack,TextField,Typography} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import AttachFile from '@mui/icons-material/AttachFile';
import ContentPaste from '@mui/icons-material/ContentPaste';
import type {CampusController} from '../../app/useCampus';
import {AttachmentList} from '../attachments/AttachmentList';

export function ComposerPage({app,onDone,onLogin,embedded=false}:{app:CampusController;onDone:()=>void;onLogin:()=>void;embedded?:boolean}){
 const input=useRef<HTMLInputElement>(null);const [target,setTarget]=useState<string|null>(null);const [adding,setAdding]=useState(false);const [pasting,setPasting]=useState(false);
 const total=app.drafts.reduce((n,d)=>n+d.text.length,0);const hasContent=app.drafts.some(d=>d.text.trim());
 async function submit(){if(!app.cloud?.getKey()){onLogin();return;}try{if(await app.analyze())onDone();}catch(e){app.report(e);}}
 async function picked(files:FileList|null){const id=target;if(!files||!id)return;setAdding(true);try{await app.attach(id,Array.from(files));}catch(e){app.report(e);}finally{setAdding(false);if(input.current)input.current.value='';}}
 async function paste(id:string){if(pasting)return;setPasting(true);try{const text=await navigator.clipboard.readText();if(text)app.pasteDraft(id,text);else app.tell('剪贴板是空的。');}catch{app.tell('请在输入框长按粘贴，或使用键盘粘贴。');}finally{setPasting(false);}}
 return <Stack spacing={2} className="page-enter">
  <Box><Typography variant={embedded?"h5":"h4"} component={embedded?"h2":"h1"}>新增通知</Typography><Typography variant="body2" color="text.secondary" sx={{mt:.75}}>粘贴原文，一次整理多条通知。</Typography></Box>
  {app.pending&&<Alert severity="info" action={<Button onClick={app.recoverResult}>保存结果</Button>}>上次整理的结果还没保存，无需再次调用 AI。</Alert>}
  {!!app.legacyRecords.length&&<Alert severity="info" action={<Button onClick={app.recoverLegacyResult}>保存结果</Button>}>旧版有 {app.legacyRecords.length} 条整理结果未保存，无需重新调用 AI。</Alert>}
  {app.legacyMissingFiles&&<Alert severity="info" onClose={()=>app.setLegacyMissingFiles(false)}>旧版草稿文字已保留，草稿附件需要重新添加。</Alert>}
  {app.drafts.map((draft,index)=><Paper key={draft.id} variant="outlined" sx={{p:2}}>
   <Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between",mb:1.5}}>
    <Typography variant="h6">通知 {index+1}</Typography>
    <Stack direction="row" sx={{gap:.5,alignItems:'center'}}>
     {!draft.text&&<Button size="small" variant="outlined" startIcon={<ContentPaste fontSize="small"/>} aria-label={`给通知${index+1}粘贴原文`} disabled={app.busy||adding||pasting} onClick={()=>void paste(draft.id)}>粘贴</Button>}
     {(app.drafts.length>1||draft.text||draft.attachments.length>0)&&<IconButton aria-label={`移除通知${index+1}`} disabled={app.busy||adding} onClick={()=>void app.removeDraft(draft.id).catch(app.report)}><Close/></IconButton>}
    </Stack>
   </Stack>
   <TextField className="composer-text" placeholder="将群里的通知粘贴到这里…" multiline minRows={5} maxRows={embedded?9:13} value={draft.text} disabled={app.busy} onChange={e=>app.changeDraft(draft.id,e.target.value)} slotProps={{htmlInput:{'aria-label':`通知${index+1}原文`}}} error={total>4000}/>
   <Stack direction="row" spacing={1} sx={{alignItems:"center",mt:1}}>
    <IconButton sx={{border:'1px solid',borderColor:'divider',borderRadius:2}} aria-label={`给通知${index+1}添加附件`} disabled={app.busy||adding} onClick={()=>{setTarget(draft.id);input.current?.click();}}><AttachFile/></IconButton>
    <Typography variant="caption" color="text.secondary">附件不交给 AI</Typography>
   </Stack>
   <AttachmentList ids={draft.attachments} platform={app.platform} onRemove={app.busy?undefined:id=>void app.detach(draft.id,id).catch(app.report)}/>
  </Paper>)}
  <input hidden ref={input} type="file" multiple onChange={e=>void picked(e.target.files)}/>
  <Button variant="outlined" startIcon={<Add/>} disabled={app.busy||adding||app.drafts.length>=20} onClick={()=>app.addDraft()} sx={{alignSelf:'flex-start'}}>再加一条</Button>
  <Paper variant="outlined" sx={{p:2,position:'sticky',bottom:embedded?0:{xs:'calc(80px + var(--safe-bottom))',md:16},zIndex:2,bgcolor:'background.paper'}}>
   {app.busy&&<LinearProgress sx={{mb:2,borderRadius:1}}/>}
   <Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between",gap:2}}>
    <Typography color={total>4000?'error.main':'text.secondary'} variant="body2">{total.toLocaleString()} / 4,000 字</Typography>
    <Stack direction="row" spacing={1}>
     {app.busy&&<Button onClick={app.cancel}>取消</Button>}
     <Button variant="contained" startIcon={!app.busy&&<AutoAwesome/>} disabled={app.busy||adding||!hasContent||total>4000||app.pending||!!app.legacyRecords.length||!app.config} onClick={()=>void submit()}>{app.busy?app.stage:'整理通知'}</Button>
    </Stack>
   </Stack>
  </Paper>
 </Stack>;
}
