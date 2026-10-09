import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,AppBar,BottomNavigation,BottomNavigationAction,Box,Button,CircularProgress,Container,CssBaseline,Divider,IconButton,Paper,Snackbar,Stack,Toolbar,Tooltip,Typography,useMediaQuery} from '@mui/material';
import {ThemeProvider} from '@mui/material/styles';
import Inbox from '@mui/icons-material/Inbox';
import AddCircleOutline from '@mui/icons-material/AddCircleOutlineOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import HelpOutline from '@mui/icons-material/HelpOutlineOutlined';
import {useCampus} from './useCampus';
import {makeTheme} from './theme';
import {FeedPage,createFeedViewState} from '../features/notices/FeedPage';
import {ComposerPage} from '../features/composer/ComposerPage';
import SettingsPage from '../features/settings/SettingsPage';
import LoginDialog from '../features/settings/LoginDialog';
import {NoteDialog,type NoteEditor} from '../features/notes/NoteDialog';
import {CalendarDialog,type CalendarSelection} from '../features/notices/CalendarDialog';
import {DetailDialog} from '../features/notices/DetailDialog';
import {AboutDialog,HelpDialog} from '../shared/ui/HelpDialog';
import type {NoticeActions} from '../features/notices/NoticeCard';
import {ScrollPane} from '../shared/ui/ScrollPane';
import {getNoticeStatus} from '../domain/notice';
import {useHumanVerification} from '../features/security/useHumanVerification';
import {HumanVerificationDialog} from '../features/security/HumanVerificationDialog';

