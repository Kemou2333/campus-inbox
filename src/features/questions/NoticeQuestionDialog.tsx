import {useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,Stack,TextField,Typography} from '@mui/material';
import Close from '@mui/icons-material/Close';
import SendOutlined from '@mui/icons-material/SendOutlined';
import type {Notice} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {prepareQuestion,readQuestion,saveQuestionResult,type QuestionRecord} from '../../infrastructure/question-journal';
import type {NoticeQuestionAnswer} from '../../infrastructure/notice-question-client';
import {RichText} from '../../shared/ui/RichText';

export default function NoticeQuestionDialog({notice,app,onClose,onLogin}:{notice:Notice|null;app:CampusController;onClose:()=>void;onLogin:()=>void}){
 const [question,setQuestion]=useState(''),[answer,setAnswer]=useState<NoticeQuestionAnswer|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[recoverable,setRecoverable]=useState(false);
 const active=useRef<AbortController|null>(null),context=useRef(0);
 useEffect(()=>{const generation=++context.current;active.current?.abort();active.current=null;setBusy(false);setQuestion('');setAnswer(null);setError('');setRecoverable(false);
  if(notice&&app.sync.connected&&app.username)void readQuestion(localStorage,app.username,notice.id,notice.originalText).then(record=>{if(context.current!==generation||!record)return;setQuestion(record.question);setAnswer(record.result??null);setRecoverable(!record.result);}).catch(()=>{});
  return()=>{context.current++;active.current?.abort();};
 },[notice?.id,notice?.originalText,app.username,app.sync.connected]);
 function close(){active.current?.abort();onClose();}
 async function send(){
  if(!notice||!question.trim()||busy)return;if(!app.sync.connected){onLogin();return;}
  const generation=context.current,controller=new AbortController();active.current=controller;setBusy(true);setError('');setAnswer(null);
  let record:QuestionRecord|undefined;
  try{
   record=await prepareQuestion(localStorage,app.username,notice.id,notice.originalText,question);
   const result=record.result??await app.askQuestion(notice.id,record.question,record.requestId,controller.signal);
   saveQuestionResult(localStorage,record,result);
   if(context.current===generation){setAnswer(result);setRecoverable(false);}
  }catch(e){if(context.current===generation){setError(e instanceof Error?e.message:'暂时无法回答。');setRecoverable(!!record);}}
  finally{if(context.current===generation){setBusy(false);active.current=null;}}
 }
 return <Dialog open={!!notice} onClose={close} aria-labelledby="question-heading"><DialogTitle id="question-title-row" component="div" sx={{display:'flex',alignItems:'center',gap:1}}><Typography id="question-heading" component="h2" variant="h5" sx={{flex:1}}>问这条通知</Typography><IconButton aria-label="关闭提问" onClick={close}><Close/></IconButton></DialogTitle>
  <DialogContent><Typography sx={{fontWeight:700,mb:.5}}>{notice?.title}</Typography><Typography variant="body2" color="text.secondary" sx={{mb:2}}>仅依据这条原文 · 每日最多5问</Typography>
   {!!notice&&notice.originalText.length>4000&&<Alert severity="info" sx={{mb:2}}>原文超过4,000字，暂不能提问。</Alert>}
   <TextField autoFocus multiline minRows={2} maxRows={5} label="想问什么？" placeholder="例如：我要交什么材料？" value={question} disabled={busy} onChange={e=>{setQuestion(e.target.value);setAnswer(null);setError('');setRecoverable(false);}} slotProps={{htmlInput:{maxLength:240}}} helperText={`${question.length}/240`}/>
   {busy&&<Stack role="status" direction="row" sx={{gap:1,alignItems:'center',mt:2}}><CircularProgress size={18}/><Typography>正在看原文…</Typography></Stack>}
   {error&&<Alert severity="warning" sx={{mt:2}}>{error}</Alert>}
   {answer&&<Box className="notice-question-answer" role="status" sx={{mt:2,p:2,bgcolor:'action.hover',borderLeft:'3px solid',borderColor:'primary.main',borderRadius:1}}><RichText text={answer.answer}/>{!!answer.evidence.length&&<Box sx={{mt:2,pt:1.5,borderTop:'1px solid',borderColor:'divider'}}><Typography variant="caption" sx={{color:'primary.main',fontWeight:700}}>原文依据</Typography>{answer.evidence.map((quote,i)=><Typography key={i} component="blockquote" sx={{m:0,mt:1,fontSize:14,lineHeight:1.7,color:'text.secondary',whiteSpace:'pre-wrap'}}>{quote}</Typography>)}</Box>}</Box>}
  </DialogContent><DialogActions><Button onClick={close}>{busy?'稍后再看':'关闭'}</Button><Button variant="contained" startIcon={<SendOutlined/>} disabled={busy||!question.trim()||question.length>240||!!notice&&notice.originalText.length>4000} onClick={()=>void send()}>{app.sync.connected?recoverable?'查看本次结果':'提问':'登录后提问'}</Button></DialogActions>
 </Dialog>;
}
