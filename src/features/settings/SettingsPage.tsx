import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, ButtonBase, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import MailOutline from '@mui/icons-material/MailOutlined';
import PaletteOutlined from '@mui/icons-material/PaletteOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import ArticleOutlined from '@mui/icons-material/ArticleOutlined';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Sync from '@mui/icons-material/Sync';
import type { CampusController } from '../../app/useCampus';
import type { SyncConflict } from '../../infrastructure/sync-client';
import type { ThemePreference } from '../../app/theme';
import {BackupDialog} from './BackupDialog';
import {CampusPreferencesPanel} from './CampusPreferencesPanel';
import {isExampleNotice} from '../../domain/examples';
import {TrashDialog} from './TrashDialog';
import {SettingsFAQ} from './SettingsFAQ';
import {AndroidDownloads} from '../../shared/ui/AndroidDownloads';
import {friendlyErrorMessage} from '../../shared/error-message';

interface Props {
  app: CampusController;
  onLogin: () => void;
  onHelp: () => void;
  onAbout: () => void;
  onDialogChange: (open:boolean) => void;
  onShowNotices?: () => void;
  expandCampus?: boolean;
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
}

function Version({ label, record }: { label: string; record: SyncConflict['local'] }) {
  return <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, flex: 1, minWidth: 0 }}>
    <Typography variant="body2" color="text.secondary" sx={{ mb: .5 }}>{label}</Typography>
    <Typography sx={{ fontWeight: 650 }}>{record?.title ?? '已删除'}</Typography>
    {record && <>
      <Typography variant="body2" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{record.summary}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {record.tasks.length ? `${record.tasks.filter(task => task.completed || task.dismissed).length}/${record.tasks.length} 项已处理 · ` : ''}
        {date(record.updatedAt)}
      </Typography>
    </>}
  </Box>;
}

function SettingIcon({children,warm=false}:{children:ReactNode;warm?:boolean}) {
  return <Box sx={{width:30,height:30,borderRadius:'9px',display:'grid',placeItems:'center',flexShrink:0,
    color:warm?'warning.main':'primary.main',bgcolor:theme=>alpha(warm?theme.palette.warning.main:theme.palette.primary.main,.10),
    '& .MuiSvgIcon-root':{fontSize:18}}}>{children}</Box>;
}

function ToolRow({icon,title,detail,onClick,disabled=false}:{icon:ReactNode;title:string;detail?:string;onClick:()=>void;disabled?:boolean}) {
  return <ButtonBase onClick={onClick} disabled={disabled} sx={{width:'100%',display:'flex',gap:1.25,alignItems:'center',
    textAlign:'left',px:{xs:2,sm:2.5},py:1.75,minHeight:66,borderTop:'1px solid',borderColor:'divider',
    '&.Mui-disabled':{opacity:.5},'&:hover':{bgcolor:'action.hover'},'&.Mui-focusVisible':{outline:'2px solid',outlineColor:'primary.main',outlineOffset:-3}}}>
    <SettingIcon>{icon}</SettingIcon><Typography component="span" sx={{flex:1,fontSize:17,fontWeight:650}}>{title}</Typography>
    {detail&&<Typography component="span" sx={{fontSize:14,color:'text.secondary',textAlign:'right'}}>{detail}</Typography>}
    <ChevronRight sx={{fontSize:19,color:'text.secondary',flexShrink:0}}/>
  </ButtonBase>;
}

