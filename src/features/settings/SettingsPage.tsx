import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import type { CampusController } from '../../app/useCampus';
import type { SyncConflict } from '../../infrastructure/sync-client';
import type { ThemePreference } from '../../app/theme';
import {BackupDialog} from './BackupDialog';

interface Props {
  app: CampusController;
  onLogin: () => void;
  onHelp: () => void;
  onAbout: () => void;
  onDialogChange: (open:boolean) => void;
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

export function SettingsPage({ app, onLogin, onHelp, onAbout, onDialogChange }: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  const [legacyOpen,setLegacyOpen]=useState(false);
  const [backupOpen,setBackupOpen]=useState(false);
  useEffect(()=>{onDialogChange(logoutOpen||!!conflict||legacyOpen||backupOpen);return()=>onDialogChange(false);},[logoutOpen,conflict,legacyOpen,backupOpen,onDialogChange]);
  const picker = useRef<HTMLInputElement>(null);
  const busy = !!running || app.busy;

  async function run(name: string, operation: () => Promise<unknown>) {
    if (busy) return;
    setError('');
    setRunning(name);
    try { await operation(); }
    catch (value) { setError(value instanceof Error ? value.message : '操作未完成，请重试。'); }
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
      : app.sync.pendingChanges ? `${app.sync.pendingChanges} 项待同步` : '已同步';
  const statusColor = !app.sync.connected ? 'default' : app.sync.status === 'error' || app.sync.status === 'offline'
    ? 'warning' : app.sync.status === 'syncing' || app.sync.pendingChanges ? 'primary' : 'success';

  return <Stack spacing={3} sx={{ maxWidth: 800, mx: 'auto', pb: 4 }}>
    <Typography component="h1" variant="h4">设置</Typography>
    {error && !logoutOpen && !conflict && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography component="h2" variant="h6" sx={{ mb: 2 }}>外观</Typography>
      <ToggleButtonGroup value={app.theme} exclusive fullWidth disabled={busy}
        aria-label="颜色主题" onChange={(_event, value: ThemePreference | null) => {
          if (value) { try { app.setTheme(value); } catch (issue) { app.report(issue); } }
        }}>
        <ToggleButton value="system">跟随系统</ToggleButton>
        <ToggleButton value="light">浅色</ToggleButton>
        <ToggleButton value="dark">深色</ToggleButton>
      </ToggleButtonGroup>
    </Paper>

    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
        <Typography component="h2" variant="h6">账号与同步</Typography>
        <Chip label={status} color={statusColor} size="small" />
      </Stack>
      {app.sync.connected ? <>
        <Typography sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{app.username}</Typography>
        {!!app.email&&<Typography variant="body2" color="text.secondary" sx={{mt:.5,overflowWrap:'anywhere'}}>{app.email}</Typography>}
        <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>
          {app.sync.lastSyncedAt ? `上次同步 ${date(app.sync.lastSyncedAt)}` : '通知和办理进度会自动同步。'}
        </Typography>
        {app.sync.error && <Alert severity="warning" sx={{ mt: 2 }}>{app.sync.error}</Alert>}
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 2 }}>
          <Button variant="contained" disabled={busy || app.sync.status === 'syncing'}
            startIcon={running === 'sync' || app.sync.status === 'syncing' ? <CircularProgress size={18} color="inherit" /> : undefined}
            onClick={() => void run('sync', syncNow)}>立即同步</Button>
          <Button variant="outlined" disabled={busy} onClick={() => { setError(''); setLogoutOpen(true); }}>退出登录</Button>
          {app.authOptions?.emailEnabled&&!app.email&&<Button variant="outlined" disabled={busy} onClick={onLogin}>绑定邮箱</Button>}
        </Stack>
      </> : <>
        <Typography color="text.secondary">登录后，手机和网页可以共用通知与进度。</Typography>
        <Button variant="contained" disabled={busy || !app.auth} onClick={onLogin} sx={{ mt: 2 }}>登录</Button>
      </>}
      {!!app.sync.conflicts.length && <Box sx={{ mt: 3 }}>
        <Divider sx={{ mb: 2 }} />
        <Typography sx={{ fontWeight: 650 }}>有 {app.sync.conflicts.length} 条通知需要选择版本</Typography>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {app.sync.conflicts.map(item => <Button key={item.id} variant="outlined" disabled={busy}
            sx={{ justifyContent: 'space-between', textAlign: 'left' }} onClick={() => { setError(''); setConflict(item); }}>
            <span>{item.local?.title || item.remote?.title || '已删除的通知'}</span><span>选择版本</span>
          </Button>)}
        </Stack>
      </Box>}
    </Paper>

    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography component="h2" variant="h6" sx={{ mb: 2 }}>数据与示例</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
        <Button variant="outlined" disabled={busy}
          onClick={() => app.notices.some(notice=>notice.attachments.length)?setBackupOpen(true):void run('backup', () => app.backup(false))}>{running === 'backup' ? '正在导出…' : '导出备份'}</Button>
        <Button variant="outlined" disabled={busy} onClick={() => picker.current?.click()}>
          {running === 'import' ? '正在导入…' : '导入备份'}</Button>
        <Button variant="outlined" disabled={busy}
          onClick={() => void run('examples', app.loadExamples)}>{running === 'examples' ? '正在载入…' : '载入示例'}</Button>
      </Stack>
      <input ref={picker} type="file" accept="application/json,.json" hidden aria-label="选择通知备份"
        onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) void run('import', () => app.importBackup(file));
        }} />
      <Typography variant="body2" color="text.secondary" sx={{mt:2}}>通知先保存在本机，登录后文字与进度自动同步；附件留在当前设备。</Typography>
      {!!app.legacyWork.text&&<Button sx={{mt:2}} onClick={()=>setLegacyOpen(true)}>查看旧版未保存编辑</Button>}
    </Paper>

    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
      <Button onClick={onHelp}>帮助</Button>
      <Button onClick={onAbout}>关于</Button>
    </Stack>

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
