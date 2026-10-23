import {useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,Stack,TextField,Typography} from '@mui/material';
import Close from '@mui/icons-material/Close';
import SendOutlined from '@mui/icons-material/SendOutlined';
import type {Notice} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {markQuestionRejected,prepareQuestion,readQuestion,saveQuestionResult,type QuestionRecord} from '../../infrastructure/question-journal';
import type {NoticeQuestionAnswer} from '../../infrastructure/notice-question-client';
import {RichText} from '../../shared/ui/RichText';
import {AnalysisError} from '../../infrastructure/ai-client';
import {readableQuestionAnswer} from './answer-reading';
import {friendlyErrorMessage} from '../../shared/error-message';
import {findReviewedExampleQuestion,type ReviewedExampleQuestion} from './reviewed-example-question';
import {hasSeenFirstUseHint,markFirstUseHintSeen} from '../../shared/ui/first-use-hint';
import {waitForGuestDemo} from '../../infrastructure/guest-demo';

type DisplayedAnswer=Pick<NoticeQuestionAnswer,'answer'|'evidence'>&{origin:'provider'|'human-reviewed-example'};

export default function NoticeQuestionDialog({notice,app,onClose,onLogin}:{notice:Notice|null;app:CampusController;onClose:()=>void;onLogin:()=>void}){
 const [question,setQuestion]=useState(''),[answer,setAnswer]=useState<DisplayedAnswer|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sample,setSample]=useState<ReviewedExampleQuestion|null>(null);
 const [showHint,setShowHint]=useState(()=>!hasSeenFirstUseHint('notice-question'));
 const active=useRef<AbortController|null>(null),context=useRef(0);
 useEffect(()=>{if(notice)markFirstUseHintSeen('notice-question');},[notice?.id]);
 useEffect(()=>{const generation=++context.current;active.current?.abort();active.current=null;setBusy(false);setQuestion('');setAnswer(null);setError('');setSample(null);
  if(notice)void (async()=>{
   const example=await findReviewedExampleQuestion(notice);
   if(context.current!==generation)return;
   if(example){setSample(example);setQuestion(example.question);return;}
   if(app.sync.connected&&app.username){const record=await readQuestion(localStorage,app.username,notice.id,notice.originalText);if(context.current!==generation||!record)return;setQuestion(record.question);setAnswer(record.result?{...record.result,origin:'provider'}:null);}
  })().catch(()=>{});
  return()=>{context.current++;active.current?.abort();};
 },[notice,app.username,app.sync.connected]);
 function close(){active.current?.abort();onClose();}
 async function send(){
  if(!notice||!question.trim()||busy)return;
  const generation=context.current,controller=new AbortController();active.current=controller;setBusy(true);setError('');setAnswer(null);
  let record:QuestionRecord|undefined;
  try{
   if(sample&&question.trim()===sample.question){
    const reviewed=await findReviewedExampleQuestion(notice);
    if(context.current!==generation)return;
    if(reviewed){await waitForGuestDemo(controller.signal,1300);if(context.current!==generation||controller.signal.aborted)return;setAnswer({answer:reviewed.answer,evidence:reviewed.evidence,origin:reviewed.origin});return;}
    setSample(null);
   }
   if(!app.sync.connected){onLogin();return;}
   record=await prepareQuestion(localStorage,app.username,notice.id,notice.originalText,question);
   const result=record.result??await app.askQuestion(notice.id,record.question,record.requestId,controller.signal);
   saveQuestionResult(localStorage,record,result);
   if(context.current===generation){setAnswer({...result,origin:'provider'});}
  }catch(e){if(context.current===generation&&!controller.signal.aborted){setError(friendlyErrorMessage(e));const rejected=e instanceof AnalysisError&&[400,401,403,413,415].includes(e.status);if(record&&rejected)try{markQuestionRejected(localStorage,record);}catch{/* Keep the original error visible. */}}}
  finally{if(context.current===generation){setBusy(false);active.current=null;}}
 }
 const sampleQuestion=!!sample&&question.trim()===sample.question;
 return <Dialog open={!!notice} onClose={close} aria-labelledby="question-heading"><DialogTitle id="question-title-row" component="div" sx={{display:'flex',alignItems:'center',gap:1}}><Typography id="question-heading" component="h2" variant="h5" sx={{flex:1}}>问这条通知</Typography><IconButton aria-label="关闭提问" onClick={close}><Close/></IconButton></DialogTitle>
  <DialogContent>{showHint&&<Alert severity="info" onClose={()=>setShowHint(false)} sx={{mb:2}}>只围绕当前通知提问，回答附原文依据。</Alert>}<Typography sx={{fontWeight:700,mb:.5}}>{notice?.title}</Typography><Typography variant="body2" color="text.secondary" sx={{mb:2}}>{sampleQuestion?'示例问答 · 可直接体验':'仅依据这条原文 · 五小时 5 问，三天 15 问'}</Typography>
   {!!notice&&notice.originalText.length>4000&&<Alert severity="info" sx={{mb:2}}>原文超过4,000字，暂不能提问。</Alert>}
   <TextField autoFocus multiline minRows={2} maxRows={5} label="想问什么？" placeholder="例如：我要交什么材料？" value={question} disabled={busy} onChange={e=>{setQuestion(e.target.value);setAnswer(null);setError('');}} slotProps={{htmlInput:{maxLength:240}}} helperText={question.length>=200?`${question.length}/240`:undefined}/>
   {busy&&<Stack role="status" direction="row" sx={{gap:1,alignItems:'center',mt:2}}><CircularProgress size={18}/><Typography>正在看原文…</Typography></Stack>}
   {error&&<Alert severity="warning" sx={{mt:2}}>{error}</Alert>}
   {answer&&<Box className="notice-question-answer" role="status" data-answer-origin={answer.origin} sx={{mt:2,p:2,bgcolor:'action.hover',borderLeft:'3px solid',borderColor:'primary.main',borderRadius:1,'& .rich-text > p + p':{mt:1.5},'& .rich-text li + li':{mt:.75}}}>{answer.origin==='human-reviewed-example'&&<Typography variant="caption" color="text.secondary" sx={{display:'block',fontWeight:700,mb:1}}>示例回答</Typography>}<RichText text={readableQuestionAnswer(answer.answer)}/>{!!answer.evidence.length&&<Box component="details" className="question-evidence" sx={{mt:2,pt:.75,borderTop:'1px solid',borderColor:'divider'}}><Box component="summary" sx={{color:'primary.main',fontSize:14,fontWeight:700,cursor:'pointer',py:.75}}>原文依据 {answer.evidence.length}</Box>{answer.evidence.map((quote,i)=><Typography key={i} component="blockquote" sx={{m:0,mt:1,fontSize:14,lineHeight:1.7,color:'text.secondary',whiteSpace:'pre-wrap'}}>{quote}</Typography>)}</Box>}</Box>}
  </DialogContent><DialogActions><Button variant="contained" startIcon={<SendOutlined/>} disabled={busy||!question.trim()||question.length>240||!!notice&&notice.originalText.length>4000} onClick={()=>void send()}>让 AI 回答</Button></DialogActions>
 </Dialog>;
}
