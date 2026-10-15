import {useEffect,useRef,useState} from 'react';
import {Box,Button,Chip,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,LinearProgress,Stack,TextField,Typography} from '@mui/material';
import Close from '@mui/icons-material/Close';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import {version as appVersion} from '../../../package.json';
import {NoticeCard,type NoticeActions,type NoticeCardController} from '../../features/notices/NoticeCard';
import {createDemoNotice,demoOriginal} from '../../features/onboarding/demo-notice';
import type {Notice,NoteTarget} from '../../domain/types';
import {updateNote} from '../../domain/notice';
const guideSteps=[
 {title:'粘贴通知',description:'先用这条通知试试看。'},
 {title:'生成待办',description:'点「模拟整理」，看看结果。'},
 {title:'展开查看',description:'先点「展开」，\n再点一条待办。'},
 {title:'核对原文',description:'点待办旁的链接图标，\n查看原文。'},
 {title:'打勾完成',description:'试试打勾、收藏，\n无关通知可点「不适用」。'}
];
const demoReadingText=demoOriginal.replace(/。(?=.)/g,'。\n');
export function HelpDialog({open,onClose,onExamples,onCompose}:{open:boolean;onClose:()=>void;onExamples?:()=>void|Promise<void>;onCompose?:()=>void}){
 const [step,setStep]=useState(0),[pasted,setPasted]=useState(false),[demo,setDemo]=useState<Notice|null>(null),[expanded,setExpanded]=useState(false),[tasks,setTasks]=useState<Set<string>>(new Set()),[source,setSource]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(false);
 const [note,setNote]=useState<{target:NoteTarget;title:string;text:string}|null>(null);
 const title=useRef<HTMLHeadingElement>(null),scroll=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(open){setStep(0);setPasted(false);setDemo(null);setExpanded(false);setTasks(new Set());setSource(false);setMessage('');setNote(null);}},[open]);
 useEffect(()=>{if(open){title.current?.focus({preventScroll:true});scroll.current?.scrollTo({top:0});}},[open,step]);
 const current=guideSteps[step],last=step===guideSteps.length-1;
 const app:NoticeCardController={act:(id,change,text)=>{setDemo(value=>value?.id===id?change(value):value);setMessage(text);},remove:()=>{setDemo(null);setMessage('已删除，可重新生成。');}};
 const actions:NoticeActions={details:()=>setSource(true),evidence:()=>setSource(true),note:(_n,target,title,text)=>setNote({target,title,text}),calendar:()=>setMessage('提醒功能请在正式通知中使用。'),correct:()=>setMessage('修正功能请在正式通知中使用。')};
 function generate(){setDemo(createDemoNotice());setExpanded(false);setTasks(new Set());setSource(false);setMessage('');setStep(2);}
 async function examples(){setLoading(true);try{await onExamples?.();}finally{setLoading(false);}}
 return <><Dialog open={open} onClose={onClose} aria-labelledby="guide-heading" aria-describedby="guide-description" className="onboarding-dialog" maxWidth="sm">
  <DialogTitle component="div" sx={{display:'flex',alignItems:'center',gap:1,pr:1.5}}><Typography component="h2" id="guide-heading" sx={{flex:1,fontSize:22,fontWeight:700}}>快速上手</Typography><Chip size="small" color="primary" variant="outlined" label={`${step+1}/${guideSteps.length}`}/><IconButton aria-label="关闭引导" onClick={onClose}><Close/></IconButton></DialogTitle>
  <DialogContent ref={scroll} sx={{pt:'4px!important','& .notice-actions':{flexWrap:'wrap'},'& .notice-card':{p:{xs:1.5,sm:2}}}}>
   <LinearProgress aria-label="引导进度" aria-valuetext={`第${step+1}步，共${guideSteps.length}步`} variant="determinate" value={(step+1)/guideSteps.length*100} sx={{height:4,borderRadius:2,mb:2.5}}/>
   <Typography component="h3" ref={title} tabIndex={-1} sx={{fontSize:{xs:22,sm:25},fontWeight:700,lineHeight:1.4,outline:'none'}}>{current.title}</Typography>
   <Typography id="guide-description" sx={{mt:1,mb:2,fontSize:16,color:'text.secondary',whiteSpace:'pre-line'}}>{current.description}</Typography>
   <Typography sx={{mb:1,fontSize:12,color:'text.secondary'}}>免费练习 · 不会保存</Typography>
   {step===0&&<Stack spacing={1.5}><TextField multiline minRows={3} value={pasted?demoReadingText:''} placeholder="演示通知会粘贴到这里" slotProps={{input:{readOnly:true},htmlInput:{'aria-label':'演示通知原文'}}}/><Button variant="outlined" onClick={()=>setPasted(true)}>{pasted?'重新粘贴':'粘贴演示通知'}</Button></Stack>}
   {step===1&&<Stack spacing={2}><Box sx={{p:2,bgcolor:'action.hover',borderRadius:2,lineHeight:1.8,whiteSpace:'pre-line'}}>{demoReadingText}</Box><Button variant="contained" onClick={generate}>模拟整理</Button></Stack>}
   {step>=2&&(demo?<NoticeCard notice={demo} app={app} actions={actions} now={Date.now()} expanded={expanded} onExpandedChange={()=>setExpanded(value=>!value)} expandedTaskIDs={tasks} onTaskExpandedChange={id=>setTasks(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;})}/>:<Button variant="outlined" onClick={generate}>重新生成演示通知</Button>)}
   {source&&step>=2&&<Box className="guide-source" sx={{mt:2,p:2,borderLeft:'3px solid',borderColor:'info.main',bgcolor:'action.hover',borderRadius:1}}><Typography sx={{fontWeight:700,mb:1}}>演示原文</Typography><Typography sx={{lineHeight:1.8,whiteSpace:'pre-line'}}>{demoReadingText}</Typography><Button onClick={()=>setSource(false)}>收起</Button></Box>}
   {message&&step>=2&&<Typography role="status" variant="body2" color="primary" sx={{mt:1}}>{message}</Typography>}
  </DialogContent>
  <DialogActions sx={{gap:.5,flexWrap:'wrap'}}>
   {!last&&<Button onClick={onClose} color="inherit" sx={{mr:'auto'}}>跳过</Button>}
   <IconButton aria-label="上一步" disabled={step===0} onClick={()=>setStep(value=>value-1)}><ChevronLeft/></IconButton>
   {last?<>{onCompose&&<Button variant="outlined" onClick={onCompose}>去整理</Button>}{onExamples?<Button variant="contained" disabled={loading} onClick={()=>void examples()}>{loading?'载入中…':'看示例'}</Button>:<Button variant="contained" onClick={onClose}>开始使用</Button>}</>:step!==1&&<Button variant="contained" disabled={step===0&&!pasted} onClick={()=>setStep(value=>value+1)}>下一步</Button>}
  </DialogActions>
 </Dialog>
 <Dialog open={!!note&&open} onClose={()=>setNote(null)}><DialogTitle>{note?.title}</DialogTitle><DialogContent><TextField multiline minRows={3} value={note?.text??''} label="演示笔记" onChange={event=>setNote(value=>value?{...value,text:event.target.value}:null)}/></DialogContent><DialogActions><Button onClick={()=>setNote(null)}>取消</Button><Button onClick={()=>{if(note)setDemo(value=>value?updateNote(value,note.target,note.text):value);setNote(null);}}>保存演示笔记</Button></DialogActions></Dialog></>;
}
export function AboutDialog({open,onClose}:{open:boolean;onClose:()=>void}){
 return <Dialog open={open} onClose={onClose}><DialogTitle>校园 Inbox</DialogTitle><DialogContent><Typography>把校园通知整理成清楚的事项和提醒，少漏一件事。</Typography><Typography color="text.secondary" sx={{mt:2}}>由 Kemou 制作。网页和安卓应用共用同一套通知，附件留在自己的设备上。</Typography><Typography color="text.secondary" variant="body2" sx={{mt:2}}>作者可通过受保护的后台查看服务器已保存的账号、通知原文、整理结果和同步后的进度笔记，用于维护与排查问题。未上传的草稿和附件仍留在本机。</Typography><Typography variant="caption" color="text.secondary" sx={{display:'block',mt:2}}>版本 {appVersion}</Typography></DialogContent><DialogActions><Button variant="contained" onClick={onClose}>关闭</Button></DialogActions></Dialog>;
}
