import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, ButtonBase, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Paper, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import MailOutline from '@mui/icons-material/MailOutlined';
import PaletteOutlined from '@mui/icons-material/PaletteOutlined';
import VolumeUpOutlined from '@mui/icons-material/VolumeUpOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ArrowBack from '@mui/icons-material/ArrowBack';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import HelpOutline from '@mui/icons-material/HelpOutlineOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import PersonOutline from '@mui/icons-material/PersonOutlined';
import Sync from '@mui/icons-material/Sync';
import {operationSoundsEnabled,setOperationSoundsEnabled} from '../../shared/operation-sounds';
import {operationHapticsEnabled,setOperationHapticsEnabled} from '../../shared/operation-haptics';
import {useUiPreferences} from '../../shared/ui-preferences';
import type { CampusController } from '../../app/useCampus';
import type { SyncConflict } from '../../infrastructure/sync-client';
import type { ThemePreference } from '../../app/theme';
import {BackupDialog} from './BackupDialog';
import {CampusPreferencesPanel,TeachingWeekPanel} from './CampusPreferencesPanel';
import {TrashDialog} from './TrashDialog';
import {SettingsFAQ,SettingsUsageState} from './SettingsFAQ';
import {AndroidDownloads} from '../../shared/ui/AndroidDownloads';
import {AndroidUpdateSettings} from './AndroidUpdateSettings';
import {friendlyErrorMessage} from '../../shared/error-message';

interface Props {
  app: CampusController;
  onLogin: () => void;
  onHelp: () => void;
  onAbout: () => void;
  onDialogChange: (open:boolean) => void;
  onShowNotices?: () => void;
  onFilterNotices?: (enabled:boolean) => void;
  expandCampus?: boolean;
}
type Category='appearance'|'feedback'|'sync'|'tools'|'campus'|'faq';
const categoryTitles:Record<Category,string>={appearance:'外观与阅读',feedback:'操作反馈',sync:'账号与同步',tools:'工具与帮助',campus:'通知筛选与校历',faq:'常见问题'};
const sectionStyle={borderRadius:'18px',overflow:'hidden'} as const;
const rowStyle={alignItems:'center',gap:1.5,px:{xs:2,sm:2.5},py:2.25,borderTop:'1px solid',borderColor:'divider'} as const;

function date(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
}
function Version({ label, record }: { label: string; record: SyncConflict['local'] }) {
  return <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, flex: 1, minWidth: 0 }}>
    <Typography color="text.secondary" sx={{fontSize:14,mb:.5}}>{label}</Typography>
    <Typography sx={{fontSize:18,fontWeight:650}}>{record?.title ?? '已删除'}</Typography>
    {record && <>
      <Typography sx={{fontSize:16,mt:1,overflowWrap:'anywhere'}}>{record.summary}</Typography>
      <Typography color="text.secondary" sx={{fontSize:14,mt:1}}>
        {record.tasks.length ? `${record.tasks.filter(task => task.completed || task.dismissed).length}/${record.tasks.length} 项已处理 · ` : ''}{date(record.updatedAt)}
      </Typography>
    </>}
  </Box>;
}
function SettingIcon({children}:{children:ReactNode}) {
  return <Box sx={{width:38,height:38,borderRadius:'12px',display:'grid',placeItems:'center',flexShrink:0,color:'text.secondary',bgcolor:'action.hover','& .MuiSvgIcon-root':{fontSize:22}}}>{children}</Box>;
}
function ToolRow({icon,title,detail,onClick,disabled=false}:{icon:ReactNode;title:string;detail?:string;onClick:()=>void;disabled?:boolean}) {
  return <ButtonBase onClick={onClick} disabled={disabled} sx={{width:'100%',display:'flex',gap:1.5,alignItems:'center',textAlign:'left',px:{xs:2,sm:2.5},py:2.2,minHeight:86,borderTop:'1px solid',borderColor:'divider','&:first-of-type':{borderTop:0},'&.Mui-disabled':{opacity:.5},'&:hover':{bgcolor:'action.hover'},'&.Mui-focusVisible':{outline:'2px solid',outlineColor:'primary.main',outlineOffset:-3}}}>
    <SettingIcon>{icon}</SettingIcon>
    <Box component="span" sx={{flex:1,minWidth:0}}><Typography component="span" sx={{display:'block',fontSize:18,fontWeight:650,lineHeight:1.5}}>{title}</Typography>
      {detail&&<Typography component="span" sx={{display:'block',fontSize:14,color:'text.secondary',mt:.4,lineHeight:1.6,overflowWrap:'anywhere'}}>{detail}</Typography>}</Box>
    <ChevronRight sx={{fontSize:20,color:'text.secondary',flexShrink:0}}/>
  </ButtonBase>;
}
function PreferenceRow({title,detail,checked,onChange,disabled=false}:{title:string;detail:string;checked:boolean;onChange:(enabled:boolean)=>void;disabled?:boolean}){
  return <Stack direction="row" sx={rowStyle}>
    <Box sx={{flex:1,minWidth:0}}><Typography component="h2" sx={{fontSize:17,fontWeight:650}}>{title}</Typography><Typography sx={{fontSize:14,color:'text.secondary',lineHeight:1.75,mt:.5}}>{detail}</Typography></Box>
    <Switch checked={checked} disabled={disabled} slotProps={{input:{'aria-label':title}}} onChange={(_event,enabled)=>onChange(enabled)}/>
  </Stack>;
}

