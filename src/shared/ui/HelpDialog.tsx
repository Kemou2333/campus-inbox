import {useEffect,useRef,useState} from 'react';
import {Box,Button,Chip,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,LinearProgress,Stack,TextField,Typography,useMediaQuery} from '@mui/material';
import Close from '@mui/icons-material/Close';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import {version as appVersion} from '../../../package.json';
import {NoticeCard,type NoticeActions,type NoticeCardController} from '../../features/notices/NoticeCard';
import {createDemoNotice,demoOriginal} from '../../features/onboarding/demo-notice';
import type {Notice,NoteTarget} from '../../domain/types';
import {updateNote} from '../../domain/notice';
import {GuideFocus} from '../../features/onboarding/GuideFocus';
import {canAdvanceGuide} from '../../features/onboarding/guide-progress';
import {AndroidDownloads} from './AndroidDownloads';
import {InboxCharm} from './InboxCharm';
const guideSteps=[
 {title:'粘贴通知',description:'先用这条通知试试看。'},
 {title:'生成待办',description:'点「模拟整理」，看看结果。'},
 {title:'展开查看',description:'先点「展开」，\n再点一条待办。'},
 {title:'打勾完成',description:'点方框打勾，\n记录完成进度。'}
];
const demoReadingText=demoOriginal.replace(/^【脱敏示例】[^\n]*\n+/,'').replace(/。(?=.)/g,'。\n');
export function HelpDialog({open,onClose,onExamples,onCompose}:{open:boolean;onClose:()=>void;onExamples?:()=>void|Promise<void>;onCompose?:()=>void}){
 const compact=useMediaQuery('(max-height:500px)');
 const [intro,setIntro]=useState(true);
 const [step,setStep]=useState(0),[pasted,setPasted]=useState(false),[demo,setDemo]=useState<Notice|null>(null),[expanded,setExpanded]=useState(false),[reviewed,setReviewed]=useState(false),[tasks,setTasks]=useState<Set<string>>(new Set()),[source,setSource]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(false);
 const [note,setNote]=useState<{target:NoteTarget;title:string;text:string}|null>(null);
 const title=useRef<HTMLHeadingElement>(null),scroll=useRef<HTMLDivElement>(null),caption=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(open){setIntro(true);setStep(0);setPasted(false);setDemo(null);setExpanded(false);setReviewed(false);setTasks(new Set());setSource(false);setMessage('');setNote(null);}},[open]);
 useEffect(()=>{if(open){title.current?.focus({preventScroll:true});scroll.current?.scrollTo({top:0});}},[open,step,intro]);
 const current=guideSteps[step],last=step===guideSteps.length-1,firstTask=demo?.tasks[0];
 const ready=canAdvanceGuide(step,{pasted,generated:!!demo,reviewed,completed:!!firstTask?.completed});
 const selector=step===0?(pasted?'[data-guide-next]':'[data-guide-paste]'):step===1?'[data-guide-generate]':step===2?(reviewed?'[data-guide-next]':!expanded?'.notice-expand':'.task-expand'):!firstTask?.completed?'.task-list .MuiCheckbox-root':'[data-guide-finish]';
 const description=step===0&&pasted?'原文在这里。\n继续看看整理结果。':step===2?(reviewed?'步骤在这里。\n看完点「下一步」。':expanded?'再点待办标题，\n查看具体步骤。':'点「展开」，\n看看有哪些待办。'):last?(firstTask?.completed?'完成啦！\n可以试试自己的通知了。':current.description):current.description;
 function next(){if(ready)setStep(value=>value+1);}

 const app:NoticeCardController={act:(id,change,text)=>{if(!demo||demo.id!==id)return;const before=demo,after=change(before);setDemo(after);setMessage(text);return {before,after};},remove:()=>{setDemo(null);setReviewed(false);setMessage('已删除，可重新生成。');}};
 const actions:NoticeActions={details:()=>setSource(true),evidence:()=>setSource(true),note:(_n,target,title,text)=>setNote({target,title,text}),calendar:()=>setMessage('提醒功能请在正式通知中使用。'),correct:()=>setMessage('修正功能请在正式通知中使用。')};
 function generate(){setDemo(createDemoNotice());setExpanded(false);setReviewed(false);setTasks(new Set());setSource(false);setMessage('');setStep(2);}
 async function examples(){if(!ready)return;setLoading(true);try{await onExamples?.();}finally{setLoading(false);}}
 return <><Dialog open={open} onClose={(_event,reason)=>{if(reason!=='backdropClick')onClose();}} aria-labelledby="guide-heading" aria-describedby="guide-description" className="onboarding-dialog" maxWidth="sm" fullScreen={compact} slotProps={{paper:{sx:compact?{m:0,borderRadius:0,width:'100%',maxHeight:'100%',height:'100%'}:undefined}}}>
  <DialogTitle data-guide-header component="div" sx={{display:'flex',alignItems:'center',gap:1,pr:1.5,py:compact?.25:undefined}}><Typography component="h2" id="guide-heading" sx={{flex:1,fontSize:22,fontWeight:700}}>{intro?'认识校园 Inbox':'快速上手'}</Typography>{!intro&&<Chip size="small" color="primary" variant="outlined" label={`${step+1}/${guideSteps.length}`}/>}<IconButton aria-label="关闭引导" onClick={onClose}><Close/></IconButton></DialogTitle>
  <DialogContent ref={scroll} sx={{pt:'4px!important','& .notice-actions':{flexWrap:'wrap'},'& .notice-card':{p:{xs:1.5,sm:2}}}}>
   {!intro&&<LinearProgress aria-label="引导进度" aria-valuetext={`第${step+1}步，共${guideSteps.length}步`} variant="determinate" value={(step+1)/guideSteps.length*100} sx={{height:4,borderRadius:2,mb:2.5}}/>}
   {intro&&<Box component="img" src={`${import.meta.env.BASE_URL}onboarding/cover-crisp.svg`} alt="校园 Inbox：群通知，变成待办" width="1520" height="864" sx={{display:'block',width:'100%',height:'auto',maxWidth:380,maxHeight:compact?140:216,objectFit:'contain',mx:'auto',mb:2,borderRadius:2}}/>}
   <Box ref={caption} data-guide-caption sx={{position:intro||compact?'static':'sticky',top:0,zIndex:2,bgcolor:'background.paper',pb:1}}><Typography component="h3" ref={title} tabIndex={-1} sx={{fontSize:{xs:26,sm:28},fontWeight:700,lineHeight:1.4,outline:'none'}}>{intro?'从一条通知开始':current.title}</Typography>
   <Typography id="guide-description" sx={{mt:1,mb:1,fontSize:intro?18:{xs:19,sm:20},fontWeight:intro?400:500,lineHeight:1.65,whiteSpace:'pre-line'}}>{intro?'粘贴通知，看清要做什么。\n完成一项，打一个勾。':description}</Typography>
   </Box>
   {intro&&!window.CampusNative?.postMessage&&<AndroidDownloads compact/>}
   {!intro&&step===0&&<Stack spacing={1.5}><TextField data-guide-original multiline minRows={3} maxRows={6} value={pasted?demoReadingText:''} placeholder="演示通知会粘贴到这里" slotProps={{input:{readOnly:true},htmlInput:{'aria-label':'演示通知原文'}}}/><Button data-guide-paste variant="outlined" onClick={()=>setPasted(true)}>{pasted?'重新粘贴':'粘贴演示通知'}</Button></Stack>}
   {!intro&&step===1&&<Stack spacing={2}><Box data-guide-original sx={{p:2,mt:1,maxHeight:{xs:180,sm:220},overflowY:'auto',bgcolor:'action.hover',borderRadius:2,lineHeight:1.8,whiteSpace:'pre-line'}}>{demoReadingText}</Box><Button data-guide-generate variant="contained" onClick={generate}>模拟整理</Button></Stack>}
   {!intro&&step>=2&&(demo?<NoticeCard notice={demo} app={app} actions={actions} now={Date.now()} expanded={expanded} onExpandedChange={()=>setExpanded(value=>!value)} expandedTaskIDs={tasks} onTaskExpandedChange={id=>{if(id===firstTask?.id&&!tasks.has(id))setReviewed(true);setTasks(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;});}}/>:<Button variant="outlined" onClick={generate}>重新生成演示通知</Button>)}
   {source&&step>=2&&<Box className="guide-source" sx={{mt:2,p:2,borderLeft:'3px solid',borderColor:'info.main',bgcolor:'action.hover',borderRadius:1}}><Typography sx={{fontWeight:700,mb:1}}>演示原文</Typography><Typography sx={{lineHeight:1.8,whiteSpace:'pre-line'}}>{demoOriginal}</Typography><Button onClick={()=>setSource(false)}>收起</Button></Box>}
   {message&&step>=2&&<Typography role="status" variant="body2" color="primary" sx={{mt:1}}>{message}</Typography>}
  </DialogContent>
  <GuideFocus panel={scroll} caption={caption} selector={selector} contextSelector={step>=2?'.notice-card':pasted?'[data-guide-original]':null} readingSelector={step===2&&reviewed?'.task-content':null} active={open&&!intro&&!note}/>
  <DialogActions data-guide-navigation sx={{gap:.5,flexWrap:'wrap',py:compact?.5:undefined}}>
   {intro?<Button variant="contained" onClick={()=>setIntro(false)}>开始体验</Button>:<><IconButton aria-label="上一步" disabled={step===0} onClick={()=>setStep(value=>value-1)}><ChevronLeft/></IconButton>
   {last?<>{onExamples&&<Button disabled={!ready||loading} onClick={()=>void examples()}>{loading?'载入中…':'更多示例'}</Button>}<Button data-guide-finish variant="contained" disabled={!ready} onClick={()=>{if(ready)(onCompose??onClose)();}}>开始使用</Button></>:step!==1&&<Button data-guide-next variant="contained" disabled={!ready} onClick={next}>下一步</Button>}</>}
  </DialogActions>
 </Dialog>
 <Dialog open={!!note&&open} onClose={()=>setNote(null)}><DialogTitle>{note?.title}</DialogTitle><DialogContent><TextField multiline minRows={3} value={note?.text??''} label="演示笔记" onChange={event=>setNote(value=>value?{...value,text:event.target.value}:null)}/></DialogContent><DialogActions><Button onClick={()=>setNote(null)}>取消</Button><Button onClick={()=>{if(note)setDemo(value=>value?updateNote(value,note.target,note.text):value);setNote(null);}}>保存演示笔记</Button></DialogActions></Dialog></>;
}
export function AboutDialog({open,onClose}:{open:boolean;onClose:()=>void}){
 return <Dialog open={open} onClose={onClose}><DialogTitle>校园 Inbox</DialogTitle><DialogContent><Box component="img" src={`${import.meta.env.BASE_URL}onboarding/cover-crisp.svg`} alt="校园 Inbox：群通知，变成待办" width="1520" height="864" sx={{display:'block',width:'100%',maxWidth:380,height:'auto',borderRadius:2,mb:2,mx:'auto'}}/><Typography sx={{fontSize:18,lineHeight:1.7}}>把群通知变成清楚的待办。<br/>看步骤，记进度。</Typography><AndroidDownloads compact/><Box sx={{mt:2,display:'flex',alignItems:'center',gap:1.5}}><InboxCharm size={44}/><Box><Typography color="text.secondary" sx={{fontSize:14}}>Kemou 制作</Typography><Typography variant="caption" color="text.secondary">版本 {appVersion} · 网页 / 安卓</Typography></Box></Box></DialogContent><DialogActions><Button variant="contained" onClick={onClose}>关闭</Button></DialogActions></Dialog>;
}
