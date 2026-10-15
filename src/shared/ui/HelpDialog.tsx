import {useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Chip,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,LinearProgress,Stack,TextField,Typography} from '@mui/material';
import Close from '@mui/icons-material/Close';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import {version as appVersion} from '../../../package.json';
import {NoticeCard,type NoticeActions,type NoticeCardController} from '../../features/notices/NoticeCard';
import {createDemoNotice,demoOriginal} from '../../features/onboarding/demo-notice';
import type {Notice,NoteTarget} from '../../domain/types';
import {updateNote} from '../../domain/notice';
const guideSteps=[
 {title:'先粘贴一条通知',description:'点下面的按钮，试着粘贴一条演示通知。正式使用时，在「整理」里粘贴自己的通知。'},
 {title:'试着整理一下',description:'这次直接在本机生成演示结果，不调用 AI。正式整理需登录；看到「云端已接收」后，可以离开再回来查看。'},
 {title:'逐项展开，清楚地看',description:'这就是实际的通知卡片。点「展开」，再点小待办标题，查看说明与步骤。'},
 {title:'看看它的出处',description:'点小待办旁的出处图标，核对原文。AI 可能遗漏或误判，没有关联时也能从「更多」查看原文。'},
 {title:'试试打勾和收藏',description:'勾选步骤会变绿。星星可以收藏，「不适用」可收起无关通知，再点「恢复」撤回。这里的操作只影响演示。'}
];
export function HelpDialog({open,onClose,onExamples,onCompose}:{open:boolean;onClose:()=>void;onExamples?:()=>void|Promise<void>;onCompose?:()=>void}){
 const [step,setStep]=useState(0),[pasted,setPasted]=useState(false),[demo,setDemo]=useState<Notice|null>(null),[expanded,setExpanded]=useState(false),[tasks,setTasks]=useState<Set<string>>(new Set()),[source,setSource]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(false);
 const [note,setNote]=useState<{target:NoteTarget;title:string;text:string}|null>(null);
 const title=useRef<HTMLHeadingElement>(null),scroll=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(open){setStep(0);setPasted(false);setDemo(null);setExpanded(false);setTasks(new Set());setSource(false);setMessage('');setNote(null);}},[open]);
 useEffect(()=>{if(open){title.current?.focus({preventScroll:true});scroll.current?.scrollTo({top:0});}},[open,step]);
 const current=guideSteps[step],last=step===guideSteps.length-1;
 const app:NoticeCardController={act:(id,change,text)=>{setDemo(value=>value?.id===id?change(value):value);setMessage(text);},remove:()=>{setDemo(null);setMessage('演示通知已删除，可以重新生成。');}};
 const actions:NoticeActions={details:()=>setSource(true),evidence:()=>{setSource(true);setMessage('已打开这条演示通知的原文。');},note:(_n,target,title,text)=>setNote({target,title,text}),calendar:()=>setMessage('正式使用时可创建日历或安卓通知提醒；演示不会写入系统。'),correct:()=>setMessage('正式使用时可修正整理结果；演示不会修改你的通知。')};
 function generate(){setDemo(createDemoNotice());setExpanded(false);setTasks(new Set());setSource(false);setMessage('');setStep(2);}
 async function examples(){setLoading(true);try{await onExamples?.();}finally{setLoading(false);}}
 return <><Dialog open={open} onClose={onClose} aria-labelledby="guide-heading" aria-describedby="guide-description" className="onboarding-dialog" maxWidth="sm">
  <DialogTitle component="div" sx={{display:'flex',alignItems:'center',gap:1,pr:1.5}}><Typography component="h2" id="guide-heading" sx={{flex:1,fontSize:22,fontWeight:700}}>快速上手</Typography><Chip size="small" color="primary" variant="outlined" label={`${step+1}/${guideSteps.length}`}/><IconButton aria-label="关闭引导" onClick={onClose}><Close/></IconButton></DialogTitle>
  <DialogContent ref={scroll} sx={{pt:'4px!important','& .notice-actions':{flexWrap:'wrap'},'& .notice-card':{p:{xs:1.5,sm:2}}}}>
   <LinearProgress aria-label="引导进度" aria-valuetext={`第${step+1}步，共${guideSteps.length}步`} variant="determinate" value={(step+1)/guideSteps.length*100} sx={{height:4,borderRadius:2,mb:2.5}}/>
   <Typography component="h3" ref={title} tabIndex={-1} sx={{fontSize:{xs:22,sm:25},fontWeight:700,lineHeight:1.4,outline:'none'}}>{current.title}</Typography>
   <Typography id="guide-description" sx={{mt:1,mb:2,fontSize:16,color:'text.secondary'}}>{current.description}</Typography>
   <Typography sx={{mb:1,fontSize:12,color:'text.secondary'}}>本机演示 · 不保存 · 不调用 AI</Typography>
   {step===0&&<Stack spacing={1.5}><TextField multiline minRows={4} value={pasted?demoOriginal:''} placeholder="演示通知会粘贴到这里" slotProps={{input:{readOnly:true},htmlInput:{'aria-label':'演示通知原文'}}}/><Button variant="outlined" onClick={()=>setPasted(true)}>{pasted?'重新粘贴':'粘贴演示通知'}</Button></Stack>}
   {step===1&&<Stack spacing={2}><Box sx={{p:2,bgcolor:'action.hover',borderRadius:2,lineHeight:1.8}}>{demoOriginal}</Box><Button variant="contained" onClick={generate}>模拟整理</Button><Typography variant="body2" color="text.secondary">正式整理的复杂通知可能需要一分钟或更久。收到云端确认前，请保留原文。</Typography></Stack>}
   {step>=2&&(demo?<NoticeCard notice={demo} app={app} actions={actions} now={Date.now()} expanded={expanded} onExpandedChange={()=>setExpanded(value=>!value)} expandedTaskIDs={tasks} onTaskExpandedChange={id=>setTasks(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;})}/>:<Button variant="outlined" onClick={generate}>重新生成演示通知</Button>)}
   {source&&step>=2&&<Box className="guide-source" sx={{mt:2,p:2,borderLeft:'3px solid',borderColor:'info.main',bgcolor:'action.hover',borderRadius:1}}><Typography sx={{fontWeight:700,mb:1}}>演示原文</Typography><Typography sx={{lineHeight:1.8}}>{demoOriginal}</Typography><Button onClick={()=>setSource(false)}>收起</Button></Box>}
   {message&&step>=2&&<Alert severity="info" role="status" sx={{mt:1.5}}>{message}</Alert>}
   {last&&<Typography variant="body2" sx={{mt:2,color:'text.secondary'}}>正式通知的文字、进度、收藏和笔记在登录后同步；附件留在原设备。看示例无需注册或调用模型。</Typography>}
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
