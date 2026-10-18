import {useEffect,useState} from 'react';
import {Accordion,AccordionDetails,AccordionSummary,Alert,Box,Button,Stack,Typography,useMediaQuery} from '@mui/material';
import Add from '@mui/icons-material/Add';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import type {CampusController} from '../../app/useCampus';
import {problemSummary} from './ProblemHelpDialog';

const questions=[
 {title:'整理时可以关页面吗？',answer:'看到“云端整理中”后可以，稍后登录同一账号看结果。若显示“提交状态尚未确认”，先点“确认提交”。'},
 {title:'换手机后，通知还在吗？',answer:'登录同一账号就能同步通知与进度。退出前看一眼是否“已同步”；图片、文件只保存在原设备。'},
 {title:'删错通知怎么办？',answer:'到设置里的回收站看看，删除的通知会在本机保留 30 天。回收站满了会提示先清理。'},
 {title:'整理结果不对，怎么改？',answer:'点通知的“⋯”→“修正”，再点要改的文字。原通知不会被改掉。'},
 {title:'与我无关的通知，怎么处理？',answer:'点通知上的“不适用”，就会移到“已完成”。需要时还能恢复，之前的进度也会保留。'},
];

/** Keep diagnostic data behind a small secondary action; ordinary help stays on the settings page. */
export function SettingsFAQ({app}:{app:CampusController}){
 const [expanded,setExpanded]=useState<number|false>(false),[copied,setCopied]=useState(false),[manual,setManual]=useState('');
 const [online,setOnline]=useState<boolean|undefined>(()=>typeof navigator==='undefined'?undefined:navigator.onLine);
 const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 async function copy(){
  const text=problemSummary(app,online);
  try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(text);setCopied(true);setManual('');}
  catch{setCopied(false);setManual(text);}
 }
 return <Box>
  {questions.map((item,index)=><Accordion key={item.title} expanded={expanded===index} onChange={(_event,open)=>setExpanded(open?index:false)} disableGutters elevation={0}
   slotProps={{transition:{timeout:reducedMotion?0:320}}}
   sx={{bgcolor:'transparent','&:before':{display:'none'},borderTop:index?'1px solid':'none',borderColor:'divider',mx:{xs:2,sm:2.5}}}>
   <AccordionSummary expandIcon={<Add sx={{fontSize:19}}/>} id={`settings-question-${index}`} aria-controls={`settings-answer-${index}`}
    sx={{px:0,minHeight:56,'& .MuiAccordionSummary-content':{my:1.5},'& .MuiAccordionSummary-expandIconWrapper.Mui-expanded':{transform:'rotate(45deg)'}}}>
    <Typography component="span" sx={{fontSize:17,fontWeight:650,pr:1,lineHeight:1.6}}>{item.title}</Typography>
   </AccordionSummary>
   <AccordionDetails sx={{px:0,pt:0,pb:2}}><Typography sx={{fontSize:14,color:'text.secondary',lineHeight:1.9}}>{item.answer}</Typography></AccordionDetails>
  </Accordion>)}
  <Stack spacing={1} sx={{px:{xs:2,sm:2.5},pb:1.5,alignItems:'flex-start'}}>
   <Button size="small" color="inherit" startIcon={<ContentCopyOutlined sx={{fontSize:'16px!important'}}/>} onClick={()=>void copy()} sx={{color:'text.secondary',fontSize:14,minHeight:36}}>{copied?'已复制':'复制使用状态'}</Button>
   {copied&&<Typography role="status" variant="caption" color="success.main">状态已复制</Typography>}
   {manual&&<Alert severity="info" sx={{width:'100%',fontSize:14}}>请长按复制：<Typography component="pre" sx={{fontFamily:'inherit',whiteSpace:'pre-wrap',fontSize:14,userSelect:'text',mb:0}}>{manual}</Typography></Alert>}
  </Stack>
 </Box>;
}
