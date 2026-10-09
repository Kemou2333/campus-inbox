import {useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,LinearProgress,Paper,Stack,TextField,Tooltip,Typography,useMediaQuery} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import AttachFile from '@mui/icons-material/AttachFile';
import ContentPaste from '@mui/icons-material/ContentPaste';
import type {CampusController} from '../../app/useCampus';
import {AttachmentList} from '../attachments/AttachmentList';

export function ComposerPage({app,onDone,onLogin,embedded=false}:{app:CampusController;onDone:()=>void;onLogin:()=>void;embedded?:boolean}){
 const input=useRef<HTMLInputElement>(null);const [target,setTarget]=useState<string|null>(null);const [adding,setAdding]=useState(false);const [pasting,setPasting]=useState(false);
 const [aiNotice,setAiNotice]=useState(false);
 const topNavigation=useMediaQuery('(min-width:960px), (min-width:600px) and (max-height:500px)');
 const shortViewport=useMediaQuery('(max-height:500px)');
 const [clock,setClock]=useState(Date.now());
 useEffect(()=>{setClock(Date.now());if(app.retryAt<=Date.now())return;const timer=setInterval(()=>{const value=Date.now();setClock(value);if(value>=app.retryAt)clearInterval(timer);},1000);return()=>clearInterval(timer);},[app.retryAt]);
 const retrySeconds=Math.max(0,Math.ceil((app.retryAt-clock)/1000));
 const retryText=retrySeconds>3600?'稍后再试':retrySeconds>=60?`${Math.ceil(retrySeconds/60)} 分钟后`:`${retrySeconds} 秒后`;
 const total=app.drafts.reduce((n,d)=>n+d.text.length,0);const hasContent=app.drafts.some(d=>d.text.trim());
 async function analyze(){try{if(await app.analyze())onDone();}catch(e){app.report(e);}}
 async function submit(){if(!app.cloud?.getKey()){onLogin();return;}if(localStorage.getItem('campus-inbox:ai-notice:v1')!=='seen'){setAiNotice(true);return;}await analyze();}
 function acknowledge(){localStorage.setItem('campus-inbox:ai-notice:v1','seen');setAiNotice(false);void analyze();}
 async function picked(files:FileList|null){const id=target;if(!files||!id)return;setAdding(true);try{await app.attach(id,Array.from(files));}catch(e){app.report(e);}finally{setAdding(false);if(input.current)input.current.value='';}}
 async function paste(id:string){if(pasting)return;setPasting(true);try{const text=await navigator.clipboard.readText();if(text)app.pasteDraft(id,text);else app.tell('剪贴板是空的。');}catch{app.tell('请在输入框长按粘贴，或使用键盘粘贴。');}finally{setPasting(false);}}
 return <Stack spacing={2} className="page-enter">
  <Typography variant={embedded?"h5":"h4"} component={embedded?"h2":"h1"}>新增通知</Typography>
  {app.pending&&<Alert severity="info" action={<Button onClick={app.recoverResult}>保存结果</Button>}>上次整理的结果还没保存，无需再次调用 AI。</Alert>}
  {!!app.legacyRecords.length&&<Alert severity="info" action={<Button onClick={app.recoverLegacyResult}>保存结果</Button>}>旧版有 {app.legacyRecords.length} 条整理结果未保存，无需重新调用 AI。</Alert>}
  {app.legacyMissingFiles&&<Alert severity="info" onClose={()=>app.setLegacyMissingFiles(false)}>旧版草稿文字已保留，草稿附件需要重新添加。</Alert>}
  {app.drafts.map((draft,index)=><Paper key={draft.id} variant="outlined" sx={{p:{xs:1.5,sm:2}}}>
   <Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between",mb:1.5}}>
    <Typography variant="h6">通知 {index+1}</Typography>
    <Stack direction="row" sx={{gap:.5,alignItems:'center'}}>
     {!draft.text&&<Tooltip title="粘贴原文"><span><IconButton sx={{border:'1px solid',borderColor:'divider'}} aria-label={`给通知${index+1}粘贴原文`} disabled={app.busy||adding||pasting} onClick={()=>void paste(draft.id)}><ContentPaste fontSize="small"/></IconButton></span></Tooltip>}
     {(app.drafts.length>1||draft.text||draft.attachments.length>0)&&<IconButton aria-label={`移除通知${index+1}`} disabled={app.busy||adding} onClick={()=>void app.removeDraft(draft.id).catch(app.report)}><Close/></IconButton>}
    </Stack>
   </Stack>
   <TextField className="composer-text" placeholder="将群里的通知粘贴到这里…" multiline minRows={5} maxRows={embedded?9:13} value={draft.text} disabled={app.busy} onChange={e=>app.changeDraft(draft.id,e.target.value)} slotProps={{htmlInput:{'aria-label':`通知${index+1}原文`}}} error={total>4000}/>
   <Stack direction="row" spacing={1} sx={{alignItems:"center",justifyContent:'space-between',mt:1}}>
    <Tooltip title="添加附件 · 仅存本机"><span><IconButton sx={{border:'1px solid',borderColor:'divider'}} aria-label={`给通知${index+1}添加附件`} disabled={app.busy||adding} onClick={()=>{setTarget(draft.id);input.current?.click();}}><AttachFile/></IconButton></span></Tooltip>
    {index===app.drafts.length-1&&<Typography className="composer-count" aria-label={`本次通知总字数 ${total}，上限4000`} color={total>4000?'error.main':'text.secondary'} variant="body2" sx={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{total}/4000</Typography>}
   </Stack>
   <AttachmentList ids={draft.attachments} platform={app.platform} onRemove={app.busy?undefined:id=>void app.detach(draft.id,id).catch(app.report)}/>
  </Paper>)}
  <input hidden ref={input} type="file" multiple onChange={e=>void picked(e.target.files)}/>
  <Tooltip title="再加一条通知"><span style={{alignSelf:'center'}}><IconButton aria-label="再加一条通知" sx={{border:'1px solid',borderColor:'divider',color:'primary.main'}} disabled={app.busy||adding||app.drafts.length>=20} onClick={()=>app.addDraft()}><Add/></IconButton></span></Tooltip>
  <Box className="composer-actions" sx={{py:1,position:shortViewport&&!embedded?'static':'sticky',bottom:embedded?0:topNavigation?16:'calc(80px + var(--safe-bottom))',zIndex:2,bgcolor:'background.default'}}>
   {app.busy&&<LinearProgress sx={{mb:1,borderRadius:1}}/>}
   <Stack direction="row" sx={{alignItems:'center',gap:1}}>
     <Button fullWidth variant="contained" sx={{whiteSpace:'nowrap',minHeight:56,fontSize:16}} disabled={app.busy||adding||!!retrySeconds||!hasContent||total>4000||app.pending||!!app.legacyRecords.length||!app.config} onClick={()=>void submit()}>{app.busy?app.stage:retrySeconds?retryText:'整理通知'}</Button>
     {app.busy&&<Button onClick={app.cancel}>取消</Button>}
   </Stack>
  </Box>
  <Dialog open={aiNotice} onClose={()=>setAiNotice(false)} aria-labelledby="ai-notice-heading"><DialogTitle id="ai-notice-heading">整理前请留意</DialogTitle><DialogContent><Typography>AI 可能遗漏或误判。时间、对象和要求等重要信息，请再核对原文。</Typography></DialogContent><DialogActions><Button onClick={()=>setAiNotice(false)}>取消</Button><Button variant="contained" onClick={acknowledge}>开始整理</Button></DialogActions></Dialog>
 </Stack>;
}
