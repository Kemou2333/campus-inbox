import {useEffect, useRef, useState} from 'react';
import {Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Stack, TextField, Typography, useMediaQuery} from '@mui/material';
import {alpha} from '@mui/material/styles';
import ExpandMore from '@mui/icons-material/ExpandMore';
import PersonOutline from '@mui/icons-material/PersonOutlined';
import {CAMPUS_ROLES, parseCampusPreferences, type CampusPreferences, type CampusRole} from '../../domain/campus-preferences';

interface Props {value: CampusPreferences; onSave: (value: CampusPreferences) => void; disabled?: boolean; initiallyExpanded?: boolean}

export function CampusPreferencesPanel({value, onSave, disabled = false, initiallyExpanded = false}: Props) {
  const [entryYear, setEntryYear] = useState(value.profile.entryYear?.toString() ?? '');
  const [major, setMajor] = useState(value.profile.major);
  const [roles, setRoles] = useState<CampusRole[]>(value.profile.roles);
  const [weekOneMonday, setWeekOneMonday] = useState(value.weekOneMonday);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [expanded,setExpanded]=useState(initiallyExpanded);
  const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
  const panel = useRef<HTMLDivElement>(null);
  const summary = [value.profile.entryYear ? `${value.profile.entryYear}级` : '', value.profile.major].filter(Boolean).join(' · ')
    || CAMPUS_ROLES.filter(role => value.profile.roles.includes(role.value)).map(role => role.label).join(' · ')
    || (value.weekOneMonday?'教学周已设置':'未设置');
  useEffect(() => {
    setEntryYear(value.profile.entryYear?.toString() ?? ''); setMajor(value.profile.major);
    setRoles(value.profile.roles); setWeekOneMonday(value.weekOneMonday);
  }, [value]);
  useEffect(() => {
    if (!initiallyExpanded) return;
    setExpanded(true);
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
  return <Accordion ref={panel} disableGutters elevation={0} expanded={expanded} onChange={(_event,open)=>setExpanded(open)}
    slotProps={{transition:{timeout:reducedMotion?0:340}}}
    sx={{scrollMarginTop:'80px',bgcolor:'transparent','&:before':{display:'none'},borderTop:'1px solid',borderColor:'divider',borderRadius:'0!important'}}>
    <AccordionSummary expandIcon={<ExpandMore sx={{fontSize:20}}/>} aria-controls="campus-preferences-content" id="campus-preferences-heading"
      sx={{px:{xs:2,sm:2.5},minHeight:66,'& .MuiAccordionSummary-content':{alignItems:'center',gap:1.25,my:1.5}}}>
      <Box sx={{width:30,height:30,borderRadius:'9px',display:'grid',placeItems:'center',flexShrink:0,color:'primary.main',bgcolor:theme=>alpha(theme.palette.primary.main,.09)}}><PersonOutline sx={{fontSize:18}}/></Box>
      <Typography component="span" sx={{fontSize:17,fontWeight:650,flex:1,minWidth:0}}>校园信息</Typography>
      <Typography sx={{fontSize:14,color:'text.secondary',maxWidth:{xs:135,sm:260},textAlign:'right',overflowWrap:'anywhere',lineHeight:1.6,pr:.5}}>{summary}</Typography>
    </AccordionSummary>
    <AccordionDetails sx={{px:{xs:2,sm:2.5},pt:0,pb:2.5}}>
    <Stack spacing={1.5}>
      <Typography sx={{fontSize:14,fontWeight:650,color:'text.secondary'}}>我的身份</Typography>
      <Stack direction="row" spacing={1.25}>
        <TextField label="入学年份" placeholder="如 2026" value={entryYear} disabled={disabled} size="small"
          slotProps={{htmlInput: {inputMode: 'numeric', maxLength: 4}}}
          onChange={event => {edited(); setEntryYear(event.target.value);}} sx={{flex:1,minWidth:0}}/>
        <TextField label="专业" placeholder="如 计算机" value={major} disabled={disabled} size="small"
          slotProps={{htmlInput: {maxLength: 24}}} onChange={event => {edited(); setMajor(event.target.value);}} sx={{flex:1.7,minWidth:0}}/>
      </Stack>
      <Stack direction="row" sx={{gap: 1, flexWrap: 'wrap'}} aria-label="身份">
        {CAMPUS_ROLES.map(role => <Chip key={role.value} label={role.label} disabled={disabled} size="small" sx={{fontSize:14}}
          color={roles.includes(role.value) ? 'primary' : 'default'} variant={roles.includes(role.value) ? 'filled' : 'outlined'}
          onClick={() => toggleRole(role.value)} aria-pressed={roles.includes(role.value)}/>)}
      </Stack>
      <Typography sx={{fontSize:14,fontWeight:650,color:'text.secondary',pt:1}}>教学周</Typography>
      <TextField label="第一周周一" type="date" value={weekOneMonday} disabled={disabled} size="small"
        slotProps={{inputLabel: {shrink: true}, htmlInput: {min: '2000-01-01', max: '2100-12-31'}}}
        onChange={event => {edited(); setWeekOneMonday(event.target.value);}}
        helperText="按校历填写"/>
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Typography role="status" variant="body2" color="success.main">已保存</Typography>}
      <Stack direction="row" spacing={1} sx={{alignItems:'center',flexWrap:'wrap',rowGap:1}}>
        <Button variant="contained" size="small" disabled={disabled} onClick={save}>保存</Button>
        <Button disabled={disabled} onClick={() => {edited(); setEntryYear(''); setMajor(''); setRoles([]); setWeekOneMonday('');}}>清空</Button>
        <Typography variant="caption" color="text.secondary" sx={{ml:'auto!important',fontSize:14}}>仅保存在此设备</Typography>
      </Stack>
    </Stack>
    </AccordionDetails>
  </Accordion>;
}
