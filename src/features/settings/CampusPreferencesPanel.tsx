import {useEffect,useRef,useState} from 'react';
import {Accordion,AccordionDetails,AccordionSummary,Alert,Box,Button,Chip,Stack,TextField,Typography,useMediaQuery} from '@mui/material';
import {alpha} from '@mui/material/styles';
import ExpandMore from '@mui/icons-material/ExpandMore';
import PersonOutline from '@mui/icons-material/PersonOutlined';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import {CAMPUS_ROLES,hasProfile,parseCampusPreferences,type CampusPreferences,type CampusRole} from '../../domain/campus-preferences';

interface Props {
  value:CampusPreferences;
  onSave:(value:CampusPreferences)=>void;
  disabled?:boolean;
  initiallyExpanded?:boolean;
  onApplyFilter?:(enabled:boolean)=>void;
}
const panelStyle={scrollMarginTop:'80px',bgcolor:'transparent','&:before':{display:'none'},borderTop:'1px solid',borderColor:'divider',borderRadius:'0!important'} as const;
const summaryStyle={px:{xs:2,sm:2.5},minHeight:92,'& .MuiAccordionSummary-content':{alignItems:'center',gap:1.25,my:1.5}} as const;
const iconStyle={width:34,height:34,borderRadius:'10px',display:'grid',placeItems:'center',flexShrink:0,color:'text.secondary',bgcolor:'action.hover'} as const;
const fieldStyle={'& .MuiInputLabel-root':{fontSize:15},'& .MuiInputBase-input':{fontSize:16},'& .MuiFormHelperText-root':{fontSize:15}} as const;

/** Profile and teaching calendar remain device-only preferences, outside every AI request. */
export function CampusPreferencesPanel({value,onSave,disabled=false,initiallyExpanded=false,onApplyFilter}:Props) {
  const [entryYear,setEntryYear]=useState(value.profile.entryYear?.toString()??'');
  const [major,setMajor]=useState(value.profile.major);
  const [roles,setRoles]=useState<CampusRole[]>(value.profile.roles);
  const [error,setError]=useState(''),[saved,setSaved]=useState(false);
  const [expanded,setExpanded]=useState(initiallyExpanded);
  const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
  const panel=useRef<HTMLDivElement>(null);
  const summary=[value.profile.entryYear?`${value.profile.entryYear}级`:'',value.profile.major,
    ...CAMPUS_ROLES.filter(role=>value.profile.roles.includes(role.value)).map(role=>role.label)].filter(Boolean).join(' · ');
  const savedRoles=value.profile.roles.join('|');
  useEffect(()=>{
    setEntryYear(value.profile.entryYear?.toString()??'');setMajor(value.profile.major);setRoles(value.profile.roles);
  },[value.profile.entryYear,value.profile.major,savedRoles]);
  useEffect(()=>{
    if(!initiallyExpanded)return;
    setExpanded(true);
    const frame=requestAnimationFrame(()=>panel.current?.scrollIntoView({block:'start',behavior:'instant'}));
    return()=>cancelAnimationFrame(frame);
  },[initiallyExpanded]);
  function edited(){setSaved(false);setError('');}
  function toggleRole(role:CampusRole){
    edited();
    setRoles(current=>current.includes(role)?current.filter(v=>v!==role)
      :[...current.filter(v=>!(role==='undergraduate'&&v==='postgraduate')&&!(role==='postgraduate'&&v==='undergraduate')),role]);
  }
  function save(){
    try{
      const year=entryYear.trim();
      if(year&&!/^(?:20\d{2}|2100)$/.test(year))throw new Error('入学年份填四位数字，如 2026。');
      // Saving profile must preserve the independently configured teaching calendar.
      const next=parseCampusPreferences({...value,profile:{entryYear:year?Number(year):null,major,roles}});
      onSave(next);setSaved(true);setError('');onApplyFilter?.(hasProfile(next.profile));
    }catch(issue){setError(issue instanceof Error?issue.message:'暂未保存，请重试。');}
  }
  return <Accordion ref={panel} disableGutters elevation={0} expanded={expanded} onChange={(_event,open)=>setExpanded(open)}
    slotProps={{transition:{timeout:reducedMotion?0:380}}} sx={panelStyle}>
    <AccordionSummary expandIcon={<ExpandMore sx={{fontSize:20}}/>} aria-controls="campus-preferences-content" id="campus-preferences-heading" sx={summaryStyle}>
      <Box sx={iconStyle}><PersonOutline sx={{fontSize:21}}/></Box>
      <Box sx={{flex:1,minWidth:0}}>
        <Typography component="span" sx={{display:'block',fontSize:18,fontWeight:650,lineHeight:1.5}}>通知筛选</Typography>
        <Typography sx={{mt:.35,fontSize:15,color:'text.secondary',lineHeight:1.65,overflowWrap:'anywhere'}}>{summary||'设置年级、专业，筛选适用通知'}</Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{px:{xs:2,sm:2.5},pt:0,pb:2.5}}>
      <Stack spacing={1.75}>
        <Stack direction="row" spacing={1.25}>
          <TextField label="入学年份" placeholder="如 2026" value={entryYear} disabled={disabled} size="small"
            slotProps={{htmlInput:{inputMode:'numeric',maxLength:4}}}
            onChange={event=>{edited();setEntryYear(event.target.value);}} sx={{...fieldStyle,flex:1,minWidth:0}}/>
          <TextField label="专业" placeholder="如 软件工程" value={major} disabled={disabled} size="small"
            slotProps={{htmlInput:{maxLength:24}}} onChange={event=>{edited();setMajor(event.target.value);}} sx={{...fieldStyle,flex:1.7,minWidth:0}}/>
        </Stack>
        <Box>
          <Typography sx={{fontSize:15,fontWeight:550,color:'text.secondary',mb:.8}}>身份</Typography>
          <Stack direction="row" sx={{gap:1,flexWrap:'wrap'}} aria-label="身份">
            {CAMPUS_ROLES.map(role=><Chip key={role.value} label={role.label} disabled={disabled} size="medium" variant="outlined"
              sx={{fontSize:15,'& .MuiChip-label':{fontSize:15},color:roles.includes(role.value)?'info.main':'text.secondary',
                borderColor:roles.includes(role.value)?'info.main':'divider',bgcolor:theme=>roles.includes(role.value)?alpha(theme.palette.info.main,.09):'transparent'}}
              onClick={()=>toggleRole(role.value)} aria-pressed={roles.includes(role.value)}/>)}
          </Stack>
        </Box>
        <Typography sx={{fontSize:15,color:'text.secondary',lineHeight:1.75}}>条件不明的通知仍会保留。</Typography>
        {error&&<Alert severity="error" sx={{fontSize:15}}>{error}</Alert>}
        {saved&&<Typography role="status" sx={{fontSize:14,color:'success.main'}}>已保存</Typography>}
        <Stack direction="row" spacing={1.5} sx={{alignItems:'center',flexWrap:'wrap',rowGap:1}}>
          <Button variant="contained" size="small" disabled={disabled} onClick={save} sx={{fontSize:16}}>保存并筛选</Button>
          <Button disabled={disabled} color="inherit" sx={{fontSize:15,color:'text.secondary'}} onClick={()=>{edited();setEntryYear('');setMajor('');setRoles([]);}}>清空</Button>
        </Stack>
      </Stack>
    </AccordionDetails>
  </Accordion>;
}

