import {useEffect,useRef,useState,type ClipboardEvent} from 'react';
import {Alert,Box,Button,Collapse,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,LinearProgress,Paper,Stack,TextField,Tooltip,Typography,useMediaQuery} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import AttachFile from '@mui/icons-material/AttachFile';
import ContentPaste from '@mui/icons-material/ContentPaste';
import type {CampusController,Draft,DraftSelection} from '../../app/useCampus';
import {AttachmentList} from '../attachments/AttachmentList';
import {readClipboard,readTransfer,type ClipboardImport} from '../../infrastructure/clipboard-import';

export function ComposerPage({app,onDone,onLogin,embedded=false}:{app:CampusController;onDone:()=>void;onLogin:()=>void;embedded?:boolean}){
 const input=useRef<HTMLInputElement>(null);const [target,setTarget]=useState<string|null>(null);const [adding,setAdding]=useState(false);
 const importLock=useRef(false);const [dragTarget,setDragTarget]=useState<string|null>(null);
 const [importWarnings,setImportWarnings]=useState<Record<string,string>>({});
 const [aiNotice,setAiNotice]=useState(false);
 const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const draftElements=useRef(new Map<string,HTMLElement>());
 const [leavingDrafts,setLeavingDrafts]=useState<{draft:Draft;index:number}[]>([]);
 const pendingFocus=useRef<{previous:Element|null;nextID?:string;knownIDs?:Set<string>}|null>(null);
 useEffect(()=>{
  const intent=pendingFocus.current;if(!intent)return;
  const next=intent.knownIDs?app.drafts.find(d=>!intent.knownIDs!.has(d.id)):app.drafts.find(d=>d.id===intent.nextID)??app.drafts[0];
  if(!next)return;pendingFocus.current=null;
  if(document.activeElement!==document.body&&document.activeElement!==intent.previous)return;
  draftElements.current.get(next.id)?.querySelector<HTMLTextAreaElement>('textarea:not([aria-hidden="true"])')?.focus();
 },[app.drafts]);
 function addDraft(){pendingFocus.current={previous:document.activeElement,knownIDs:new Set(app.drafts.map(d=>d.id))};app.addDraft();}
 function removeDraft(draft:Draft,index:number){
  const active=document.activeElement;
  if(active&&draftElements.current.get(draft.id)?.contains(active))pendingFocus.current={previous:active,nextID:app.drafts[index+1]?.id??app.drafts[index-1]?.id};
  // Save/delete immediately. A departing visual snapshot does not delay persistence.
  if(!reducedMotion)setLeavingDrafts(old=>[...old.filter(row=>row.draft.id!==draft.id),{draft,index}]);
  void app.removeDraft(draft.id).catch(error=>{setLeavingDrafts(old=>old.filter(row=>row.draft.id!==draft.id));app.report(error);});
 }
 const draftRows=app.drafts.map((draft,index)=>({draft,index,leaving:false}));
 for(const row of leavingDrafts){if(!app.drafts.some(d=>d.id===row.draft.id))draftRows.splice(Math.min(row.index,draftRows.length),0,{...row,leaving:true});}
 const [showWaitHint,setShowWaitHint]=useState(false);
 useEffect(()=>{setShowWaitHint(false);if(!app.busy||app.stage!=='提交中')return;const timer=setTimeout(()=>setShowWaitHint(true),5_000);return()=>clearTimeout(timer);},[app.busy,app.stage]);
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
 async function picked(files:FileList|null){const id=target;if(!files||!id||importLock.current)return;importLock.current=true;setAdding(true);try{await app.attach(id,Array.from(files));setImportWarnings(old=>({...old,[id]:''}));}catch(e){app.report(e);}finally{importLock.current=false;setAdding(false);if(input.current)input.current.value='';}}
 async function importContent(id:string,read:()=>Promise<ClipboardImport>,selection?:DraftSelection){
  if(importLock.current||app.busy)return;importLock.current=true;setAdding(true);
  try{
   let value:ClipboardImport;
   try{value=await read();}catch{app.tell('请在输入框长按粘贴，或使用键盘粘贴。');return;}
   // Save readable text even if some attachment representations are unavailable.
   if(value.text)app.insertDraft(id,value.text,selection);
   const warnings=[...value.warnings];
   if(value.unavailableImages)warnings.push(`${value.unavailableImages} 张图片未复制过来，请拖入或添加。`);
   if(value.files.length){try{await app.attach(id,value.files);app.tell(`已添加 ${value.files.length} 个附件`);}catch(e){warnings.push(e instanceof Error?e.message:'附件未保存，请重新添加。');}}
   if(!value.text&&!value.files.length&&!warnings.length)app.tell('剪贴板没有可粘贴的内容。');
   setImportWarnings(old=>({...old,[id]:[...new Set(warnings)].join(' ')}));
   return value;
  }catch(e){app.report(e);}
  finally{importLock.current=false;setAdding(false);}
 }
 function pasteEvent(id:string,event:ClipboardEvent){
  if(app.busy||importLock.current){event.preventDefault();return;}
  const element=event.target;
  if(!(element instanceof HTMLTextAreaElement))return;
  event.preventDefault();
  const selection={start:element.selectionStart,end:element.selectionEnd,expectedText:element.value};
  // Clipboard event data must be read before the event handler returns.
  const content=readTransfer(event.clipboardData);
  void importContent(id,()=>content,selection).then(value=>{
   if(!value)return;
   const expected=selection.expectedText.slice(0,selection.start)+value.text+selection.expectedText.slice(selection.end);
   requestAnimationFrame(()=>{
    if(!element.isConnected||element.disabled||element.value!==expected)return;
    // Disabling during import may blur the field; do not steal focus from another control.
    if(document.activeElement!==document.body&&document.activeElement!==element)return;
    element.focus();const caret=selection.start+value.text.length;element.setSelectionRange(caret,caret);
   });
  });
 }
 return <Stack spacing={2} className="page-enter">
  <Typography variant={embedded?"h5":"h4"} component={embedded?"h2":"h1"}>新增通知</Typography>
  {app.pending&&<Alert severity="info" action={<Button onClick={app.recoverResult}>保存结果</Button>}>上次整理的结果还没保存，无需再次调用 AI。</Alert>}
  {!!app.legacyRecords.length&&<Alert severity="info" action={<Button onClick={app.recoverLegacyResult}>保存结果</Button>}>旧版有 {app.legacyRecords.length} 条整理结果未保存，无需重新调用 AI。</Alert>}
  {app.legacyMissingFiles&&<Alert severity="info" onClose={()=>app.setLegacyMissingFiles(false)}>旧版草稿文字已保留，草稿附件需要重新添加。</Alert>}
  {draftRows.map(({draft,index,leaving})=><Collapse key={draft.id} in={!leaving} appear timeout={reducedMotion?0:180} unmountOnExit onExited={()=>setLeavingDrafts(old=>old.filter(row=>row.draft.id!==draft.id))}>
   <Paper ref={element=>{if(element)draftElements.current.set(draft.id,element);else draftElements.current.delete(draft.id);}} className="composer-draft" variant="outlined" inert={leaving?true:undefined} aria-hidden={leaving?true:undefined}
   onDragOver={event=>{event.preventDefault();if(app.busy||adding){event.dataTransfer.dropEffect='none';return;}event.dataTransfer.dropEffect='copy';setDragTarget(draft.id);}}
   onDragLeave={event=>{if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget))setDragTarget(null);}}
   onDrop={event=>{event.preventDefault();setDragTarget(null);if(app.busy||importLock.current)return;const content=readTransfer(event.dataTransfer);void importContent(draft.id,()=>content);}}
   sx={{p:{xs:1.5,sm:2},opacity:leaving?0:1,transition:reducedMotion?'none':'opacity 160ms ease',borderColor:dragTarget===draft.id?'primary.main':undefined,bgcolor:dragTarget===draft.id?'action.hover':undefined}}>
   <Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between",mb:1.5}}>
    <Typography variant="h6">通知 {index+1}</Typography>
    <Stack direction="row" sx={{gap:.5,alignItems:'center'}}>
     {!draft.text&&<Tooltip title="粘贴文字与图片"><span><IconButton sx={{border:'1px solid',borderColor:'divider'}} aria-label={`给通知${index+1}粘贴原文`} disabled={app.busy||adding} onClick={()=>void importContent(draft.id,readClipboard,{start:0,end:0,expectedText:draft.text})}><ContentPaste fontSize="small"/></IconButton></span></Tooltip>}
     {(app.drafts.length>1||draft.text||draft.attachments.length>0)&&<IconButton aria-label={`移除通知${index+1}`} disabled={app.busy||adding||leaving} onClick={()=>removeDraft(draft,index)}><Close/></IconButton>}
    </Stack>
   </Stack>
   <TextField className="composer-text" placeholder="粘贴通知，图片和文件会作为附件…" multiline minRows={5} maxRows={embedded?9:13} value={draft.text} disabled={app.busy||adding} onChange={e=>app.changeDraft(draft.id,e.target.value)} onPaste={event=>pasteEvent(draft.id,event)} slotProps={{htmlInput:{'aria-label':`通知${index+1}原文`}}} error={total>4000} helperText={!draft.text.trim()&&draft.attachments.length?'补充通知文字后可整理。':undefined}/>
   {importWarnings[draft.id]&&<Alert severity="warning" sx={{mt:1}} onClose={()=>setImportWarnings(old=>({...old,[draft.id]:''}))}>{importWarnings[draft.id]}</Alert>}
   <Stack direction="row" spacing={1} sx={{alignItems:"center",justifyContent:'space-between',mt:1}}>
    <Tooltip title="添加附件 · 仅存本机"><span><IconButton sx={{border:'1px solid',borderColor:'divider'}} aria-label={`给通知${index+1}添加附件`} disabled={app.busy||adding} onClick={()=>{setTarget(draft.id);input.current?.click();}}><AttachFile/></IconButton></span></Tooltip>
    {index===app.drafts.length-1&&<Typography className="composer-count" aria-label={`本次通知总字数 ${total}，上限4000`} color={total>4000?'error.main':'text.secondary'} variant="body2" sx={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{total}/4000</Typography>}
   </Stack>
   <AttachmentList ids={draft.attachments} platform={app.platform} onRemove={app.busy||adding?undefined:id=>void app.detach(draft.id,id).catch(app.report)}/>
  </Paper></Collapse>)}
  <input hidden ref={input} type="file" multiple onChange={e=>void picked(e.target.files)}/>
  <Tooltip title="再加一条通知"><span style={{alignSelf:'center'}}><IconButton aria-label="再加一条通知" sx={{border:'1px solid',borderColor:'divider',color:'primary.main'}} disabled={app.busy||adding||app.drafts.length>=20} onClick={addDraft}><Add/></IconButton></span></Tooltip>
  <Box className="composer-actions" sx={{py:1,position:shortViewport&&!embedded?'static':'sticky',bottom:embedded?0:topNavigation?16:'calc(80px + var(--safe-bottom))',zIndex:2,bgcolor:'background.default'}}>
   {app.busy&&<LinearProgress sx={{mb:1,borderRadius:1}}/>}
   {app.busy&&showWaitHint&&<Typography variant="body2" color="text.secondary" role="status" sx={{mb:1}}>正在确认提交，确认后可离开。</Typography>}
   <Stack direction="row" sx={{alignItems:'center',gap:1}}>
     <Button fullWidth variant="contained" sx={{whiteSpace:'nowrap',minHeight:56,fontSize:16}} disabled={app.busy||adding||!!retrySeconds||!hasContent||total>4000||app.pending||!!app.legacyRecords.length||!!app.unconfirmedSubmissions.length||!app.config} onClick={()=>void submit()}>{app.busy?app.stage:retrySeconds?retryText:app.cloud?.getKey()?'整理通知':'登录后整理'}</Button>
     {app.busy&&<Button sx={{flexShrink:0,whiteSpace:'nowrap'}} onClick={app.cancel}>停止等待</Button>}
   </Stack>
  </Box>
  <Dialog open={aiNotice} onClose={()=>setAiNotice(false)} aria-labelledby="ai-notice-heading"><DialogTitle id="ai-notice-heading">整理前请留意</DialogTitle><DialogContent><Typography>AI 可能出错，重要信息请核对原文。</Typography></DialogContent><DialogActions><Button onClick={()=>setAiNotice(false)}>取消</Button><Button variant="contained" onClick={acknowledge}>开始整理</Button></DialogActions></Dialog>
 </Stack>;
}
