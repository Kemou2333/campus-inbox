import {useEffect,useRef,useState} from 'react';
import {Alert,AppBar,BottomNavigation,BottomNavigationAction,Box,Button,CircularProgress,Container,CssBaseline,Divider,IconButton,Paper,Snackbar,Stack,Toolbar,Typography,useMediaQuery} from '@mui/material';
import {ThemeProvider} from '@mui/material/styles';
import Inbox from '@mui/icons-material/Inbox';
import AddCircleOutline from '@mui/icons-material/AddCircleOutlineOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import HelpOutline from '@mui/icons-material/HelpOutlineOutlined';
import CloudDoneOutlined from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import Sync from '@mui/icons-material/Sync';
import {useCampus} from './useCampus';
import {makeTheme} from './theme';
import {FeedPage} from '../features/notices/FeedPage';
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

const nav=[{label:'通知',icon:<Inbox/>},{label:'整理',icon:<AddCircleOutline/>},{label:'设置',icon:<SettingsOutlined/>}];
export default function App(){
 const app=useCampus();const wide=useMediaQuery('(min-width:960px), (min-width:600px) and (max-height:500px)');const split=useMediaQuery('(min-width:960px) and (min-height:560px)');const systemDark=useMediaQuery('(prefers-color-scheme:dark)');
 const [page,setPage]=useState(0);const [login,setLogin]=useState(false);const [help,setHelp]=useState(()=>localStorage.getItem('campus-inbox:tutorial:v2')!=='seen');
 const [about,setAbout]=useState(false);const [note,setNote]=useState<NoteEditor|null>(null);const [details,setDetails]=useState<string|null>(null);const [calendar,setCalendar]=useState<CalendarSelection|null>(null);const [focusID,setFocusID]=useState<string|null>(null);
 const [settingsDialog,setSettingsDialog]=useState(false);
 const dark=app.theme==='system'?(app.capabilities?.theme?.dark??systemDark):app.theme==='dark';const theme=makeTheme(dark,app.capabilities?.theme??null);
 useEffect(()=>{document.documentElement.dataset.platform=app.platform.kind;document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.palette.background.default);if(app.platform.setAppearance)void app.platform.setAppearance(dark).catch(app.report);},[app.platform,dark]);
 const modalRef=useRef(false);modalRef.current=login||help||about||!!note||!!details||!!calendar||settingsDialog;
 const lastNotices=useRef(app.notices);
 function closeHelp(){setHelp(false);localStorage.setItem('campus-inbox:tutorial:v2','seen');}
 function navigate(next:number){setPage(next);if(split&&next===1){setTimeout(()=>{document.getElementById('compose-pane')?.scrollIntoView({block:'start',behavior:'smooth'});document.querySelector<HTMLTextAreaElement>('#compose-pane textarea')?.focus({preventScroll:true});},0);}else window.scrollTo({top:0,behavior:'instant'});}
 const actions:NoticeActions={note:(notice,target,title,text)=>setNote({noticeID:notice.id,target,title,text}),details:n=>setDetails(n.id),calendar:(notice,task)=>setCalendar({notice,task})};
 useEffect(()=>{
  const receive=()=>{if(modalRef.current||app.busy)return;void app.receiveShare().then(received=>{if(received)navigate(1);}).catch(app.report);};
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
 const cloudIcon=app.sync.status==='syncing'?<Sync fontSize="small"/>:app.sync.connected&&app.sync.status==='idle'?<CloudDoneOutlined fontSize="small"/>:<CloudOffOutlined fontSize="small"/>;
 async function rescue(){const raw:Object=Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('campus-inbox:notices')).map(k=>[k,localStorage.getItem(k)]));await app.platform.saveFile(new Blob([JSON.stringify(raw,null,2)],{type:'application/json'}),'campus-inbox-original-data.json');}
 return <ThemeProvider theme={theme}><CssBaseline/>
  <AppBar position="sticky" color="inherit" elevation={0} sx={{borderBottom:'1px solid',borderColor:'divider',pt:'var(--safe-top)',bgcolor:'background.default'}}>
   <Toolbar sx={{maxWidth:1440,width:'100%',mx:'auto',gap:{xs:.5,sm:1},minHeight:{xs:56,sm:64},px:{xs:1.5,sm:3}}}>
    <Button onClick={()=>setAbout(true)} sx={{px:0,minWidth:0,color:'text.primary',gap:1.25}}><Box component="img" src="./icon.svg" width={32} height={32} alt=""/><Typography sx={{fontWeight:700,fontSize:'1.125rem',lineHeight:1.4}}>校园 Inbox</Typography></Button>
    <Box sx={{flex:1}}/>
    {wide&&nav.map((item,i)=>split?<Button key={item.label} startIcon={item.icon} variant={page===i?'contained':'text'} onClick={()=>navigate(i)} sx={{px:2}}>{item.label}</Button>:<IconButton key={item.label} aria-label={item.label} onClick={()=>navigate(i)} sx={{color:page===i?'primary.main':'text.secondary',bgcolor:page===i?'action.selected':undefined}}>{item.icon}</IconButton>)}
    <IconButton aria-label={app.sync.connected?'查看同步状态':'登录与同步'} onClick={()=>app.sync.connected?navigate(2):setLogin(true)}>{cloudIcon}</IconButton>
    <IconButton aria-label="使用帮助" onClick={()=>setHelp(true)}><HelpOutline/></IconButton>
   </Toolbar>
  </AppBar>
  <Container maxWidth={false} component="main" sx={{maxWidth:split&&page!==2?1440:900,px:{xs:1.5,sm:3},pt:{xs:2,sm:3},pb:wide?3:'calc(104px + var(--safe-bottom))'}}>
   {app.bootError?<Alert severity="error" action={<Button onClick={()=>void rescue().catch(app.report)}>保存原始数据</Button>}>原来的通知无法读取：{app.bootError}。数据仍在本机，暂未覆盖。</Alert>:
    split&&page!==2?<Box className="workspace" sx={{display:'grid',gridTemplateColumns:'minmax(300px, 360px) minmax(0, 1fr)',gap:3,height:'calc(100dvh - 150px - var(--safe-top))',minHeight:400}}>
     <ScrollPane id="compose-pane" label="新增通知"><ComposerPage app={app} embedded onDone={()=>setPage(0)} onLogin={()=>setLogin(true)}/></ScrollPane>
     <ScrollPane id="feed-pane" label="已保存通知"><FeedPage app={app} embedded actions={actions} onCompose={()=>navigate(1)} focusID={focusID}/></ScrollPane>
    </Box>:
    page===0?<FeedPage app={app} actions={actions} onCompose={()=>navigate(1)} focusID={focusID}/>:
    page===1?<ComposerPage app={app} onDone={()=>navigate(0)} onLogin={()=>setLogin(true)}/>:
    <SettingsPage app={app} onLogin={()=>setLogin(true)} onHelp={()=>setHelp(true)} onAbout={()=>setAbout(true)} onDialogChange={setSettingsDialog}/>}
   <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:3,textAlign:'center'}}>通知先保存在本机；登录后文字和进度自动同步，附件留在当前设备。</Typography>
  </Container>
  {!wide&&<Paper sx={{position:'fixed',bottom:0,left:0,right:0,borderTop:'1px solid',borderColor:'divider',pb:'var(--safe-bottom)',zIndex:10}}>
   <BottomNavigation value={page} onChange={(_,value)=>navigate(value)} showLabels sx={{bgcolor:'background.paper',minHeight:72,height:'auto','& .MuiBottomNavigationAction-root':{minWidth:0,maxWidth:180,gap:.5,py:1,color:'text.secondary'},'& .MuiBottomNavigationAction-root.Mui-selected':{color:'primary.main'},'& .MuiBottomNavigationAction-label':{fontSize:'.75rem',fontWeight:600},'& .MuiBottomNavigationAction-label.Mui-selected':{fontSize:'.75rem'}}}>{nav.map(item=><BottomNavigationAction key={item.label} label={item.label} icon={<Box sx={{width:64,height:30,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4,bgcolor:page===nav.indexOf(item)?'action.selected':'transparent'}}>{item.icon}</Box>}/>)}</BottomNavigation>
  </Paper>}
  <NoteDialog editor={note} app={app} onClose={()=>setNote(null)}/>
  <DetailDialog notice={app.notices.find(n=>n.id===details)??null} app={app} onClose={()=>setDetails(null)}/>
  <CalendarDialog selection={calendar} app={app} onClose={()=>setCalendar(null)}/>
  <LoginDialog open={login} app={app} onClose={()=>setLogin(false)}/>
  <HelpDialog open={help} onClose={closeHelp}/><AboutDialog open={about} onClose={()=>setAbout(false)}/>
  <Snackbar open={!!app.toast} key={app.toast?.id} autoHideDuration={6500} onClose={(_,reason)=>{if(reason!=='clickaway')app.setToast(null);}} message={app.toast?.text} action={app.toast?.undo?<Button color="inherit" onClick={()=>{const undo=app.toast?.undo;app.setToast(null);undo?.();}}>撤销</Button>:undefined} anchorOrigin={{vertical:'bottom',horizontal:'center'}} sx={{bottom:{xs:84,md:24}}}/>
  <Snackbar open={!!app.error} onClose={()=>app.setError('')} anchorOrigin={{vertical:'top',horizontal:'center'}}><Alert severity="error" onClose={()=>app.setError('')} variant="filled" sx={{maxWidth:560}}>{app.error}</Alert></Snackbar>
 </ThemeProvider>;
}