/** A separate low-frequency setting; saving it never clears or changes profile filters. */
export function TeachingWeekPanel({value,onSave,disabled=false}:Pick<Props,'value'|'onSave'|'disabled'>) {
  const [weekOneMonday,setWeekOneMonday]=useState(value.weekOneMonday);
  const [error,setError]=useState(''),[saved,setSaved]=useState(false);
  const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(()=>{setWeekOneMonday(value.weekOneMonday);},[value.weekOneMonday]);
  function save(){
    try{
      // Preserve the latest profile even when only the calendar date has changed.
      const next=parseCampusPreferences({...value,weekOneMonday});
      onSave(next);setSaved(true);setError('');
    }catch(issue){setError(issue instanceof Error?issue.message:'暂未保存，请重试。');}
  }
  return <Accordion disableGutters elevation={0} slotProps={{transition:{timeout:reducedMotion?0:380}}} sx={panelStyle}>
    <AccordionSummary expandIcon={<ExpandMore sx={{fontSize:20}}/>} aria-controls="teaching-week-content" id="teaching-week-heading" sx={summaryStyle}>
      <Box sx={iconStyle}><CalendarMonthOutlined sx={{fontSize:21}}/></Box>
      <Box sx={{flex:1,minWidth:0}}>
        <Typography component="span" sx={{display:'block',fontSize:18,fontWeight:650,lineHeight:1.5}}>教学周换算</Typography>
        <Typography sx={{mt:.35,fontSize:15,color:'text.secondary',lineHeight:1.65}}>{value.weekOneMonday?'校历已设置':'把“第几周”换成日期'}</Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{px:{xs:2,sm:2.5},pt:0,pb:2.5}}>
      <Stack spacing={1.75}>
        <TextField label="第一周周一" type="date" value={weekOneMonday} disabled={disabled} size="small"
          slotProps={{inputLabel:{shrink:true},htmlInput:{min:'2000-01-01',max:'2100-12-31'}}}
          onChange={event=>{setSaved(false);setError('');setWeekOneMonday(event.target.value);}} helperText="按学校校历填写" sx={fieldStyle}/>
        {error&&<Alert severity="error" sx={{fontSize:15}}>{error}</Alert>}
        {saved&&<Typography role="status" sx={{fontSize:14,color:'success.main'}}>教学周已保存</Typography>}
        <Button size="medium" variant="outlined" disabled={disabled} onClick={save} sx={{fontSize:15,alignSelf:'flex-start'}}>保存</Button>
      </Stack>
    </AccordionDetails>
  </Accordion>;
}