export function SettingsPage({ app, onLogin, onHelp, onAbout, onDialogChange, onShowNotices, expandCampus = false }: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  const [legacyOpen,setLegacyOpen]=useState(false);
  const [backupOpen,setBackupOpen]=useState(false);
  const [trashOpen,setTrashOpen]=useState(false),[downloadsOpen,setDownloadsOpen]=useState(false),[transferOpen,setTransferOpen]=useState(false);
  useEffect(()=>{onDialogChange(logoutOpen||!!conflict||legacyOpen||backupOpen||trashOpen||downloadsOpen||transferOpen);return()=>onDialogChange(false);},[logoutOpen,conflict,legacyOpen,backupOpen,trashOpen,downloadsOpen,transferOpen,onDialogChange]);
  const picker = useRef<HTMLInputElement>(null);
  const busy = !!running || app.busy;
  const hasExamples = app.notices.some(isExampleNotice);

  async function run(name: string, operation: () => Promise<unknown>) {
    if (busy) return;
    setError('');
    setRunning(name);
    try { await operation(); }
    catch (value) { setError(friendlyErrorMessage(value)); }
    finally { setRunning(null); }
  }

  async function syncNow() {
    const state = await app.cloud?.syncNow();
    if (!state) throw new Error('请先登录。');
    if (state.status === 'error' || state.status === 'offline') throw new Error(state.error || '暂时无法同步，通知已保存在本机。');
    if (!state.conflicts.length && !state.pendingChanges && !state.hasMore) app.tell('已同步');
  }

  const status = !app.sync.connected ? '未登录' : app.sync.status === 'syncing' ? '正在同步'
    : app.sync.status === 'offline' ? '离线' : app.sync.status === 'error' ? '连接异常'
      : app.sync.conflicts.length ? '待选择版本' : app.sync.pendingChanges ? `待同步 ${app.sync.pendingChanges}` : '已同步';
  const statusColor = !app.sync.connected ? 'default' : app.sync.status === 'error' || app.sync.status === 'offline' || app.sync.conflicts.length
    ? 'warning' : app.sync.status === 'syncing' || app.sync.pendingChanges ? 'primary' : 'success';

  return <Stack spacing={2.25} sx={{maxWidth:720,mx:'auto',pb:4}}>
    <Typography component="h1" variant="h4" sx={{fontWeight:750}}>设置</Typography>
    {error && !logoutOpen && !conflict && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

    <Paper variant="outlined" sx={{p:{xs:2,sm:2.5},borderRadius:'16px'}}>
      <Stack direction="row" sx={{alignItems:'center',gap:1.25}}>
        <Box sx={{width:44,height:44,borderRadius:'13px',display:'grid',placeItems:'center',flexShrink:0,
          bgcolor:theme=>alpha(theme.palette.warning.main,.11),color:'warning.main'}}><MailOutline sx={{fontSize:23}}/></Box>
        <Box sx={{flex:1,minWidth:0}}>
          <Typography component="h2" sx={{fontSize:20,fontWeight:750,overflowWrap:'anywhere'}}>{app.sync.connected?app.username:'账号与同步'}</Typography>
          <Typography sx={{fontSize:14,color:'text.secondary',mt:.25}}>{app.sync.connected?'账号与同步':'登录后同步通知与进度'}</Typography>
        </Box>
        <Chip label={status} color={statusColor} size="small" sx={{fontSize:14,flexShrink:0,'& .MuiChip-label':{fontSize:14}}}/>
      </Stack>
      {app.sync.connected ? <>
        {!!app.email&&<Typography sx={{fontSize:14,color:'text.secondary',mt:1.5,overflowWrap:'anywhere'}}>{app.email}</Typography>}
        {!!app.sync.lastSyncedAt&&<Typography sx={{fontSize:14,color:'text.secondary',mt:1}}>
          上次同步 {date(app.sync.lastSyncedAt)}
        </Typography>}
        {app.sync.error && <Alert severity="warning" sx={{mt:2}}>{friendlyErrorMessage(app.sync.error)}</Alert>}
        <Stack direction="row" sx={{gap:1,flexWrap:'wrap',mt:2}}>
          <Button size="small" disabled={busy || app.sync.status === 'syncing'}
            startIcon={running === 'sync' || app.sync.status === 'syncing' ? <CircularProgress size={17} color="inherit" /> : <Sync sx={{fontSize:18}}/>}
            sx={{bgcolor:theme=>alpha(theme.palette.primary.main,.09),px:1.5,'&:hover':{bgcolor:theme=>alpha(theme.palette.primary.main,.15)}}}
            onClick={() => void run('sync', syncNow)}>立即同步</Button>
          <Button size="small" color="inherit" disabled={busy} sx={{color:'text.secondary'}} onClick={() => {setError('');setLogoutOpen(true);}}>退出登录</Button>
          {app.authOptions?.emailEnabled&&!app.email&&<Button size="small" disabled={busy} onClick={onLogin}>绑定邮箱</Button>}
          {app.username.normalize('NFKC').trim().toLowerCase()==='kemou'&&<Button size="small" component="a" href="https://123.57.30.129/admin" target="_blank" rel="noopener noreferrer">管理后台</Button>}
        </Stack>
      </> : <Button variant="contained" size="small" disabled={busy || !app.auth} onClick={onLogin} sx={{mt:2}}>登录</Button>}
      {!!app.sync.conflicts.length && <Box sx={{mt:2.5}}>
        <Divider sx={{mb:2}}/>
        <Typography sx={{fontSize:17,fontWeight:650}}>有 {app.sync.conflicts.length} 条通知需要选择版本</Typography>
        <Stack spacing={1} sx={{mt:1}}>
          {app.sync.conflicts.map(item => <Button key={item.id} variant="outlined" disabled={busy}
            sx={{justifyContent:'space-between',textAlign:'left',gap:1}} onClick={() => {setError('');setConflict(item);}}>
            <span>{item.local?.title || item.remote?.title || '已删除的通知'}</span><span>选择版本</span>
          </Button>)}
        </Stack>
      </Box>}
    </Paper>

    <Paper variant="outlined" sx={{borderRadius:'16px',overflow:'hidden'}}>
      <Typography component="h2" sx={{fontSize:20,fontWeight:750,px:{xs:2,sm:2.5},pt:2,pb:1}}>偏好</Typography>
      <Stack direction="row" sx={{alignItems:'center',gap:1.25,px:{xs:2,sm:2.5},py:1.75,flexWrap:'wrap'}}>
        <SettingIcon><PaletteOutlined/></SettingIcon>
        <Typography component="h3" sx={{flex:1,fontSize:17,fontWeight:650}}>外观</Typography>
        <ToggleButtonGroup value={app.theme} exclusive size="small" disabled={busy} aria-label="颜色主题"
          sx={{bgcolor:'action.hover',p:.35,borderRadius:2,'& .MuiToggleButton-root':{fontSize:14,px:{xs:1,sm:1.5},py:.6,border:0,borderRadius:'7px!important'},
            '& .MuiToggleButton-root.Mui-selected':{bgcolor:'background.paper',color:'primary.main',fontWeight:700,boxShadow:'0 1px 4px #00000012'}}}
          onChange={(_event,value:ThemePreference|null)=>{if(value){try{app.setTheme(value);}catch(issue){app.report(issue);}}}}>
          <ToggleButton value="system">系统</ToggleButton><ToggleButton value="light">浅色</ToggleButton><ToggleButton value="dark">深色</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <CampusPreferencesPanel value={app.preferences} onSave={app.setPreferences} disabled={busy} initiallyExpanded={expandCampus}/>
    </Paper>

    <Paper variant="outlined" sx={{borderRadius:'16px',overflow:'hidden'}}>
      <Typography component="h2" sx={{fontSize:20,fontWeight:750,px:{xs:2,sm:2.5},py:2}}>工具</Typography>
      <ToolRow icon={<DownloadOutlined/>} title="安卓下载" detail="蓝奏 / GitHub" onClick={()=>setDownloadsOpen(true)}/>
      <ToolRow icon={<Inventory2Outlined/>} title="导入与导出" disabled={busy} onClick={()=>setTransferOpen(true)}/>
      <ToolRow icon={<DeleteOutline/>} title="回收站" detail={app.trashItems.length?String(app.trashItems.length):undefined} disabled={busy} onClick={()=>setTrashOpen(true)}/>
      <ToolRow icon={<ArticleOutlined/>} title="示例通知" detail={running==='examples'?'载入中…':hasExamples?'更新':'载入'} disabled={busy}
        onClick={()=>void run('examples',async()=>{await app.loadExamples();onShowNotices?.();})}/>
      <input ref={picker} type="file" accept="application/json,.json" hidden aria-label="选择通知备份" onChange={event=>{
        const file=event.target.files?.[0];event.target.value='';
        if(file){setTransferOpen(false);void run('import',()=>app.importBackup(file));}
      }}/>
    </Paper>

    <Paper variant="outlined" sx={{borderRadius:'16px',overflow:'hidden'}}>
      <Typography component="h2" sx={{fontSize:20,fontWeight:750,px:{xs:2,sm:2.5},pt:2,pb:.5}}>常见问题</Typography>
      <SettingsFAQ app={app}/>
    </Paper>
    <Stack direction="row" sx={{gap:2,justifyContent:'center',flexWrap:'wrap',pt:.5}}>
      <Button size="small" color="inherit" sx={{color:'text.secondary',fontSize:14}} onClick={onHelp}>重新看引导</Button>
      <Button size="small" color="inherit" sx={{color:'text.secondary',fontSize:14}} onClick={onAbout}>关于校园 Inbox</Button>
    </Stack>

    <TrashDialog open={trashOpen} app={app} onClose={()=>setTrashOpen(false)}/>
    <Dialog open={downloadsOpen} onClose={()=>setDownloadsOpen(false)} fullWidth maxWidth="xs"><DialogTitle>安卓下载</DialogTitle><DialogContent><AndroidDownloads compact/></DialogContent><DialogActions><Button onClick={()=>setDownloadsOpen(false)}>关闭</Button></DialogActions></Dialog>
    <Dialog open={transferOpen} onClose={()=>{if(!running)setTransferOpen(false);}} fullWidth maxWidth="xs">
      <DialogTitle>导入与导出</DialogTitle><DialogContent><Stack spacing={1.5} sx={{pt:1}}>
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
      <DialogTitle>退出登录？</DialogTitle>
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
      <DialogTitle>旧版未保存编辑</DialogTitle>
      <DialogContent><Typography color="text.secondary" sx={{mb:2}}>内容已保留，未覆盖当前笔记。</Typography>
        <TextField multiline minRows={8} maxRows={16} value={app.legacyWork.text} slotProps={{input:{readOnly:true},htmlInput:{'aria-label':'旧版未保存内容'}}}/>
      </DialogContent>
      <DialogActions><Button onClick={()=>setLegacyOpen(false)}>关闭</Button><Button variant="contained" onClick={()=>void run('legacy',app.exportLegacyWork)}>导出文字</Button></DialogActions>
    </Dialog>

    <Dialog open={!!conflict} onClose={() => { if (!running) setConflict(null); }}>
      <DialogTitle>保留哪个版本？</DialogTitle>
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
