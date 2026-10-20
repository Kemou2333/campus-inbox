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
import {installOperationSounds} from '../shared/operation-sounds';
import {createFirstEntryMotion} from '../shared/first-entry-motion';

const ShareImageDialog=lazy(()=>import('../features/sharing/ShareImageDialog'));
const NoticeQuestionDialog=lazy(()=>import('../features/questions/NoticeQuestionDialog'));

const nav=[{label:'通知',icon:<Inbox/>},{label:'添加',icon:<AddCircleOutline/>},{label:'设置',icon:<SettingsOutlined/>}];
export default function App(){
 useEffect(installOperationSounds,[]);
 const verification=useHumanVerification();const app=useCampus({onHumanVerification:verification.verify});const wide=useMediaQuery('(min-width:960px), (min-width:600px) and (max-height:500px)');const split=useMediaQuery('(min-width:960px)');const systemDark=useMediaQuery('(prefers-color-scheme:dark)');
 const exampleRequest=useRef(new URLSearchParams(location.search).get('examples')==='1'),exampleStarted=useRef(false);
 const [page,setPage]=useState(0);const [login,setLogin]=useState(false);const [help,setHelp]=useState(()=>{try{return localStorage.getItem('campus-inbox:tutorial:v2')!=='seen';}catch{return true;}});
 const [downloadsOpen,setDownloadsOpen]=useState(false),[downloadHint,setDownloadHint]=useState(false);
 const [firstEntry]=useState(()=>{try{return createFirstEntryMotion(localStorage);}catch{return createFirstEntryMotion(null);}});
 const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
 const [entryReady,setEntryReady]=useState(()=>!firstEntry.pending);
 const cancelEntry=useRef<(()=>void)|null>(null);
 // Prepare transparent module frames before the tutorial's backdrop can uncover them.
 useLayoutEffect(()=>{if(help||app.bootError)return;let active=true;const stop=firstEntry.play(document,reducedMotion,()=>{if(active)setEntryReady(true);});cancelEntry.current=stop;return()=>{active=false;stop();if(cancelEntry.current===stop)cancelEntry.current=null;};},[firstEntry,help,page,split,reducedMotion,app.bootError]);
 function finishEntry(){if(!entryReady)cancelEntry.current?.();}
 const [about,setAbout]=useState(false);const [note,setNote]=useState<NoteEditor|null>(null);const [details,setDetails]=useState<string|null>(null);const [calendar,setCalendar]=useState<CalendarSelection|null>(null);const [focusID,setFocusID]=useState<string|null>(null);
 const [settingsDialog,setSettingsDialog]=useState(false);
 const [expandCampus,setExpandCampus]=useState(false);
 const [share,setShare]=useState<Notice|null>(null);
 const [questionID,setQuestionID]=useState<string|null>(null);
 const [sourcePath,setSourcePath]=useState<string|undefined>(),[correction,setCorrection]=useState<CorrectionSelection|null>(null);
 const [feedView,setFeedView]=useState(createFeedViewState);
 const consumeFocus=useCallback((id:string)=>setFocusID(value=>value===id?null:value),[]);
 useEffect(()=>{if(!exampleRequest.current||exampleStarted.current||app.bootError)return;exampleStarted.current=true;void app.loadExamples().catch(app.report);},[app.bootError]);
 useEffect(()=>{if(app.latestAddedID){setPage(0);setFocusID(app.latestAddedID);}},[app.latestAddedID]);
 const dark=app.theme==='system'?(app.capabilities?.theme?.dark??systemDark):app.theme==='dark';const theme=makeTheme(dark,app.capabilities?.theme??null);
 useEffect(()=>{document.documentElement.dataset.platform=app.platform.kind;document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.palette.background.default);if(app.platform.setAppearance)void app.platform.setAppearance(dark).catch(app.report);},[app.platform,dark]);
 const modalRef=useRef(false);modalRef.current=login||help||about||downloadsOpen||!!note||!!details||!!calendar||!!correction||!!share||!!questionID||settingsDialog||!!verification.request;
 const lastNotices=useRef(app.notices);
 const unreadReminders=app.notices.filter(n=>app.unreadNoticeIDs.includes(n.id)&&getNoticeStatus(n)==='reminder');
 function clearNewReminders(){app.clearUnreadNotices(unreadReminders.map(n=>n.id));}
 function viewNewReminders(){const first=unreadReminders[0];if(!first)return;setPage(0);setFocusID(first.id);app.markNoticeRead(first.id);}
 function closeHelp(){setHelp(false);try{localStorage.setItem('campus-inbox:tutorial:v2','seen');}catch{/* Closing the guide stays available when storage is restricted. */}}
 function navigate(next:number){if(next===2)setExpandCampus(false);setPage(next);if(split&&next===1){setTimeout(()=>{document.getElementById('compose-pane')?.scrollIntoView({block:'start',behavior:'smooth'});document.querySelector<HTMLTextAreaElement>('#compose-pane textarea')?.focus({preventScroll:true});},0);}else window.scrollTo({top:0,behavior:'instant'});}
 function openCampusSettings(){navigate(2);setExpandCampus(true);}
 const actions:NoticeActions={note:(notice,target,title,text)=>setNote({noticeID:notice.id,target,title,text}),details:n=>{setSourcePath(undefined);setDetails(n.id);},calendar:(notice,task)=>setCalendar({notice,task}),evidence:(notice,path)=>{setSourcePath(path);setDetails(notice.id);},correct:(notice,path)=>{setDetails(null);setCorrection({noticeID:notice.id,path});},share:notice=>setShare({...notice,corrections:undefined}),question:notice=>setQuestionID(notice.id)};
 useEffect(()=>{
  const receive=()=>{if(modalRef.current||app.busy||document.querySelector('[role=\"dialog\"]'))return;void app.receiveShare().then(received=>{if(received)navigate(1);}).catch(app.report);};
  const openNotice=()=>{void app.platform.getOpenedNotice().then(id=>{if(id){setPage(0);setFocusID(id);}}).catch(app.report);};
  const offShare=app.platform.onShare(receive);const offNotice=app.platform.onOpenNotice(openNotice);receive();openNotice();return()=>{offShare();offNotice();};
 },[app.platform,app.busy,login,help,about,note,details,calendar,settingsDialog,share]);
 useEffect(()=>app.platform.onBack(()=>{
  const dialog=Array.from(document.querySelectorAll('[role="dialog"]')).at(-1);
  if(dialog){dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));return true;}
  if(correction){setCorrection(null);return true;}
  if(page!==0){navigate(0);return true;}return false;
 }),[app.platform,page,correction]);
 useEffect(()=>{if(details&&!app.notices.some(n=>n.id===details))setDetails(null);},[app.notices,details]);
 useEffect(()=>{if(correction&&!app.notices.some(n=>n.id===correction.noticeID))setCorrection(null);},[app.notices,correction]);
 useEffect(()=>{if(questionID&&!app.notices.some(n=>n.id===questionID))setQuestionID(null);},[app.notices,questionID]);
 useEffect(()=>{const current=new Map(app.notices.map(n=>[n.id,n]));
  for(const previous of lastNotices.current){const n=current.get(previous.id);if(!n||getNoticeStatus(previous)==='pending'&&getNoticeStatus(n)!=='pending')void app.platform.cancelReminder(previous.id).catch(app.report);}
  lastNotices.current=app.notices;
 },[app.notices,app.platform]);
 async function rescue(){const raw:Object=Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('campus-inbox:notices')).map(k=>[k,localStorage.getItem(k)]));await app.platform.saveFile(new Blob([JSON.stringify(raw,null,2)],{type:'application/json'}),'campus-inbox-original-data.json');}
 return <ThemeProvider theme={theme}><CssBaseline/>
  <Box data-first-entry-shell inert={help} aria-hidden={help||undefined} onPointerDownCapture={finishEntry} onKeyDownCapture={finishEntry} sx={{visibility:help?'hidden':undefined,minHeight:'100dvh'}}>
  <AppBar data-first-entry="masthead" position="sticky" color="inherit" elevation={0} sx={{borderBottom:'1px solid',borderColor:'divider',pt:'var(--safe-top)',bgcolor:'background.default'}}>
   <Toolbar sx={{maxWidth:1240,width:'100%',mx:'auto',gap:{xs:.5,sm:1},minHeight:{xs:56,sm:64},px:{xs:1.5,sm:3}}}>
    <Tooltip title="了解校园 Inbox"><Button aria-label="关于校园 Inbox" onClick={()=>setAbout(true)} endIcon={<InfoOutlined sx={{fontSize:16,color:'text.secondary'}}/>} sx={{px:.5,minWidth:0,color:'text.primary',gap:.75,whiteSpace:'nowrap','& .MuiButton-endIcon':{ml:0}}}><Box component="img" src="./icon.svg" width={32} height={32} alt=""/><Typography sx={{fontWeight:700,fontSize:'1.125rem',lineHeight:1.4}}>校园 Inbox</Typography></Button></Tooltip>
    <Box sx={{flex:1}}/>
    {wide&&nav.map((item,i)=>split?i===1?null:<Button key={item.label} variant={(i===0?page!==2:page===2)?'contained':'text'} onClick={()=>navigate(i)} sx={{px:2}}>{item.label}</Button>:<Tooltip key={item.label} title={item.label}><IconButton aria-label={item.label} onClick={()=>navigate(i)} sx={{color:page===i?'primary.main':'text.secondary',bgcolor:page===i?'action.selected':undefined}}>{item.icon}</IconButton></Tooltip>)}
    {app.platform.kind!=='android'&&<Tooltip title="下载安卓版">{wide?<Button size="small" startIcon={<DownloadOutlined/>} onClick={()=>setDownloadsOpen(true)}>安卓版</Button>:<IconButton aria-label="安卓下载" onClick={()=>setDownloadsOpen(true)} sx={{color:'primary.main',width:44,height:44}}><DownloadOutlined/></IconButton>}</Tooltip>}
    <Tooltip title={app.sync.connected?'账号与同步':'登录并同步'}><Button size="small" variant="outlined" aria-label={app.sync.connected?'查看同步状态':'登录与同步'} onClick={()=>app.sync.connected?navigate(2):setLogin(true)} sx={{minWidth:{xs:48,sm:64},px:{xs:1,sm:1.5}}}><Box component="span" sx={{maxWidth:wide?120:64,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{app.sync.connected?'同步':'登录'}</Box></Button></Tooltip>
    <Tooltip title="使用帮助"><IconButton aria-label="使用帮助" onClick={()=>setHelp(true)} sx={{width:44,height:44}}><HelpOutline/></IconButton></Tooltip>
   </Toolbar>
  </AppBar>
  <Container maxWidth={false} component="main" sx={{maxWidth:split&&page!==2?1240:900,px:{xs:1,sm:3},pt:{xs:1.5,sm:3},pb:split&&page!==2?0:wide?3:'calc(80px + var(--safe-bottom))',...(split&&page!==2?{display:'flex',flexDirection:'column',height:'calc(100dvh - 77px - var(--safe-top))',minHeight:0,'@media (max-height:500px)':{height:'calc(100dvh - 61px - var(--safe-top))'}}:{})}}>
   <AnalysisJobStatus app={app} onRestore={()=>navigate(1)}/>
   {!!unreadReminders.length&&<Alert className="new-reminders-prompt" severity="info" role="status" action={<Stack direction="row" sx={{alignItems:'center',gap:.25}}><Button onClick={viewNewReminders} sx={{whiteSpace:'nowrap'}}>查看</Button><IconButton aria-label="清除未读提醒" onClick={clearNewReminders} sx={{width:40,height:40}}><Close fontSize="small"/></IconButton></Stack>} sx={{mb:2,flexShrink:0}}>未读提醒 {unreadReminders.length}</Alert>}
   {app.bootError?<Alert severity="error" action={<Button onClick={()=>void rescue().catch(app.report)}>保存原始数据</Button>}>原来的通知无法读取：{app.bootError}。数据仍在本机，暂未覆盖。</Alert>:
    split&&page!==2?<Box className="workspace" sx={{display:'grid',gridTemplateColumns:'minmax(280px, 320px) minmax(0, 1fr)',gap:3,flex:1,minHeight:160}}>
     <ScrollPane id="compose-pane" label="添加" onFocus={()=>setPage(1)}><ComposerPage app={app} embedded onDone={()=>setPage(0)} onLogin={()=>setLogin(true)}/></ScrollPane>
     <ScrollPane id="feed-pane" label="已保存通知" onFocus={()=>setPage(0)}><FeedPage app={app} embedded actions={actions} onCompose={()=>navigate(1)} onSettings={openCampusSettings} focusID={focusID} onFocusHandled={consumeFocus} viewState={feedView} onViewStateChange={setFeedView} editingID={correction?.noticeID} onEditingClose={()=>setCorrection(null)}/></ScrollPane>
    </Box>:
    page===0?<FeedPage app={app} actions={actions} onCompose={()=>navigate(1)} onSettings={openCampusSettings} focusID={focusID} onFocusHandled={consumeFocus} viewState={feedView} onViewStateChange={setFeedView} editingID={correction?.noticeID} onEditingClose={()=>setCorrection(null)}/>:
    page===1?<ComposerPage app={app} onDone={()=>navigate(0)} onLogin={()=>setLogin(true)}/>:
    <SettingsPage app={app} onLogin={()=>setLogin(true)} onHelp={()=>setHelp(true)} onAbout={()=>setAbout(true)} onDialogChange={setSettingsDialog} expandCampus={expandCampus} onFilterNotices={enabled=>{setFeedView(previous=>({...previous,tab:0,query:'',favoritesOnly:false,relevantOnly:enabled}));navigate(0);}} onShowNotices={()=>{setFeedView(previous=>({...previous,tab:0,query:'',favoritesOnly:false,relevantOnly:false}));navigate(0);}}/>}
  </Container>
  {!wide&&<Paper data-first-entry="home-nav" sx={{position:'fixed',bottom:0,left:0,right:0,borderTop:'1px solid',borderColor:'divider',pb:'var(--safe-bottom)',zIndex:10}}>
   <BottomNavigation value={page} onChange={(_,value)=>navigate(value)} showLabels sx={{bgcolor:'background.paper',height:64,alignItems:'center',px:1,gap:1,'& .MuiBottomNavigationAction-root':{minWidth:0,maxWidth:180,height:48,borderRadius:6,color:'text.secondary'},'& .MuiBottomNavigationAction-root.Mui-selected':{color:'primary.main',bgcolor:'action.selected'},'& .MuiBottomNavigationAction-label':{fontSize:'1rem',fontWeight:600},'& .MuiBottomNavigationAction-label.Mui-selected':{fontSize:'1rem'}}}>{nav.map(item=><BottomNavigationAction key={item.label} label={item.label}/>)}</BottomNavigation>
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
  <HelpDialog open={help} onClose={closeHelp} onFinished={()=>{if(app.platform.kind!=='android')setDownloadHint(true);}} onCompose={()=>{closeHelp();navigate(1);}} onExamples={()=>app.loadExamples().then(()=>{closeHelp();navigate(0);}).catch(app.report)}/><AboutDialog open={about} onClose={()=>setAbout(false)}/>
  <Dialog open={downloadsOpen} onClose={()=>setDownloadsOpen(false)} maxWidth="xs" fullWidth><DialogTitle>安卓手机版</DialogTitle><DialogContent><AndroidDownloads compact/></DialogContent><DialogActions><Button onClick={()=>setDownloadsOpen(false)}>关闭</Button></DialogActions></Dialog>
  <Snackbar open={downloadHint&&!help&&entryReady} autoHideDuration={12000} onClose={()=>setDownloadHint(false)} message="手机上也能用" action={<Button color="inherit" onClick={()=>{setDownloadHint(false);setDownloadsOpen(true);}}>安卓下载</Button>} anchorOrigin={{vertical:'bottom',horizontal:'center'}} sx={{bottom:wide?24:84}}/>
  <Snackbar open={!!app.toast} key={app.toast?.id} autoHideDuration={6500} onClose={(_,reason)=>{if(reason!=='clickaway')app.setToast(null);}} message={app.toast?.text} action={app.toast?.undo?<Button color="inherit" onClick={()=>{const undo=app.toast?.undo;app.setToast(null);undo?.();}}>撤销</Button>:undefined} anchorOrigin={{vertical:'bottom',horizontal:'center'}} sx={{bottom:wide?24:84}}/>
  <Snackbar open={!!app.error} onClose={()=>app.setError('')} anchorOrigin={{vertical:'top',horizontal:'center'}}><Alert severity="error" onClose={()=>app.setError('')} variant="filled" sx={{maxWidth:560}}>{app.error}</Alert></Snackbar>
 </ThemeProvider>;
}