const nav=[{label:'通知',icon:<Inbox/>},{label:'整理',icon:<AddCircleOutline/>},{label:'设置',icon:<SettingsOutlined/>}];
export default function App(){
 const verification=useHumanVerification();const app=useCampus({onHumanVerification:verification.verify});const wide=useMediaQuery('(min-width:960px), (min-width:600px) and (max-height:500px)');const split=useMediaQuery('(min-width:960px)');const systemDark=useMediaQuery('(prefers-color-scheme:dark)');
 const exampleRequest=useRef(new URLSearchParams(location.search).get('examples')==='1'),exampleStarted=useRef(false);
 const [page,setPage]=useState(0);const [login,setLogin]=useState(false);const [help,setHelp]=useState(()=>!exampleRequest.current&&localStorage.getItem('campus-inbox:tutorial:v2')!=='seen');
 const [about,setAbout]=useState(false);const [note,setNote]=useState<NoteEditor|null>(null);const [details,setDetails]=useState<string|null>(null);const [calendar,setCalendar]=useState<CalendarSelection|null>(null);const [focusID,setFocusID]=useState<string|null>(null);
 const [settingsDialog,setSettingsDialog]=useState(false);
 const [feedView,setFeedView]=useState(createFeedViewState);
 const consumeFocus=useCallback((id:string)=>setFocusID(value=>value===id?null:value),[]);
 useEffect(()=>{if(!exampleRequest.current||exampleStarted.current||app.bootError)return;exampleStarted.current=true;void app.loadExamples().catch(app.report);},[app.bootError]);
 useEffect(()=>{if(app.latestAddedID){setPage(0);setFocusID(app.latestAddedID);}},[app.latestAddedID]);
 const dark=app.theme==='system'?(app.capabilities?.theme?.dark??systemDark):app.theme==='dark';const theme=makeTheme(dark,app.capabilities?.theme??null);
 useEffect(()=>{document.documentElement.dataset.platform=app.platform.kind;document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.palette.background.default);if(app.platform.setAppearance)void app.platform.setAppearance(dark).catch(app.report);},[app.platform,dark]);
 const modalRef=useRef(false);modalRef.current=login||help||about||!!note||!!details||!!calendar||settingsDialog||!!verification.request;
 const lastNotices=useRef(app.notices);
 function closeHelp(){setHelp(false);localStorage.setItem('campus-inbox:tutorial:v2','seen');}
 function navigate(next:number){setPage(next);if(split&&next===1){setTimeout(()=>{document.getElementById('compose-pane')?.scrollIntoView({block:'start',behavior:'smooth'});document.querySelector<HTMLTextAreaElement>('#compose-pane textarea')?.focus({preventScroll:true});},0);}else window.scrollTo({top:0,behavior:'instant'});}
 const actions:NoticeActions={note:(notice,target,title,text)=>setNote({noticeID:notice.id,target,title,text}),details:n=>setDetails(n.id),calendar:(notice,task)=>setCalendar({notice,task})};
 useEffect(()=>{
  const receive=()=>{if(modalRef.current||app.busy||document.querySelector('[role=\"dialog\"]'))return;void app.receiveShare().then(received=>{if(received)navigate(1);}).catch(app.report);};
  const openNotice=()=>{void app.platform.getOpenedNotice().then(id=>{if(id){setPage(0);setFocusID(id);}}).catch(app.report);};
  const offShare=app.platform.onShare(receive);const offNotice=app.platform.onOpenNotice(openNotice);receive();openNotice();return()=>{offShare();offNotice();};
 },[app.platform,app.busy,login,help,about,note,details,calendar,settingsDialog]);
 useEffect(()=>app.platform.onBack(()=>{
  const dialog=Array.from(document.querySelectorAll('[role="dialog"]')).at(-1);
  if(dialog){dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));return true;}
  if(page!==0){navigate(0);return true;}return false;
 }),[app.platform,page]);
 useEffect(()=>{if(details&&!app.notices.some(n=>n.id===details))setDetails(null);},[app.notices,details]);
 useEffect(()=>{const current=new Map(app.notices.map(n=>[n.id,n]));
  for(const previous of lastNotices.current){const n=current.get(previous.id);if(!n||getNoticeStatus(previous)==='pending'&&getNoticeStatus(n)!=='pending')void app.platform.cancelReminder(previous.id).catch(app.report);}
  lastNotices.current=app.notices;
 },[app.notices,app.platform]);
 async function rescue(){const raw:Object=Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('campus-inbox:notices')).map(k=>[k,localStorage.getItem(k)]));await app.platform.saveFile(new Blob([JSON.stringify(raw,null,2)],{type:'application/json'}),'campus-inbox-original-data.json');}
 return <ThemeProvider theme={theme}><CssBaseline/>
  <AppBar position="sticky" color="inherit" elevation={0} sx={{borderBottom:'1px solid',borderColor:'divider',pt:'var(--safe-top)',bgcolor:'background.default'}}>
   <Toolbar sx={{maxWidth:1440,width:'100%',mx:'auto',gap:{xs:.5,sm:1},minHeight:{xs:56,sm:64},px:{xs:1.5,sm:3}}}>
    <Button onClick={()=>setAbout(true)} sx={{px:0,minWidth:0,color:'text.primary',gap:1.25}}><Box component="img" src="./icon.svg" width={32} height={32} alt=""/><Typography sx={{fontWeight:700,fontSize:'1.125rem',lineHeight:1.4}}>校园 Inbox</Typography></Button>
    <Box sx={{flex:1}}/>
    {wide&&nav.map((item,i)=>split?i===1?null:<Button key={item.label} variant={(i===0?page!==2:page===2)?'contained':'text'} onClick={()=>navigate(i)} sx={{px:2}}>{item.label}</Button>:<Tooltip key={item.label} title={item.label}><IconButton aria-label={item.label} onClick={()=>navigate(i)} sx={{color:page===i?'primary.main':'text.secondary',bgcolor:page===i?'action.selected':undefined}}>{item.icon}</IconButton></Tooltip>)}
    <Tooltip title={app.sync.connected?'账号与同步':'登录后可以使用 AI 并同步通知'}><Button size="small" variant="outlined" aria-label={app.sync.connected?'查看同步状态':'登录与同步'} onClick={()=>app.sync.connected?navigate(2):setLogin(true)} sx={{minWidth:64,px:1.5}}><Box component="span" sx={{maxWidth:wide?120:64,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{app.sync.connected?(wide&&app.username?app.username:'同步'):'登录'}</Box></Button></Tooltip>
    <Tooltip title="使用帮助"><IconButton aria-label="使用帮助" onClick={()=>setHelp(true)}><HelpOutline/></IconButton></Tooltip>
   </Toolbar>
  </AppBar>
  <Container maxWidth={false} component="main" sx={{maxWidth:split&&page!==2?1440:900,px:{xs:1,sm:3},pt:{xs:1.5,sm:3},pb:split&&page!==2?0:wide?3:'calc(80px + var(--safe-bottom))'}}>
   {app.bootError?<Alert severity="error" action={<Button onClick={()=>void rescue().catch(app.report)}>保存原始数据</Button>}>原来的通知无法读取：{app.bootError}。数据仍在本机，暂未覆盖。</Alert>:
    split&&page!==2?<Box className="workspace" sx={{display:'grid',gridTemplateColumns:'minmax(300px, 360px) minmax(0, 1fr)',gap:3,height:'calc(100dvh - 101px - var(--safe-top))',minHeight:160,'@media (max-height:500px)':{height:'calc(100dvh - 85px - var(--safe-top))'}}}>
     <ScrollPane id="compose-pane" label="新增通知" onFocus={()=>setPage(1)}><ComposerPage app={app} embedded onDone={()=>setPage(0)} onLogin={()=>setLogin(true)}/></ScrollPane>
     <ScrollPane id="feed-pane" label="已保存通知" onFocus={()=>setPage(0)}><FeedPage app={app} embedded actions={actions} onCompose={()=>navigate(1)} focusID={focusID} onFocusHandled={consumeFocus} viewState={feedView} onViewStateChange={setFeedView}/></ScrollPane>
    </Box>:
    page===0?<FeedPage app={app} actions={actions} onCompose={()=>navigate(1)} focusID={focusID} onFocusHandled={consumeFocus} viewState={feedView} onViewStateChange={setFeedView}/>:
    page===1?<ComposerPage app={app} onDone={()=>navigate(0)} onLogin={()=>setLogin(true)}/>:
    <SettingsPage app={app} onLogin={()=>setLogin(true)} onHelp={()=>setHelp(true)} onAbout={()=>setAbout(true)} onDialogChange={setSettingsDialog}/>}
  </Container>
  {!wide&&<Paper sx={{position:'fixed',bottom:0,left:0,right:0,borderTop:'1px solid',borderColor:'divider',pb:'var(--safe-bottom)',zIndex:10}}>
   <BottomNavigation value={page} onChange={(_,value)=>navigate(value)} showLabels sx={{bgcolor:'background.paper',height:64,alignItems:'center',px:1,gap:1,'& .MuiBottomNavigationAction-root':{minWidth:0,maxWidth:180,height:48,borderRadius:6,color:'text.secondary'},'& .MuiBottomNavigationAction-root.Mui-selected':{color:'primary.main',bgcolor:'action.selected'},'& .MuiBottomNavigationAction-label':{fontSize:'1rem',fontWeight:600},'& .MuiBottomNavigationAction-label.Mui-selected':{fontSize:'1rem'}}}>{nav.map(item=><BottomNavigationAction key={item.label} label={item.label}/>)}</BottomNavigation>
  </Paper>}
  <NoteDialog editor={note} app={app} onClose={()=>setNote(null)}/>
  <DetailDialog notice={app.notices.find(n=>n.id===details)??null} app={app} onClose={()=>setDetails(null)}/>
  <CalendarDialog selection={calendar} app={app} onClose={()=>setCalendar(null)}/>
  <LoginDialog open={login} app={app} onClose={()=>setLogin(false)}/>
  <HumanVerificationDialog request={verification.request} onComplete={verification.complete} onCancel={()=>{app.cancel();verification.cancel();}}/>
  <HelpDialog open={help} onClose={closeHelp} onExamples={()=>void app.loadExamples().then(closeHelp).catch(app.report)}/><AboutDialog open={about} onClose={()=>setAbout(false)}/>
  <Snackbar open={!!app.toast} key={app.toast?.id} autoHideDuration={6500} onClose={(_,reason)=>{if(reason!=='clickaway')app.setToast(null);}} message={app.toast?.text} action={app.toast?.undo?<Button color="inherit" onClick={()=>{const undo=app.toast?.undo;app.setToast(null);undo?.();}}>撤销</Button>:undefined} anchorOrigin={{vertical:'bottom',horizontal:'center'}} sx={{bottom:wide?24:84}}/>
  <Snackbar open={!!app.error} onClose={()=>app.setError('')} anchorOrigin={{vertical:'top',horizontal:'center'}}><Alert severity="error" onClose={()=>app.setError('')} variant="filled" sx={{maxWidth:560}}>{app.error}</Alert></Snackbar>
 </ThemeProvider>;
}
