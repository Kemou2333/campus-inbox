import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, InputAdornment, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import type { CampusController } from '../../app/useCampus';

interface Props { open: boolean; app: CampusController; onClose: () => void }
const normalUsername = (value: string) => value.normalize('NFKC').trim().toLowerCase();

export function LoginDialog({ open, app, onClose }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeatedPassword, setRepeatedPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [transferApproved, setTransferApproved] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const differentAccount = !!app.username && normalUsername(username) !== normalUsername(app.username) && app.notices.length > 0;

  useEffect(() => {
    if (!open) { setPassword(''); setRepeatedPassword(''); return; }
    setUsername(app.username); setError(''); setTransferApproved(false); setShowPassword(false);
  }, [open]);

  async function submit() {
    if (working || !app.auth) return;
    setError('');
    if (!username.trim() || !password) { setError('请填写用户名和密码。'); return; }
    if (differentAccount && !transferApproved) { setError('请先确认是否把本机通知同步到这个账号。'); return; }
    if (mode === 'register' && password !== repeatedPassword) { setError('两次输入的密码不一致。'); return; }
    setWorking(true);
    let accountCreated = false;
    try {
      const session = mode === 'register'
        ? await app.auth.register(invite.trim().toUpperCase(), username, password)
        : await app.auth.login(username, password);
      accountCreated = mode === 'register';
      await app.login(session);
      setPassword(''); setRepeatedPassword(''); setInvite(''); onClose();
    } catch (issue) {
      const text = issue instanceof Error ? issue.message : '登录未完成，请重试。';
      if (accountCreated) { setMode('login'); setError(`账号已创建。${text} 可以再尝试登录。`); }
      else setError(text);
    } finally { setWorking(false); }
  }

  return <Dialog open={open} onClose={() => { if (!working) onClose(); }}>
    <DialogTitle>账号</DialogTitle>
    <DialogContent>
      <Tabs value={mode} variant="fullWidth" aria-label="登录或注册" sx={{ mb: 3 }}
        onChange={(_event, value: 'login' | 'register') => { setMode(value); setError(''); setRepeatedPassword(''); }}>
        <Tab value="login" label="登录" disabled={working} />
        <Tab value="register" label="邀请码注册" disabled={working} />
      </Tabs>
      <Box component="form" id="campus-login-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}
          {mode === 'register' && <TextField label="邀请码" required value={invite} disabled={working}
            onChange={event => setInvite(event.target.value.toUpperCase())}
            helperText="8 位邀请码，每个只能注册一次。"
            slotProps={{ htmlInput: { maxLength: 8, autoComplete: 'off', autoCapitalize: 'characters' } }} />}
          <TextField label="用户名" required value={username} disabled={working}
            onChange={event => { setUsername(event.target.value); setTransferApproved(false); }}
            helperText={mode === 'register' ? '3–24 个字；支持中英文、数字、_ 和 -。' : undefined}
            slotProps={{ htmlInput: { maxLength: 24, autoComplete: 'username', autoCapitalize: 'none' } }} />
          <TextField label="密码" required type={showPassword ? 'text' : 'password'} value={password} disabled={working}
            onChange={event => setPassword(event.target.value)} helperText={mode === 'register' ? '8–128 个字符。' : undefined}
            slotProps={{
              htmlInput: { maxLength: 128, autoComplete: mode === 'register' ? 'new-password' : 'current-password' },
              input: { endAdornment: <InputAdornment position="end"><IconButton edge="end" disabled={working}
                aria-label={showPassword ? '隐藏密码' : '显示密码'} onMouseDown={event => event.preventDefault()}
                onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
              </IconButton></InputAdornment> },
            }} />
          {mode === 'register' && <TextField label="再次输入密码" required type={showPassword ? 'text' : 'password'}
            disabled={working} value={repeatedPassword} onChange={event => setRepeatedPassword(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 128, autoComplete: 'new-password' } }} />}
          {differentAccount
            ? <FormControlLabel sx={{ alignItems: 'flex-start', m: 0 }} control={<Checkbox checked={transferApproved}
              disabled={working} onChange={event => setTransferApproved(event.target.checked)} />}
              label="把本机已有通知同步到这个账号" />
            : <Typography variant="body2" color="text.secondary">登录后自动同步通知、进度和笔记。</Typography>}
        </Stack>
      </Box>
    </DialogContent>
    <DialogActions>
      <Button disabled={working} onClick={onClose}>取消</Button>
      <Button type="submit" form="campus-login-form" variant="contained"
        disabled={working || !app.auth || differentAccount && !transferApproved}>
        {working ? '请稍候…' : mode === 'register' ? '注册并登录' : '登录'}
      </Button>
    </DialogActions>
  </Dialog>;
}

export default LoginDialog;