export function SettingsPage({ app, onLogin, onHelp, onAbout, onDialogChange, onFilterNotices, expandCampus = false }: Props) {
  const [category,setCategory]=useState<Category|null>(()=>expandCampus?'campus':null);
  const [running, setRunning] = useState<string | null>(null);
  const [sounds,setSounds]=useState(operationSoundsEnabled),[haptics,setHaptics]=useState(operationHapticsEnabled);
  const {preferences:uiPreferences,setPreference}=useUiPreferences();
  const [error, setError] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false),[conflict, setConflict] = useState<SyncConflict | null>(null);
  const [legacyOpen,setLegacyOpen]=useState(false),[backupOpen,setBackupOpen]=useState(false);
  const [trashOpen,setTrashOpen]=useState(false),[downloadsOpen,setDownloadsOpen]=useState(false),[transferOpen,setTransferOpen]=useState(false);
  const picker = useRef<HTMLInputElement>(null),heading=useRef<HTMLHeadingElement>(null);
  const busy = !!running || app.busy;
  const isOwner=app.sync.connected&&app.username.normalize('NFKC').trim().toLowerCase()==='kemou';
  const dialogOpen=logoutOpen||isOwner&&!!conflict||legacyOpen||backupOpen||trashOpen||downloadsOpen||transferOpen;
  useEffect(()=>{onDialogChange(dialogOpen);return()=>onDialogChange(false);},[dialogOpen,onDialogChange]);
  useEffect(()=>{if(expandCampus)setCategory('campus');},[expandCampus]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[category]);
  useEffect(()=>{if(!isOwner)setConflict(null);},[isOwner]);
  useEffect(()=>{
    if(!category)return;
    return app.platform.onBack(()=>{
      if(document.querySelector('[role="dialog"],dialog[open]'))return false;
      setCategory(category==='campus'||category==='faq'?'tools':null);return true;
    });
  },[app.platform,category]);
  function openCategory(next:Category|null){setError('');setCategory(next);window.scrollTo({top:0,behavior:'instant'});}
  function changePreference(key:keyof typeof uiPreferences,enabled:boolean){try{setPreference(key,enabled);}catch(issue){app.report(issue);}}
  async function run(name: string, operation: () => Promise<unknown>) {
    if (busy) return;
    setError('');setRunning(name);
    try { await operation(); } catch (value) { setError(friendlyErrorMessage(value)); } finally { setRunning(null); }
  }
  async function syncNow() {
    const state = await app.cloud?.syncNow();
    if (!state) throw new Error('请先登录。');
    if (state.status === 'error' || state.status === 'offline') throw new Error(state.error || '暂时无法同步，通知已保存在本机。');
    if (!state.conflicts.length && !state.pendingChanges && !state.hasMore) app.tell('已同步');
  }
  const status = !app.sync.connected ? '未登录' : app.sync.status === 'syncing' ? '正在同步'
    : app.sync.status === 'offline' ? '离线' : app.sync.status === 'error' ? '连接异常'
      : app.sync.conflicts.length ? isOwner?'待选择版本':'正在同步' : app.sync.pendingChanges ? `待同步 ${app.sync.pendingChanges}` : '已同步';
  const statusColor = !app.sync.connected ? 'default' : app.sync.status === 'error' || app.sync.status === 'offline' || isOwner&&app.sync.conflicts.length
    ? 'warning' : app.sync.status === 'syncing' || app.sync.pendingChanges || app.sync.conflicts.length ? 'primary' : 'success';
  const themeLabel=app.theme==='system'?'跟随系统':app.theme==='light'?'浅色':'深色';

  return <Stack spacing={2.5} sx={{maxWidth:720,mx:'auto',pb:4,'& .MuiButton-root':{fontSize:15,minHeight:42}}}>
    <Box>
      {category&&<Button color="inherit" startIcon={<ArrowBack sx={{fontSize:19}}/>} onClick={()=>openCategory(category==='campus'||category==='faq'?'tools':null)} sx={{ml:-1,mb:1,color:'text.secondary'}}>返回{category==='campus'||category==='faq'?'工具与帮助':'设置'}</Button>}
      <Typography ref={heading} tabIndex={-1} component="h1" sx={{fontSize:{xs:30,sm:34},lineHeight:1.3,fontWeight:760,outline:'none'}}>{category?categoryTitles[category]:'设置'}</Typography>
    </Box>
    {error && !logoutOpen && !conflict && !transferOpen && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

    {!category&&<>
      <Paper variant="outlined" sx={sectionStyle}>
        <ToolRow icon={<PaletteOutlined/>} title="外观与阅读" detail={`${themeLabel} · 通知显示方式`} onClick={()=>openCategory('appearance')}/>
        <ToolRow icon={<VolumeUpOutlined/>} title="操作反馈" detail={app.platform.kind==='android'?'声音与触感':'操作音效'} onClick={()=>openCategory('feedback')}/>
        <ToolRow icon={<MailOutline/>} title="账号与同步" detail={app.sync.connected?`${status}${app.email?` · ${app.email}`:''}`:'登录后同步通知与进度'} onClick={()=>openCategory('sync')}/>
        <ToolRow icon={<TuneOutlined/>} title="工具与帮助" detail="备份、回收站、常见问题" onClick={()=>openCategory('tools')}/>
      </Paper>
      <SettingsUsageState app={app}/>
    </>}

    {category==='appearance'&&<Paper variant="outlined" sx={sectionStyle}>
      <Box sx={{px:{xs:2,sm:2.5},py:2.25}}>
        <Typography component="h2" sx={{fontSize:18,fontWeight:650,mb:1.5}}>颜色主题</Typography>
        <ToggleButtonGroup value={app.theme} exclusive size="small" disabled={busy} aria-label="颜色主题"
          sx={{display:'flex',bgcolor:'action.hover',p:.5,borderRadius:'12px','& .MuiToggleButton-root':{flex:1,fontSize:16,px:1.5,py:1,border:0,borderRadius:'9px!important'},'& .MuiToggleButton-root.Mui-selected':{bgcolor:'background.paper',color:'info.main',fontWeight:700,boxShadow:'0 1px 4px #00000012'}}}
          onChange={(_event,value:ThemePreference|null)=>{if(value){try{app.setTheme(value);}catch(issue){app.report(issue);}}}}>
          <ToggleButton value="light">浅色</ToggleButton><ToggleButton value="dark">深色</ToggleButton><ToggleButton value="system">系统</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <PreferenceRow title="自动展开全部细节" detail="打开通知时，同时展开各事项的步骤、材料与说明。" checked={uiPreferences.expandAllDetails} onChange={enabled=>changePreference('expandAllDetails',enabled)}/>
      <PreferenceRow title="显示添加日期" detail="在通知卡片上显示保存到 Inbox 的日期。" checked={uiPreferences.showAddedDate} onChange={enabled=>changePreference('showAddedDate',enabled)}/>
    </Paper>}

    {category==='feedback'&&<Paper variant="outlined" sx={{...sectionStyle,'& > :first-child':{borderTop:0}}}>
      <PreferenceRow title="操作音效" detail="完成、整理、删除时轻响。" checked={sounds} onChange={enabled=>{try{setOperationSoundsEnabled(enabled);setSounds(enabled);}catch(issue){app.report(issue);}}}/>
      {app.platform.kind==='android'&&<PreferenceRow title="操作震动" detail="跟随系统触感设置。" checked={haptics} onChange={enabled=>{try{setOperationHapticsEnabled(enabled);setHaptics(enabled);}catch(issue){app.report(issue);}}}/>}
      <PreferenceRow title="手机滑动操作" detail="左右滑动通知，快速收藏或删除。" checked={uiPreferences.swipeActions} onChange={enabled=>changePreference('swipeActions',enabled)}/>
    </Paper>}

    {category==='sync'&&<Paper variant="outlined" sx={{...sectionStyle,p:{xs:2,sm:2.5}}}>
      <Stack direction="row" sx={{alignItems:'center',gap:1.25}}><SettingIcon><MailOutline/></SettingIcon>
        <Typography sx={{flex:1,minWidth:0,fontSize:17,fontWeight:650,overflowWrap:'anywhere'}}>{app.sync.connected?(app.email||'尚未绑定邮箱'):'登录后同步通知与进度'}</Typography>
        <Chip label={status} color={statusColor} size="small" sx={{fontSize:13,flexShrink:0}}/>
      </Stack>
      {app.sync.connected ? <>
        {!!app.sync.lastSyncedAt&&<Typography sx={{fontSize:14,color:'text.secondary',mt:1.5}}>上次同步 {date(app.sync.lastSyncedAt)}</Typography>}
        {app.sync.error&&<Alert severity="warning" sx={{mt:2}}>{friendlyErrorMessage(app.sync.error)}</Alert>}
        <Stack direction="row" sx={{gap:1,flexWrap:'wrap',mt:2}}>
          <Button variant="outlined" disabled={busy||app.sync.status==='syncing'} startIcon={running==='sync'||app.sync.status==='syncing'?<CircularProgress size={17} color="inherit"/>:<Sync sx={{fontSize:18}}/>} onClick={()=>void run('sync',syncNow)}>立即同步</Button>
          {app.authOptions?.emailEnabled&&!app.email&&<Button disabled={busy} onClick={onLogin}>绑定邮箱</Button>}
          <Button color="inherit" disabled={busy} sx={{color:'text.secondary'}} onClick={()=>{setError('');setLogoutOpen(true);}}>退出登录</Button>
          {isOwner&&<Button component="a" href="https://123.57.30.129/admin" target="_blank" rel="noopener noreferrer">管理后台</Button>}
        </Stack>
      </>:<Button variant="contained" disabled={busy||!app.auth} onClick={onLogin} sx={{mt:2}}>登录</Button>}
      {isOwner&&!!app.sync.conflicts.length&&<Box sx={{mt:2.5}}><Divider sx={{mb:2}}/>
        <Typography sx={{fontSize:17,fontWeight:650}}>有 {app.sync.conflicts.length} 条通知需要选择版本</Typography>
        <Stack spacing={1} sx={{mt:1}}>{app.sync.conflicts.map(item=><Button key={item.id} variant="outlined" disabled={busy} sx={{justifyContent:'space-between',textAlign:'left',gap:1}} onClick={()=>{setError('');setConflict(item);}}><span>{item.local?.title||item.remote?.title||'已删除的通知'}</span><span>选择版本</span></Button>)}</Stack>
      </Box>}
    </Paper>}

    {category==='tools'&&<Paper variant="outlined" sx={sectionStyle}>
      {app.platform.kind!=='android'?<ToolRow icon={<DownloadOutlined/>} title="安卓下载" detail="蓝奏 / GitHub" onClick={()=>setDownloadsOpen(true)}/>:<AndroidUpdateSettings platform={app.platform}/>}
      <ToolRow icon={<Inventory2Outlined/>} title="导入与导出" disabled={busy} onClick={()=>setTransferOpen(true)}/>
      <ToolRow icon={<DeleteOutline/>} title="回收站" detail={app.trashItems.length?`${app.trashItems.length} 条通知`:undefined} disabled={busy} onClick={()=>setTrashOpen(true)}/>
      <ToolRow icon={<PersonOutline/>} title="通知筛选与校历" onClick={()=>openCategory('campus')}/>
      <ToolRow icon={<HelpOutline/>} title="常见问题" onClick={()=>openCategory('faq')}/>
      <ToolRow icon={<HelpOutline/>} title="重新看引导" onClick={onHelp}/>
      <ToolRow icon={<InfoOutlined/>} title="关于校园 Inbox" onClick={onAbout}/>
    </Paper>}
    {category==='campus'&&<Paper variant="outlined" sx={sectionStyle}>
      <CampusPreferencesPanel value={app.preferences} onSave={app.setPreferences} disabled={busy} initiallyExpanded={expandCampus} onApplyFilter={onFilterNotices}/>
      <TeachingWeekPanel value={app.preferences} onSave={app.setPreferences} disabled={busy}/>
    </Paper>}
    {category==='faq'&&<Paper variant="outlined" sx={sectionStyle}><SettingsFAQ/></Paper>}
    <input ref={picker} type="file" accept="application/json,.json" hidden aria-label="选择通知备份" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file){setTransferOpen(false);void run('import',()=>app.importBackup(file));}}}/>

    <TrashDialog open={trashOpen} app={app} onClose={()=>setTrashOpen(false)}/>
    <Dialog open={downloadsOpen} onClose={()=>setDownloadsOpen(false)} fullWidth maxWidth="xs"><DialogTitle sx={{fontSize:24,fontWeight:750}}>安卓下载</DialogTitle><DialogContent><AndroidDownloads compact/></DialogContent><DialogActions><Button onClick={()=>setDownloadsOpen(false)}>关闭</Button></DialogActions></Dialog>
    <Dialog open={transferOpen} onClose={()=>{if(!running)setTransferOpen(false);}} fullWidth maxWidth="xs">
      <DialogTitle sx={{fontSize:24,fontWeight:750}}>导入与导出</DialogTitle><DialogContent><Stack spacing={1.5} sx={{pt:1}}>
        {error&&<Alert severity="error">{error}</Alert>}
        <Button variant="contained" disabled={busy} onClick={()=>{
          if(app.notices.some(notice=>notice.attachments.length)){setTransferOpen(false);setBackupOpen(true);}
          else void run('backup',()=>app.backup(false));
        }}>{running==='backup'?'正在导出…':'导出备份'}</Button>
        <Button variant="outlined" disabled={busy} onClick={()=>picker.current?.click()}>{running==='import'?'正在导入…':'导入备份'}</Button>
        {!!app.legacyWork.text&&<Button disabled={busy} onClick={()=>{setTransferOpen(false);setLegacyOpen(true);}}>查看旧版未保存编辑</Button>}
      </Stack></DialogContent><DialogActions><Button disabled={!!running} onClick={()=>setTransferOpen(false)}>关闭</Button></DialogActions>
    </Dialog>
    <BackupDialog open={backupOpen} app={app} onClose={()=>setBackupOpen(false)}/>
    <Dialog open={logoutOpen} onClose={() => { if (!running) setLogoutOpen(false); }}>
      <DialogTitle sx={{fontSize:24,fontWeight:750}}>退出登录？</DialogTitle>
      <DialogContent>
        <Typography>退出后停止同步，本机通知仍会保留。</Typography>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={!!running} onClick={() => setLogoutOpen(false)}>取消</Button>
        <Button variant="contained" disabled={!!running} onClick={() => void run('logout', async () => {
          await app.logout(); setLogoutOpen(false);
        })}>{running === 'logout' ? '正在退出…' : '退出登录'}</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={legacyOpen} onClose={()=>setLegacyOpen(false)}>
      <DialogTitle sx={{fontSize:24,fontWeight:750}}>旧版未保存编辑</DialogTitle>
      <DialogContent><Typography color="text.secondary" sx={{mb:2}}>内容已保留，未覆盖当前笔记。</Typography>
        <TextField multiline minRows={8} maxRows={16} value={app.legacyWork.text} slotProps={{input:{readOnly:true},htmlInput:{'aria-label':'旧版未保存内容'}}}/>
      </DialogContent>
      <DialogActions><Button onClick={()=>setLegacyOpen(false)}>关闭</Button><Button variant="contained" onClick={()=>void run('legacy',app.exportLegacyWork)}>导出文字</Button></DialogActions>
    </Dialog>

    <Dialog open={isOwner&&!!conflict} onClose={() => { if (!running) setConflict(null); }}>
      <DialogTitle sx={{fontSize:24,fontWeight:750}}>保留哪个版本？</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>这条通知在两边都有修改。</Typography>
        {conflict && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Version label="本机" record={conflict.local} /><Version label="云端" record={conflict.remote} />
        </Stack>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: .5, px: 3, pb: 2 }}>
        <Button disabled={!!running} onClick={() => setConflict(null)}>稍后</Button>
        {(['local', 'remote', 'both'] as const).map(choice => <Button key={choice}
          variant={choice === 'both' ? 'contained' : 'outlined'} disabled={!!running}
          onClick={() => void run('conflict', async () => {
            if (!conflict || !app.cloud) return;
            const state = await app.cloud.resolveConflict(conflict.id, choice);
            setConflict(null);
            app.tell(state.status === 'offline' || state.status === 'error' ? '选择已保存在本机，稍后继续同步。' : '已保留所选版本');
          })}>
          {choice === 'local' ? '使用本机' : choice === 'remote' ? '使用云端'
            : conflict?.local && conflict.remote ? '都保留' : '保留现有版本'}
        </Button>)}
      </DialogActions>
    </Dialog>
  </Stack>;
}

export default SettingsPage;
