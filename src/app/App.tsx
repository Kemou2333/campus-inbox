import {lazy,Suspense,useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Alert,AppBar,BottomNavigation,BottomNavigationAction,Box,Button,CircularProgress,Container,CssBaseline,Dialog,DialogActions,DialogContent,DialogTitle,Divider,IconButton,Paper,Snackbar,Stack,Toolbar,Tooltip,Typography,useMediaQuery} from '@mui/material';
import {ThemeProvider} from '@mui/material/styles';
import Inbox from '@mui/icons-material/Inbox';
import AddCircleOutline from '@mui/icons-material/AddCircleOutlineOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import HelpOutline from '@mui/icons-material/HelpOutlineOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import Close from '@mui/icons-material/Close';
import {useCampus} from './useCampus';
import {makeTheme} from './theme';
import {FeedPage,createFeedViewState} from '../features/notices/FeedPage';
import {ComposerPage} from '../features/composer/ComposerPage';
import {AnalysisJobStatus} from '../features/composer/AnalysisJobStatus';
import SettingsPage from '../features/settings/SettingsPage';
import LoginDialog from '../features/settings/LoginDialog';
import {NoteDialog,type NoteEditor} from '../features/notes/NoteDialog';
import {CalendarDialog,type CalendarSelection} from '../features/notices/CalendarDialog';
import {DetailDialog} from '../features/notices/DetailDialog';
import {CorrectionDialog,type CorrectionSelection} from '../features/notices/CorrectionDialog';
import {AboutDialog,HelpDialog} from '../shared/ui/HelpDialog';
import type {NoticeActions} from '../features/notices/NoticeCard';
import {ScrollPane} from '../shared/ui/ScrollPane';
import {getNoticeStatus} from '../domain/notice';
import {useHumanVerification} from '../features/security/useHumanVerification';
import {HumanVerificationDialog} from '../features/security/HumanVerificationDialog';
import type {Notice} from '../domain/types';
import {SearchQueryContext} from '../shared/ui/SearchHighlight';
import {AndroidDownloads} from '../shared/ui/AndroidDownloads';
import {installOperationSounds,playOperationSound} from '../shared/operation-sounds';
import {createFirstEntryMotion} from '../shared/first-entry-motion';
import {useGuideSession} from '../features/onboarding/useGuideSession';
import {CompletionCelebration} from '../features/notices/CompletionCelebration';

const ShareImageDialog=lazy(()=>import('../features/sharing/ShareImageDialog'));
const NoticeQuestionDialog=lazy(()=>import('../features/questions/NoticeQuestionDialog'));

