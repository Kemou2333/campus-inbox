import {createTheme,alpha} from '@mui/material/styles';
import type {NativeTheme} from '../platform';
export type ThemePreference='system'|'light'|'dark';

// Material roles: readable neutral surfaces, dynamic accents on Android.
export function makeTheme(dark:boolean,native:NativeTheme|null){
 const system=native?.dark===dark?native:null;
 const primary=system?.primary||(dark?'#B1C3FF':'#006B60');
 const onPrimary=system?.onPrimary||(dark?'#102556':'#FFFFFF');
 const text=dark?'#F0F2F7':'#1B2026';
 const outline=dark?'#657083':'#84909A';
 return createTheme({
  palette:{mode:dark?'dark':'light',primary:{main:primary,contrastText:onPrimary},secondary:{main:dark?'#C5BDEA':'#506176'},
   background:{default:dark?'#15171C':'#F7F9FA',paper:dark?'#1E2129':'#FFFFFF'},
   text:{primary:text,secondary:dark?'#AEB6C4':'#58636F'},divider:dark?'#373C48':'#DCE2E7',
   action:{hover:alpha(primary,dark?.08:.06),selected:alpha(primary,dark?.15:.12)},
   error:{main:dark?'#F4AAA7':'#BA1A1A'},warning:{main:dark?'#E9C384':'#805500'},success:{main:dark?'#ACD9B6':'#276B3A'}},
  typography:{fontFamily:'"Noto Sans SC", "Noto Sans CJK SC", system-ui, -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif',fontSize:14,
   h4:{fontSize:'1.75rem',lineHeight:1.3,fontWeight:650,letterSpacing:'-.02em'},
   h5:{fontSize:'1.375rem',lineHeight:1.4,fontWeight:650},
   h6:{fontSize:'1.125rem',lineHeight:1.5,fontWeight:600},
   subtitle1:{fontSize:'1rem',lineHeight:1.5,fontWeight:600},
   body1:{fontSize:'1rem',lineHeight:1.6},body2:{fontSize:'.875rem',lineHeight:1.6},
   caption:{fontSize:'.75rem',lineHeight:1.5},button:{fontSize:'.875rem',lineHeight:1.4,fontWeight:600,textTransform:'none'}},
  shape:{borderRadius:16},
  transitions:{easing:{easeInOut:'cubic-bezier(.2,0,0,1)',easeOut:'cubic-bezier(.2,0,0,1)'},duration:{shortest:120,shorter:160,short:200,standard:260,complex:300,enteringScreen:240,leavingScreen:200}},
  components:{
   MuiPaper:{defaultProps:{elevation:0},styleOverrides:{root:{backgroundImage:'none'},outlined:{borderColor:dark?'#373C48':'#DCE2E7'}}},
   MuiButton:{defaultProps:{disableElevation:true},styleOverrides:{root:{borderRadius:24,minHeight:48,padding:'10px 18px'},sizeSmall:{padding:'8px 12px'},outlined:{borderColor:outline},text:{padding:'8px 12px'}}},
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
