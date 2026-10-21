import {useEffect,useState} from 'react';
import {Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,Stack,Typography} from '@mui/material';
import Close from '@mui/icons-material/Close';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import {version as appVersion} from '../../../package.json';
import {GuideFocus} from '../../features/onboarding/GuideFocus';
import {canAdvanceGuide,guideBlockedMessage,guideReadingTarget,guideStepTarget,GUIDE_READING_PAUSE,type GuideProgress} from '../../features/onboarding/guide-progress';
import {InboxCharm} from './InboxCharm';

/** The tooltip only explains. ComposerPage and FeedPage remain the sole product UI. */
export function HelpDialog({open,onClose,onFinished,step,onStep,progress,expanded}:{open:boolean;onClose:()=>void;onFinished:()=>void;step:number;onStep:(step:number)=>void;progress:GuideProgress;expanded:boolean}){
 const achieved=canAdvanceGuide(step,progress),[readReady,setReadReady]=useState(false);
 useEffect(()=>{setReadReady(false);if(!open||!achieved)return;const timer=setTimeout(()=>setReadReady(true),GUIDE_READING_PAUSE);return()=>clearTimeout(timer);},[open,step,achieved]);
 const descriptions=[progress.pasted?'示例原文已填入。\n可以在输入框里滚动读一读，\n看完后点「下一步」。':'点「填入示例」，\n先用一条通知试试。',progress.generated?'整理好了。\n长通知变成了清楚的待办，\n可以先读一读。':'点「AI 整理」，\n看看这条通知要做什么。',progress.reviewed?'步骤就在这里。\n可以按自己的节奏看。':expanded?'再点待办标题，\n看看具体步骤。':'点发光的箭头，\n展开这条通知。',progress.completed?'整条通知已完成！\n现在试试自己的通知。':'点通知右侧的大勾，\n完成整条通知。'];
 const titles=['从一条通知开始','整理成待办','看看具体内容','完成这条通知'];
 return <GuideFocus active={open} selector={guideStepTarget(step,progress,expanded)} readingSelector={guideReadingTarget(step,progress)} onClose={onClose} blockedMessage={guideBlockedMessage(step,progress,expanded)} targetReadOnly={step===0&&progress.pasted} actionEnabled={!achieved} pulse={step===2&&!progress.reviewed}>
  <Stack direction="row" sx={{alignItems:'center',gap:1,mb:1}}><Typography sx={{fontSize:12,fontWeight:700,color:'text.secondary',flex:1}}>快速上手 · {step+1}/4</Typography><IconButton aria-label="关闭引导" onClick={onClose} size="small" sx={{width:32,height:32}}><Close sx={{fontSize:20}}/></IconButton></Stack>
  <Typography component="h2" sx={{fontSize:23,fontWeight:780,lineHeight:1.35,mb:1}}>{titles[step]}</Typography>
  <Typography role="status" aria-live="polite" sx={{fontSize:17,lineHeight:1.65,whiteSpace:'pre-line'}}>{descriptions[step]}</Typography>
  <Stack direction="row" sx={{mt:1.75,gap:1,alignItems:'center'}}><IconButton aria-label="上一步" disabled={step===0} onClick={()=>onStep(step-1)} sx={{width:40,height:40}}><ChevronLeft/></IconButton><Box sx={{flex:1}}/><Button variant="contained" disabled={!achieved||!readReady} onClick={()=>{if(achieved&&readReady){if(step===3)onFinished();else onStep(step+1);}}} sx={{minHeight:44,px:2}}>{step===3?'开始使用':'下一步'}</Button></Stack>
 </GuideFocus>;
}
export function AboutDialog({open,onClose,introduction=false,onStart,onExited}:{open:boolean;onClose:()=>void;introduction?:boolean;onStart?:()=>void;onExited?:()=>void}){
 return <Dialog open={open} onClose={onClose} slotProps={{transition:{onExited}}}><DialogTitle sx={{display:'flex',alignItems:'center',gap:1}}>校园 Inbox<Box sx={{flex:1}}/>{introduction&&<IconButton aria-label="关闭介绍" onClick={onClose} size="small"><Close/></IconButton>}</DialogTitle><DialogContent><Box component="img" src={`${import.meta.env.BASE_URL}onboarding/cover-crisp.svg`} alt="校园 Inbox：群通知，变成待办" width="1520" height="864" sx={{display:'block',width:'100%',maxWidth:380,height:'auto',borderRadius:2,mb:2,mx:'auto'}}/><Typography sx={{fontSize:18,lineHeight:1.7}}>把群通知变成清楚的待办。<br/>{introduction?'一起试一条。':'看步骤，记进度。'}</Typography>{!introduction&&<Box sx={{mt:2,display:'flex',alignItems:'center',gap:1.5}}><InboxCharm size={44}/><Box><Typography color="text.secondary" sx={{fontSize:14}}>Kemou 制作</Typography><Typography variant="caption" color="text.secondary">版本 {appVersion} · 网页 / 安卓</Typography></Box></Box>}</DialogContent><DialogActions><Button variant="contained" onClick={introduction?onStart:onClose}>{introduction?'开始体验':'关闭'}</Button></DialogActions></Dialog>;
}