const nav=[{label:'通知',icon:<Inbox/>},{label:'添加',icon:<AddCircleOutline/>},{label:'设置',icon:<SettingsOutlined/>}];
export default function App(){
 useEffect(installOperationSounds,[]);
 const verification=useHumanVerification();const app=useCampus({onHumanVerification:verification.verify});const wide=useMediaQuery('(min-width:960px), (min-width:600px) and (max-height:500px)');const split=useMediaQuery('(min-width:960px)');const systemDark=useMediaQuery('(prefers-color-scheme:dark)');
 const exampleRequest=useRef(new URLSearchParams(location.search).get('examples')==='1'),exampleStarted=useRef(false);
 const [page,setPage]=useState(0);const [login,setLogin]=useState(false);const [help,setHelp]=useState(false);
 const [launchStage,setLaunchStage]=useState<'intro'|'leaving'|'entry'|'idle'>(()=>{try{return localStorage.getItem('campus-inbox:tutorial:v2')!=='seen'?'intro':'idle';}catch{return 'intro';}});
 const [tutorialRequired,setTutorialRequired]=useState(()=>launchStage==='intro');
 const [practiceNudge,setPracticeNudge]=useState(false);
 const [developerUnlocked,setDeveloperUnlocked]=useState(()=>{try{return localStorage.getItem('campus-inbox:developer:v1')==='enabled';}catch{return false;}});
 function unlockDeveloper(){try{localStorage.setItem('campus-inbox:developer:v1','enabled');}catch{}setDeveloperUnlocked(true);app.tell('开发者设置已开启');}
 const guide=useGuideSession(app,help||launchStage!=='idle'),viewApp=guide.controller;
 const [guideStep,setGuideStep]=useState(0);
 const [downloadsOpen,setDownloadsOpen]=useState(false);
 const firstEntry=useRef<ReturnType<typeof createFirstEntryMotion>|null>(null);
 const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 // The page is concealed behind the introduction. Its single entrance finishes
 // before the dimmer appears; changing guide pages never replays the entrance.
 useLayoutEffect(()=>{
  if(launchStage!=='entry')return;
  let active=true,pause:ReturnType<typeof setTimeout>|undefined;
  playOperationSound('welcome');
  const stop=firstEntry.current?.play(document,reducedMotion,()=>{
   if(active)pause=setTimeout(()=>{if(active){setLaunchStage('idle');setHelp(true);}},reducedMotion?0:650);
  });
  return()=>{active=false;if(pause)clearTimeout(pause);stop?.();};
 },[launchStage,reducedMotion]);
 const [celebration,setCelebration]=useState<{x:number;y:number;key:number}|null>(null),celebrationTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 function clearCelebration(){if(celebrationTimer.current)clearTimeout(celebrationTimer.current);celebrationTimer.current=null;setCelebration(null);}
 function completionChanged(_id:string,anchor?:HTMLElement){const bounds=anchor?.getBoundingClientRect();if(!bounds)return;clearCelebration();setCelebration({x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2,key:performance.now()});celebrationTimer.current=setTimeout(clearCelebration,reducedMotion?850:1700);}
 useEffect(()=>()=>{if(celebrationTimer.current)clearTimeout(celebrationTimer.current);},[]);
 const [about,setAbout]=useState(false);const [note,setNote]=useState<NoteEditor|null>(null);const [details,setDetails]=useState<string|null>(null);const [calendar,setCalendar]=useState<CalendarSelection|null>(null);const [focusID,setFocusID]=useState<string|null>(null);
 const [settingsDialog,setSettingsDialog]=useState(false);
 const [expandCampus,setExpandCampus]=useState(false);
 const [share,setShare]=useState<Notice|null>(null);
 const [questionID,setQuestionID]=useState<string|null>(null);
 const [sourcePath,setSourcePath]=useState<string|undefined>(),[correction,setCorrection]=useState<CorrectionSelection|null>(null);
 const [feedView,setFeedView]=useState(createFeedViewState);
 const guideSaved=useRef<{page:number;view:ReturnType<typeof createFeedViewState>;focus:string|null;scroll:number}|null>(null);
 useLayoutEffect(()=>{if(!help)return;guideSaved.current??={page,view:feedView,focus:focusID,scroll:window.scrollY};setGuideStep(0);setPage(1);setFeedView(createFeedViewState());setFocusID(null);},[help]);
 useEffect(()=>{if(help&&guide.state.notice){setPage(0);if(guide.state.notice.completed)setFeedView(previous=>({...previous,tab:2}));}},[help,guide.state.notice]);
 const guideProgress={pasted:guide.state.filled,generated:!!guide.state.notice,reviewed:!!guide.state.notice?.tasks[0]&&feedView.expandedTaskIDs.has(guide.state.notice.tasks[0].id),completed:!!guide.state.notice?.completed};
 function changeGuideStep(next:number){if(next<3&&guide.state.notice?.completed){guide.session.rewindCompletion();clearCelebration();setFeedView(previous=>({...previous,tab:0}));}setGuideStep(next);setPage(next===0||next===1&&!guide.state.notice?1:0);}
 const consumeFocus=useCallback((id:string)=>setFocusID(value=>value===id?null:value),[]);
 // The introduction stays light. Tutorial time (or a settled returning visit)
 // warms the catalog without importing notices, changing progress or showing a toast.
 useEffect(()=>{if(app.bootError||launchStage!=='idle')return;
  const timer=setTimeout(()=>{void app.prefetchExamples().catch(()=>{/* The show button can retry. */});},help?0:1800);
  return()=>clearTimeout(timer);
 },[help,launchStage,app.bootError,app.prefetchExamples]);
 useEffect(()=>{if(!exampleRequest.current||exampleStarted.current||app.bootError||help||launchStage!=='idle'||tutorialRequired)return;exampleStarted.current=true;void app.loadExamples().catch(app.report);},[app.bootError,help,launchStage,tutorialRequired]);
 useEffect(()=>{if(app.latestAddedID&&!help){setPage(0);setFocusID(app.latestAddedID);}},[app.latestAddedID]);
 const dark=app.theme==='system'?(app.capabilities?.theme?.dark??systemDark):app.theme==='dark';const theme=makeTheme(dark,app.capabilities?.theme??null);
 useEffect(()=>{document.documentElement.dataset.platform=app.platform.kind;document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.palette.background.default);if(app.platform.setAppearance)void app.platform.setAppearance(dark).catch(app.report);},[app.platform,dark]);
 const modalRef=useRef(false);modalRef.current=login||help||launchStage!=='idle'||about||downloadsOpen||!!note||!!details||!!calendar||!!correction||!!share||!!questionID||settingsDialog||!!verification.request;
 const lastNotices=useRef(app.notices);
 const unreadReminders=app.notices.filter(n=>app.unreadNoticeIDs.includes(n.id)&&getNoticeStatus(n)==='reminder');
 function clearNewReminders(){app.clearUnreadNotices(unreadReminders.map(n=>n.id));}
 function viewNewReminders(){const first=unreadReminders[0];if(!first)return;setPage(0);setFocusID(first.id);app.markNoticeRead(first.id);}
 function leaveGuide(restore=true){setHelp(false);setLaunchStage('idle');clearCelebration();guide.session.dispose();const saved=guideSaved.current;guideSaved.current=null;if(saved&&restore){setPage(saved.page);setFeedView(saved.view);setFocusID(saved.focus);requestAnimationFrame(()=>window.scrollTo({top:saved.scroll,behavior:'instant'}));}try{localStorage.setItem('campus-inbox:tutorial:v2','seen');}catch{/* Closing the guide stays available when storage is restricted. */}}
 function closeHelp(){if(!tutorialRequired)leaveGuide();}
 function finishHelp(){
  const kept=tutorialRequired&&guide.state.notice?app.keepGuidePractice(guide.state.notice):null;
  setTutorialRequired(false);leaveGuide(!kept);
  if(kept){app.setModelTestMode(false);setPage(0);setFocusID(null);setFeedView({...createFeedViewState(),tab:2,expandedIDs:new Set()});setPracticeNudge(true);window.scrollTo({top:0,behavior:'instant'});}
 }
 function navigate(next:number){if(next===2)setExpandCampus(false);setPage(next);if(split&&next===1){setTimeout(()=>{document.getElementById('compose-pane')?.scrollIntoView({block:'start',behavior:'smooth'});document.querySelector<HTMLTextAreaElement>('#compose-pane textarea')?.focus({preventScroll:true});},0);}else window.scrollTo({top:0,behavior:'instant'});}
 function openCampusSettings(){navigate(2);setExpandCampus(true);}
 function startWelcome(){if(app.bootError){setLaunchStage('idle');return;}guideSaved.current??={page,view:feedView,focus:focusID,scroll:window.scrollY};setPage(1);setFeedView(createFeedViewState());setFocusID(null);try{firstEntry.current=createFirstEntryMotion(localStorage,{force:true});}catch{firstEntry.current=createFirstEntryMotion(null,{force:true});}setLaunchStage('leaving');}
 function showWelcome(){setAbout(false);setLaunchStage('intro');}
 const actions:NoticeActions={completionChanged,note:(notice,target,title,text)=>setNote({noticeID:notice.id,target,title,text}),details:n=>{setSourcePath(undefined);setDetails(n.id);},calendar:(notice,task)=>{if(app.platform.kind==='android')setCalendar({notice,task});},evidence:(notice,path)=>{setSourcePath(path);setDetails(notice.id);},correct:(notice,path)=>{setDetails(null);setCorrection({noticeID:notice.id,path});},share:notice=>setShare({...notice,corrections:undefined}),question:notice=>setQuestionID(notice.id)};
 useEffect(()=>{
  const receive=()=>{if(modalRef.current||app.busy||document.querySelector('[role=\"dialog\"]'))return;void app.receiveShare().then(received=>{if(received)navigate(1);}).catch(app.report);};
  const openNotice=()=>{void app.platform.getOpenedNotice().then(id=>{if(id){setPage(0);setFocusID(id);}}).catch(app.report);};
  const offShare=app.platform.onShare(receive);const offNotice=app.platform.onOpenNotice(openNotice);receive();openNotice();return()=>{offShare();offNotice();};
 },[app.platform,app.busy,login,help,about,note,details,calendar,settingsDialog,share]);
 useEffect(()=>app.platform.onBack(()=>{
  if(help){closeHelp();return true;}
  const dialog=Array.from(document.querySelectorAll('[role="dialog"]')).at(-1);
  if(dialog){dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));return true;}
  if(correction){setCorrection(null);return true;}
  if(launchStage==='intro'){if(!tutorialRequired)setLaunchStage('idle');return true;}if(launchStage==='entry'||launchStage==='leaving')return true;
  if(page!==0){navigate(0);return true;}return false;
 }),[app.platform,page,correction,launchStage,help,tutorialRequired]);
 useEffect(()=>{if(details&&!app.notices.some(n=>n.id===details))setDetails(null);},[app.notices,details]);
 useEffect(()=>{if(correction&&!app.notices.some(n=>n.id===correction.noticeID))setCorrection(null);},[app.notices,correction]);
 useEffect(()=>{if(questionID&&!app.notices.some(n=>n.id===questionID))setQuestionID(null);},[app.notices,questionID]);
 useEffect(()=>{const current=new Map(app.notices.map(n=>[n.id,n]));
  for(const previous of lastNotices.current){const n=current.get(previous.id);if(!n||getNoticeStatus(previous)==='pending'&&getNoticeStatus(n)!=='pending')void app.platform.cancelReminder(previous.id).catch(app.report);}
  lastNotices.current=app.notices;
 },[app.notices,app.platform]);
 async function rescue(){const raw:Object=Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('campus-inbox:notices')).map(k=>[k,localStorage.getItem(k)]));await app.platform.saveFile(new Blob([JSON.stringify(raw,null,2)],{type:'application/json'}),'campus-inbox-original-data.json');}
 return <ThemeProvider theme={theme}><CssBaseline/>
  <Box data-first-entry-shell data-guide-shell inert={launchStage==='entry'||undefined} aria-hidden={launchStage==='intro'||launchStage==='leaving'||undefined} sx={{minHeight:'100dvh',visibility:launchStage==='intro'||launchStage==='leaving'?'hidden':'visible','& main':help?{pb:'calc(80px + var(--guide-bottom-space, 230px))!important'}:undefined,'& .workspace-pane':help?{pb:'var(--guide-bottom-space, 230px)'}:undefined}}>
  <AppBar data-first-entry="masthead" position="sticky" color="inherit" elevation={0} sx={{borderBottom:'1px solid',borderColor:'divider',pt:'var(--safe-top)',bgcolor:'background.default'}}>
   <Toolbar sx={{maxWidth:1240,width:'100%',mx:'auto',gap:{xs:.5,sm:1},minHeight:{xs:56,sm:64},px:{xs:1.5,sm:3}}}>
    <Tooltip title="了解拾笺 Inbox"><Button aria-label="关于拾笺 Inbox" onClick={()=>setAbout(true)} endIcon={<InfoOutlined sx={{fontSize:16,color:'text.secondary'}}/>} sx={{px:.5,minWidth:0,color:'text.primary',gap:.75,whiteSpace:'nowrap','& .MuiButton-endIcon':{ml:0}}}><Box component="img" src="./icon.svg" width={32} height={32} alt=""/><Typography sx={{fontWeight:700,fontSize:'1.125rem',lineHeight:1.4}}>拾笺 Inbox</Typography></Button></Tooltip>
    <Box sx={{flex:1}}/>
    {wide&&nav.map((item,i)=>split?i===1?null:<Button key={item.label} variant={(i===0?page!==2:page===2)?'contained':'text'} onClick={()=>navigate(i)} sx={{px:2}}>{item.label}</Button>:<Tooltip key={item.label} title={item.label}><IconButton aria-label={item.label} onClick={()=>navigate(i)} sx={{color:page===i?'primary.main':'text.secondary',bgcolor:page===i?'action.selected':undefined}}>{item.icon}</IconButton></Tooltip>)}
    <Tooltip title="重新查看教程"><Button aria-label="重看教程" onClick={showWelcome} sx={{minWidth:58,px:.5,py:.5,flexDirection:'column',gap:.25,color:'text.secondary',lineHeight:1.2}}><HelpOutline sx={{fontSize:24}}/><Typography component="span" sx={{fontSize:11,lineHeight:1.2}}>重看教程</Typography></Button></Tooltip>
   </Toolbar>
  </AppBar>
  <Container maxWidth={false} component="main" sx={{maxWidth:split&&page!==2?1240:900,px:{xs:1,sm:3},pt:{xs:1.5,sm:3},pb:split&&page!==2?0:wide?3:'calc(80px + var(--safe-bottom))',...(split&&page!==2?{display:'flex',flexDirection:'column',height:'calc(100dvh - 77px - var(--safe-top))',minHeight:0,'@media (max-height:500px)':{height:'calc(100dvh - 61px - var(--safe-top))'}}:{})}}>
   {!help&&launchStage==='idle'&&<AnalysisJobStatus app={app} onRestore={()=>navigate(1)}/>}
   {!help&&launchStage==='idle'&&!!unreadReminders.length&&<Alert className="new-reminders-prompt" severity="info" role="status" action={<Stack direction="row" sx={{alignItems:'center',gap:.25}}><Button onClick={viewNewReminders} sx={{whiteSpace:'nowrap'}}>查看</Button><IconButton aria-label="清除未读提醒" onClick={clearNewReminders} sx={{width:40,height:40}}><Close fontSize="small"/></IconButton></Stack>} sx={{mb:2,flexShrink:0}}>未读提醒 {unreadReminders.length}</Alert>}
   {app.bootError?<Alert severity="error" action={<Button onClick={()=>void rescue().catch(app.report)}>保存原始数据</Button>}>原来的通知无法读取：{app.bootError}。数据仍在本机，暂未覆盖。</Alert>:
    split&&page!==2?<Box className="workspace" sx={{display:'grid',gridTemplateColumns:'minmax(280px, 320px) minmax(0, 1fr)',gap:3,flex:1,minHeight:160}}>
     <ScrollPane id="compose-pane" label="添加" onFocus={()=>setPage(1)}><ComposerPage app={viewApp} embedded onDone={()=>setPage(0)} onLogin={()=>setLogin(true)}/></ScrollPane>
     <ScrollPane id="feed-pane" label="已保存通知" onFocus={()=>setPage(0)}><FeedPage sampleNudge={!help&&practiceNudge} onSamplesOpened={()=>setPracticeNudge(false)} onDownload={()=>setDownloadsOpen(true)} app={viewApp} embedded actions={actions} onCompose={()=>navigate(1)} onSettings={openCampusSettings} focusID={help?null:focusID} onFocusHandled={consumeFocus} viewState={feedView} onViewStateChange={setFeedView} editingID={correction?.noticeID} onEditingClose={()=>setCorrection(null)}/></ScrollPane>
    </Box>:
    page===0?<FeedPage sampleNudge={!help&&practiceNudge} onSamplesOpened={()=>setPracticeNudge(false)} onDownload={()=>setDownloadsOpen(true)} app={viewApp} actions={actions} onCompose={()=>navigate(1)} onSettings={openCampusSettings} focusID={help?null:focusID} onFocusHandled={consumeFocus} viewState={feedView} onViewStateChange={setFeedView} editingID={correction?.noticeID} onEditingClose={()=>setCorrection(null)}/>:
    page===1?<ComposerPage app={viewApp} onDone={()=>navigate(0)} onLogin={()=>setLogin(true)}/>:
    <SettingsPage developerEnabled={developerUnlocked} app={app} onLogin={()=>setLogin(true)} onHelp={showWelcome} onAbout={()=>setAbout(true)} onDialogChange={setSettingsDialog} expandCampus={expandCampus} onFilterNotices={enabled=>{setFeedView(previous=>({...previous,tab:0,query:'',favoritesOnly:false,relevantOnly:enabled}));navigate(0);}} onShowNotices={()=>{setFeedView(createFeedViewState());setFocusID(null);navigate(0);}}/>}
  </Container>
  {!wide&&<Paper data-first-entry="home-nav" sx={{position:'fixed',bottom:0,left:0,right:0,borderTop:'1px solid',borderColor:'divider',pb:'var(--safe-bottom)',zIndex:10}}>
   <BottomNavigation value={page} onChange={(_,value)=>navigate(value)} showLabels sx={{bgcolor:'background.paper',height:64,alignItems:'center',px:1,gap:1,'& .MuiBottomNavigationAction-root':{minWidth:0,maxWidth:180,height:48,borderRadius:6,color:'text.secondary',transition:'background-color 180ms ease, color 180ms ease, transform 240ms cubic-bezier(.22,1,.36,1)','&:active':{bgcolor:'action.selected',transform:'scale(.97)'},'&:hover:not(.Mui-selected)':{bgcolor:'transparent'},'&.Mui-focusVisible':{outline:'2px solid',outlineColor:'primary.main',outlineOffset:-2}},'& .MuiBottomNavigationAction-root.Mui-selected':{color:'primary.main',bgcolor:'action.selected'},'& .MuiBottomNavigationAction-label':{fontSize:'1rem',fontWeight:600},'& .MuiBottomNavigationAction-label.Mui-selected':{fontSize:'1rem'}}}>{nav.map(item=><BottomNavigationAction disableRipple key={item.label} label={item.label}/>)}</BottomNavigation>
  </Paper>}
  </Box>
  <NoteDialog editor={note} app={app} onClose={()=>setNote(null)}/>
  <SearchQueryContext.Provider value={feedView.query}><DetailDialog notice={app.notices.find(n=>n.id===details)??null} path={sourcePath} app={app} onCorrect={actions.correct} onClose={()=>setDetails(null)}/></SearchQueryContext.Provider>
  <CorrectionDialog notice={correction?.path?app.notices.find(n=>n.id===correction.noticeID)??null:null} path={correction?.path} app={app} onClose={()=>setCorrection(value=>value?{noticeID:value.noticeID}:null)}/>
  <CalendarDialog selection={calendar} app={app} onClose={()=>setCalendar(null)}/>
  {share&&<Suspense fallback={null}><ShareImageDialog notice={share} app={app} onClose={()=>setShare(null)}/></Suspense>}
  {questionID&&<Suspense fallback={null}><NoticeQuestionDialog notice={app.notices.find(n=>n.id===questionID)??null} app={app} onClose={()=>setQuestionID(null)} onLogin={()=>setLogin(true)}/></Suspense>}
  <LoginDialog open={login} app={app} onClose={()=>setLogin(false)}/>
  <HumanVerificationDialog request={verification.request} onComplete={verification.complete} onCancel={()=>{app.cancel();verification.cancel();}}/>
  <HelpDialog dismissible={!tutorialRequired} open={help} onClose={closeHelp} step={guideStep} onStep={changeGuideStep} progress={guideProgress} expanded={!!guide.state.notice&&feedView.expandedIDs.has(guide.state.notice.id)} onFinished={finishHelp}/><AboutDialog dismissible={!tutorialRequired} onDeveloperUnlock={unlockDeveloper} open={about||launchStage==='intro'} introduction={launchStage==='intro'||launchStage==='leaving'} onStart={startWelcome} onExited={()=>{if(launchStage==='leaving')setLaunchStage('entry');}} onClose={()=>{setAbout(false);if(launchStage==='intro')setLaunchStage('idle');}}/>
  <Dialog open={downloadsOpen} onClose={()=>setDownloadsOpen(false)} maxWidth="xs" fullWidth><DialogTitle>安卓手机版</DialogTitle><DialogContent><AndroidDownloads compact/></DialogContent><DialogActions><Button onClick={()=>setDownloadsOpen(false)}>关闭</Button></DialogActions></Dialog>
  <Snackbar open={!!app.toast} key={app.toast?.id} autoHideDuration={6500} onClose={(_,reason)=>{if(reason!=='clickaway')app.setToast(null);}} message={app.toast?.text} action={app.toast?.undo?<Button color="inherit" onClick={()=>{const undo=app.toast?.undo;app.setToast(null);undo?.();}}>撤销</Button>:undefined} anchorOrigin={{vertical:'bottom',horizontal:'center'}} sx={{bottom:wide?24:84}}/>
  <Snackbar open={!!app.error} onClose={()=>app.setError('')} anchorOrigin={{vertical:'top',horizontal:'center'}}><Alert severity="error" onClose={()=>app.setError('')} variant="filled" sx={{maxWidth:560}}>{app.error}</Alert></Snackbar>
  {celebration&&<CompletionCelebration point={celebration} reducedMotion={reducedMotion}/>}
 </ThemeProvider>;
}
