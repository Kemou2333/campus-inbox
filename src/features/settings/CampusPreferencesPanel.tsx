import {useEffect, useRef, useState} from 'react';
import {Accordion, AccordionDetails, AccordionSummary, Alert, Button, Chip, Stack, TextField, Typography} from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import {CAMPUS_ROLES, parseCampusPreferences, type CampusPreferences, type CampusRole} from '../../domain/campus-preferences';

interface Props {value: CampusPreferences; onSave: (value: CampusPreferences) => void; disabled?: boolean; initiallyExpanded?: boolean}

export function CampusPreferencesPanel({value, onSave, disabled = false, initiallyExpanded = false}: Props) {
  const [entryYear, setEntryYear] = useState(value.profile.entryYear?.toString() ?? '');
  const [major, setMajor] = useState(value.profile.major);
  const [roles, setRoles] = useState<CampusRole[]>(value.profile.roles);
  const [weekOneMonday, setWeekOneMonday] = useState(value.weekOneMonday);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const summary = [value.profile.entryYear ? `${value.profile.entryYear}级` : '', value.profile.major,
    ...CAMPUS_ROLES.filter(role => value.profile.roles.includes(role.value)).map(role => role.label),
    value.weekOneMonday ? '教学周已设置' : ''].filter(Boolean).join(' · ');
  useEffect(() => {
    setEntryYear(value.profile.entryYear?.toString() ?? ''); setMajor(value.profile.major);
    setRoles(value.profile.roles); setWeekOneMonday(value.weekOneMonday);
  }, [value]);
  useEffect(() => {
    if (!initiallyExpanded) return;
    const frame = requestAnimationFrame(() => panel.current?.scrollIntoView({block: 'start', behavior: 'instant'}));
    return () => cancelAnimationFrame(frame);
  }, [initiallyExpanded]);
  function edited() {setSaved(false); setError('');}
  function toggleRole(role: CampusRole) {
    edited();
    setRoles(current => current.includes(role) ? current.filter(v => v !== role)
      : [...current.filter(v => !(role === 'undergraduate' && v === 'postgraduate') && !(role === 'postgraduate' && v === 'undergraduate')), role]);
  }
  function save() {
    try {
      if (entryYear && !/^20\d{2}$/.test(entryYear)) throw new Error('入学年份请填写四位数字');
      const next = parseCampusPreferences({profile: {entryYear: entryYear ? Number(entryYear) : null, major, roles}, weekOneMonday});
      onSave(next); setSaved(true); setError('');
    } catch (issue) {setError(issue instanceof Error ? issue.message : '暂未保存，请重试。');}
  }
  return <Accordion ref={panel} variant="outlined" disableGutters defaultExpanded={initiallyExpanded} sx={{scrollMarginTop: '80px', '&:before': {display: 'none'}, borderRadius: '16px!important'}}>
    <AccordionSummary expandIcon={<ExpandMore/>} aria-controls="campus-preferences-content" id="campus-preferences-heading" sx={{px: {xs: 2, sm: 3}, py: 1}}>
      <Stack spacing={.5} sx={{minWidth: 0}}>
        <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}><Typography component="h2" variant="h6">校园设置</Typography><Typography variant="body2" color="text.secondary">可选</Typography></Stack>
        <Typography variant="body2" color="text.secondary" sx={{overflowWrap: 'anywhere'}}>{summary || '年级、专业、身份与教学周'}</Typography>
      </Stack>
    </AccordionSummary>
    <AccordionDetails sx={{px: {xs: 2, sm: 3}, pb: {xs: 2, sm: 3}}}>
    <Typography variant="body2" color="text.secondary" sx={{mt: .5, mb: 2}}>可选，仅存此设备，不发送给 AI。</Typography>
    <Stack spacing={2}>
      <Stack direction={{xs: 'column', sm: 'row'}} spacing={2}>
        <TextField label="入学年份" placeholder="如 2026" value={entryYear} disabled={disabled}
          slotProps={{htmlInput: {inputMode: 'numeric', maxLength: 4}}}
          onChange={event => {edited(); setEntryYear(event.target.value);}} sx={{flex: 1}}/>
        <TextField label="专业" placeholder="如 计算机科学与技术" value={major} disabled={disabled}
          slotProps={{htmlInput: {maxLength: 24}}} onChange={event => {edited(); setMajor(event.target.value);}} sx={{flex: 2}}/>
      </Stack>
      <Stack direction="row" sx={{gap: 1, flexWrap: 'wrap'}} aria-label="身份">
        {CAMPUS_ROLES.map(role => <Chip key={role.value} label={role.label} disabled={disabled}
          color={roles.includes(role.value) ? 'primary' : 'default'} variant={roles.includes(role.value) ? 'filled' : 'outlined'}
          onClick={() => toggleRole(role.value)} aria-pressed={roles.includes(role.value)}/>)}
      </Stack>
      <Typography variant="body2" color="text.secondary">条件不明的通知仍保留，可在列表筛选。</Typography>
      <TextField label="学期第一周周一" type="date" value={weekOneMonday} disabled={disabled}
        slotProps={{inputLabel: {shrink: true}, htmlInput: {min: '2000-01-01', max: '2100-12-31'}}}
        onChange={event => {edited(); setWeekOneMonday(event.target.value);}}
        helperText="用于换算教学周日期，请按校历填写。"/>
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Typography role="status" variant="body2" color="success.main">已保存</Typography>}
      <Stack direction="row" spacing={1}>
        <Button variant="contained" disabled={disabled} onClick={save}>保存</Button>
        <Button disabled={disabled} onClick={() => {edited(); setEntryYear(''); setMajor(''); setRoles([]); setWeekOneMonday('');}}>清空</Button>
      </Stack>
    </Stack>
    </AccordionDetails>
  </Accordion>;
}
