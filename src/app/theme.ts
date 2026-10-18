import {createTheme,alpha} from '@mui/material/styles';
import type {NativeTheme} from '../platform';
export type ThemePreference='system'|'light'|'dark';

// Material roles: readable neutral surfaces, dynamic accents on Android.
export function makeTheme(dark:boolean,native:NativeTheme|null){
 const system=native?.dark===dark?native:null;
 const primary=system?.primary||(dark?'#8BDACB':'#006B60');
 const onPrimary=system?.onPrimary||(dark?'#073B35':'#FFFFFF');
 const text=dark?'#F1F6F7':'#1D302E';
 const outline=dark?'#758D96':'#84909A';
 return createTheme({
  palette:{mode:dark?'dark':'light',primary:{main:primary,contrastText:onPrimary},secondary:{main:system?.secondary||(dark?'#C5BDEA':'#6650A4')},
   background:{default:dark?'#111C1F':'#F5F8F6',paper:dark?'#1B292D':'#FFFFFF'},
   text:{primary:text,secondary:dark?'#B9CBCB':'#5C6F6B'},divider:dark?'#35494D':'#D9E4E0',
   action:{hover:alpha(primary,dark?.08:.06),selected:alpha(primary,dark?.15:.12)},
   error:{main:dark?'#F1B0A8':'#BA1A1A'},warning:{main:dark?'#E7C48D':'#805500'},success:{main:dark?'#9DD6B4':'#276B3A'},info:{main:dark?'#9DCAFF':'#215D9C'}},
  typography:{fontFamily:'"Noto Sans SC", "Noto Sans CJK SC", system-ui, -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif',fontSize:14,
   h4:{fontSize:'1.75rem',lineHeight:1.3,fontWeight:650,letterSpacing:'-.02em'},
   h5:{fontSize:'1.375rem',lineHeight:1.4,fontWeight:650},
   h6:{fontSize:'1.125rem',lineHeight:1.5,fontWeight:600},
   subtitle1:{fontSize:'1rem',lineHeight:1.5,fontWeight:600},
   body1:{fontSize:'1rem',lineHeight:1.6},body2:{fontSize:'.875rem',lineHeight:1.6},
   caption:{fontSize:'.75rem',lineHeight:1.5},button:{fontSize:'.875rem',lineHeight:1.4,fontWeight:600,textTransform:'none'}},
  shape:{borderRadius:16},
  transitions:{easing:{easeInOut:'cubic-bezier(.3,0,.15,1)',easeOut:'cubic-bezier(.16,1,.3,1)'},duration:{shortest:160,shorter:220,short:300,standard:360,complex:440,enteringScreen:360,leavingScreen:280}},
  components:{
   MuiPaper:{defaultProps:{elevation:0},styleOverrides:{root:{backgroundImage:'none'},outlined:{borderColor:dark?'#35494D':'#D9E4E0',boxShadow:`0 1px 2px ${alpha(dark?'#000000':'#26463E',.025)}`}}},
   MuiButton:{defaultProps:{disableElevation:true},styleOverrides:{root:{borderRadius:24,minHeight:48,padding:'10px 18px',transition:'background-color .24s ease, border-color .24s ease, color .24s ease, box-shadow .24s ease, transform .24s cubic-bezier(.16,1,.3,1)','@media (hover:hover) and (prefers-reduced-motion:no-preference)':{'&:hover':{transform:'translateY(-1px)'},'&:active':{transform:'translateY(0)'}}},sizeSmall:{padding:'8px 12px'},outlined:{borderColor:outline},text:{padding:'8px 12px'}}},
   MuiIconButton:{styleOverrides:{root:{width:48,height:48,flexShrink:0},sizeSmall:{width:48,height:48}}},
   MuiTextField:{defaultProps:{variant:'outlined',fullWidth:true}},
   MuiOutlinedInput:{styleOverrides:{root:{borderRadius:12,fontSize:16,'&.MuiInputBase-sizeSmall input':{padding:'12px 14px'}}}},
   MuiDialog:{defaultProps:{maxWidth:'sm',fullWidth:true},styleOverrides:{paper:{borderRadius:24,margin:16,maxHeight:'calc(100% - 32px)','@media (max-width:599.95px)':{margin:8,width:'calc(100% - 16px)',maxHeight:'calc(100% - 16px)',borderRadius:20}}}},
   MuiDialogTitle:{styleOverrides:{root:{fontSize:'1.375rem',lineHeight:1.4,fontWeight:650,overflowWrap:'anywhere','@media (max-width:599.95px)':{padding:'20px 16px 12px'}}}},
   MuiDialogContent:{styleOverrides:{root:{overflowWrap:'anywhere','@media (max-width:599.95px)':{paddingLeft:16,paddingRight:16}}}},
   MuiDialogActions:{styleOverrides:{root:{padding:'12px 24px 20px','@media (max-width:599.95px)':{padding:'12px 16px 16px'}}}},
   MuiTabs:{styleOverrides:{root:{minHeight:48},indicator:{height:3,borderRadius:3}}},
   MuiTab:{styleOverrides:{root:{textTransform:'none',minHeight:48,fontSize:14,fontWeight:600}}},
   MuiChip:{styleOverrides:{root:{borderRadius:8,fontWeight:600,maxWidth:'100%','&.MuiChip-sizeSmall .MuiChip-label':{padding:'4px 10px'}},label:{fontSize:13,whiteSpace:'normal'},sizeSmall:{height:'auto',minHeight:28}}},
   MuiCheckbox:{styleOverrides:{root:{padding:12,width:48,height:48,flexShrink:0}}},
   MuiSnackbarContent:{styleOverrides:{root:{borderRadius:12,boxShadow:'0 4px 16px rgba(0,0,0,.14)',backgroundColor:dark?'#E3E6EB':'#293138',color:dark?'#222930':'#F2F5F7',lineHeight:1.5}}},
   MuiAccordion:{styleOverrides:{root:{boxShadow:'none',background:'transparent','&:before':{display:'none'}}}},
   MuiTooltip:{defaultProps:{enterDelay:400}}
  }
 });
}
