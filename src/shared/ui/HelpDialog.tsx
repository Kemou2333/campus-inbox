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
const guideSteps=[
 {title:'粘贴通知',description:'先用这条通知试试看。'},
 {title:'生成待办',description:'点「模拟整理」，看看结果。'},
 {title:'展开查看',description:'先点「展开」，\n再点一条待办。'},
 {title:'打勾完成',description:'点方框打勾，\n记录完成进度。'}
];
const demoReadingText=demoOriginal.replace(/^【脱敏示例】[^\n]*\n+/,'').replace(/。(?=.)/g,'。\n');
export function HelpDialog({open,onClose,onExamples,onCompose}:{open:boolean;onClose:()=>void;onExamples?:()=>void|Promise<void>;onCompose?:()=>void}){
 const compact=useMediaQuery('(max-height:500px)');
 const [step,setStep]=useState(0),[pasted,setPasted]=useState(false),[demo,setDemo]=useState<Notice|null>(null),[expanded,setExpanded]=useState(false),[tasks,setTasks]=useState<Set<string>>(new Set()),[source,setSource]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(false);
 const [note,setNote]=useState<{target:NoteTarget;title:string;text:string}|null>(null);
 const title=useRef<HTMLHeadingElement>(null),scroll=useRef<HTMLDivElement>(null),caption=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(open){setStep(0);setPasted(false);setDemo(null);setExpanded(false);setTasks(new Set());setSource(false);setMessage('');setNote(null);}},[open]);
 useEffect(()=>{if(open){title.current?.focus({preventScroll:true});scroll.current?.scrollTo({top:0});}},[open,step]);
 const current=guideSteps[step],last=step===guideSteps.length-1,firstTask=demo?.tasks[0];
 const itemOpen=!!firstTask&&tasks.has(firstTask.id);
 const selector=step===0?(pasted?null:'[data-guide-paste]'):step===1?'[data-guide-generate]':step===2?(!expanded?'.notice-expand':!itemOpen?'.task-expand':null):demo?.dismissed?'.notice-dismiss':!firstTask?.completed?'.task-list .MuiCheckbox-root':!demo?.favorite?'.notice-favorite':null;
 const description=step===0&&pasted?'原文在这里。\n继续看看整理结果。':step===2?(expanded?(itemOpen?'步骤在这里。\n继续试试打勾。':'再点待办标题，\n查看具体步骤。'):'点「展开」，\n看看有哪些待办。'):last?(demo?.dismissed?'点「恢复」，\n继续这次练习。':firstTask?.completed?(demo?.favorite?'完成啦！\n可以试试自己的通知了。':'再点星星，\n收藏这条通知。'):current.description):current.description;
 function next(){if(step===2)setExpanded(true);setStep(value=>value+1);}

 const app:NoticeCardController={act:(id,change,text)=>{setDemo(value=>value?.id===id?change(value):value);setMessage(text);},remove:()=>{setDemo(null);setMessage('已删除，可重新生成。');}};
 const actions:NoticeActions={details:()=>setSource(true),evidence:()=>setSource(true),note:(_n,target,title,text)=>setNote({target,title,text}),calendar:()=>setMessage('提醒功能请在正式通知中使用。'),correct:()=>setMessage('修正功能请在正式通知中使用。')};
 function generate(){setDemo(createDemoNotice());setExpanded(false);setTasks(new Set());setSource(false);setMessage('');setStep(2);}
 async function examples(){setLoading(true);try{await onExamples?.();}finally{setLoading(false);}}
 return <><Dialog open={open} onClose={onClose} aria-labelledby="guide-heading" aria-describedby="guide-description" className="onboarding-dialog" maxWidth="sm" fullScreen={compact} slotProps={{paper:{sx:compact?{m:0,borderRadius:0,width:'100%',maxHeight:'100%',height:'100%'}:undefined}}}>
  <DialogTitle component="div" sx={{display:'flex',alignItems:'center',gap:1,pr:1.5,py:compact?.25:undefined}}><Typography component="h2" id="guide-heading" sx={{flex:1,fontSize:22,fontWeight:700}}>快速上手</Typography><Chip size="small" color="primary" variant="outlined" label={`${step+1}/${guideSteps.length}`}/><IconButton aria-label="关闭引导" onClick={onClose}><Close/></IconButton></DialogTitle>
  <DialogContent ref={scroll} sx={{pt:'4px!important','& .notice-actions':{flexWrap:'wrap'},'& .notice-card':{p:{xs:1.5,sm:2}}}}>
   <LinearProgress aria-label="引导进度" aria-valuetext={`第${step+1}步，共${guideSteps.length}步`} variant="determinate" value={(step+1)/guideSteps.length*100} sx={{height:4,borderRadius:2,mb:2.5}}/>
   <Box ref={caption} data-guide-caption sx={{position:'sticky',top:0,zIndex:2,bgcolor:'background.paper',pb:1}}><Typography component="h3" ref={title} tabIndex={-1} sx={{fontSize:{xs:26,sm:28},fontWeight:700,lineHeight:1.4,outline:'none'}}>{current.title}</Typography>
   <Typography id="guide-description" sx={{mt:1,mb:1,fontSize:{xs:19,sm:20},fontWeight:500,lineHeight:1.6,whiteSpace:'pre-line'}}>{description}</Typography>
   <Typography sx={{fontSize:12,color:'text.secondary'}}>真实通知 · 已隐藏个人信息</Typography></Box>
   {step===0&&<Stack spacing={1.5}><TextField multiline minRows={3} maxRows={6} value={pasted?demoReadingText:''} placeholder="演示通知会粘贴到这里" slotProps={{input:{readOnly:true},htmlInput:{'aria-label':'演示通知原文'}}}/><Button data-guide-paste variant="outlined" onClick={()=>setPasted(true)}>{pasted?'重新粘贴':'粘贴演示通知'}</Button></Stack>}
   {step===1&&<Stack spacing={2}><Box sx={{p:2,mt:1,maxHeight:{xs:180,sm:220},overflowY:'auto',bgcolor:'action.hover',borderRadius:2,lineHeight:1.8,whiteSpace:'pre-line'}}>{demoReadingText}</Box><Button data-guide-generate variant="contained" onClick={generate}>模拟整理</Button></Stack>}
   {step>=2&&(demo?<NoticeCard notice={demo} app={app} actions={actions} now={Date.now()} expanded={expanded} onExpandedChange={()=>setExpanded(value=>!value)} expandedTaskIDs={tasks} onTaskExpandedChange={id=>setTasks(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;})}/>:<Button variant="outlined" onClick={generate}>重新生成演示通知</Button>)}
   {source&&step>=2&&<Box className="guide-source" sx={{mt:2,p:2,borderLeft:'3px solid',borderColor:'info.main',bgcolor:'action.hover',borderRadius:1}}><Typography sx={{fontWeight:700,mb:1}}>演示原文</Typography><Typography sx={{lineHeight:1.8,whiteSpace:'pre-line'}}>{demoOriginal}</Typography><Button onClick={()=>setSource(false)}>收起</Button></Box>}
   {message&&step>=2&&<Typography role="status" variant="body2" color="primary" sx={{mt:1}}>{message}</Typography>}
  </DialogContent>
  <GuideFocus panel={scroll} caption={caption} selector={selector} active={open&&!note}/>
  <DialogActions sx={{gap:.5,flexWrap:'wrap',py:compact?.5:undefined}}>
   {!last&&<Button onClick={onClose} color="inherit" sx={{mr:'auto'}}>跳过</Button>}
   <IconButton aria-label="上一步" disabled={step===0} onClick={()=>setStep(value=>value-1)}><ChevronLeft/></IconButton>
   {last?<>{onCompose&&<Button variant="outlined" onClick={onCompose}>去整理</Button>}{onExamples?<Button variant="contained" disabled={loading} onClick={()=>void examples()}>{loading?'载入中…':'看示例'}</Button>:<Button variant="contained" onClick={onClose}>开始使用</Button>}</>:step!==1&&<Button variant="contained" disabled={step===0&&!pasted} onClick={next}>下一步</Button>}
  </DialogActions>
 </Dialog>
 <Dialog open={!!note&&open} onClose={()=>setNote(null)}><DialogTitle>{note?.title}</DialogTitle><DialogContent><TextField multiline minRows={3} value={note?.text??''} label="演示笔记" onChange={event=>setNote(value=>value?{...value,text:event.target.value}:null)}/></DialogContent><DialogActions><Button onClick={()=>setNote(null)}>取消</Button><Button onClick={()=>{if(note)setDemo(value=>value?updateNote(value,note.target,note.text):value);setNote(null);}}>保存演示笔记</Button></DialogActions></Dialog></>;
}
export function AboutDialog({open,onClose}:{open:boolean;onClose:()=>void}){
 return <Dialog open={open} onClose={onClose}><DialogTitle>校园 Inbox</DialogTitle><DialogContent><Typography>把校园通知变成待办。</Typography><Typography color="text.secondary" sx={{mt:2}}>Kemou 制作 · 支持网页与安卓</Typography><Typography variant="caption" color="text.secondary" sx={{display:'block',mt:2}}>版本 {appVersion}</Typography></DialogContent><DialogActions><Button variant="contained" onClick={onClose}>关闭</Button></DialogActions></Dialog>;
}
