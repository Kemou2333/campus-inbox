import {useEffect,useRef,useState} from 'react';
import type {CampusController} from '../../app/useCampus';
import {createGuideSession,GUIDE_DRAFT_ID} from './guide-session';

/** Only these explicitly local operations reach the practice shown by the real pages. */
export function useGuideSession(app:CampusController,active:boolean){
 const [,redraw]=useState(0);
 const [session]=useState(()=>createGuideSession(()=>redraw(value=>value+1)));
 const previous=useRef(active);
 useEffect(()=>{if(active&&!previous.current)session.reset();previous.current=active;},[active,session]);
 useEffect(()=>()=>session.dispose(),[session]);
 const state=session.snapshot;
 const noAction=()=>{};
 const controller:CampusController={...app,
  notices:state.notice?[state.notice]:[],drafts:[state.draft],localDataScope:'guide-practice',
  busy:state.busy,stage:state.busy?'整理中':'',demoDraftID:state.filled?GUIDE_DRAFT_ID:null,
  retryAt:0,pending:false,legacyRecords:[],legacyMissingFiles:false,bootError:'',
  analysisJobs:[],unconfirmedSubmissions:[],jobStatusError:'',unreadNoticeIDs:[],
  latestAddedID:null,toast:null,error:'',
  fillDemoDraft:()=>session.fill()??undefined,analyzeDemo:()=>session.organize(),
  // A tutorial can never fall through to a paid or personal action.
  analyze:async()=>false,askQuestion:async()=>{throw new Error('请先完成引导。');},
  act:(id,change)=>session.act(id,change),update:()=>undefined,remove:noAction,
  changeDraft:noAction,insertDraft:noAction,pasteDraft:noAction,addDraft:noAction,
  removeDraft:async()=>{},attach:async()=>{},detach:async()=>{},
  markNoticeRead:noAction,clearUnreadNotices:noAction,loadExamples:async()=>{},
  recoverResult:noAction,recoverLegacyResult:noAction,receiveShare:async()=>false,
  report:noAction,tell:noAction,cancel:()=>session.reset()
 };
 return {controller:active?controller:app,state,session};
}
