import {createTheme,alpha} from '@mui/material/styles';
import type {NativeTheme} from '../platform';
export type ThemePreference='system'|'light'|'dark';

// Material roles: readable neutral surfaces, dynamic accents on Android.
export function makeTheme(dark:boolean,native:NativeTheme|null){
 const system=native?.dark===dark?native:null;
 const primary=system?.primary||(dark?'#91D9C3':'#006B60');
 const onPrimary=system?.onPrimary||(dark?'#073B35':'#FFFFFF');
 const text=dark?'#F1F3F6':'#202B36';
 const outline=dark?'#8391A2':'#84909A';
 // Native accents stay personal; reading surfaces stay neutral in both modes.
 const surface=dark?'#1D232D':'#FFFFFF';
 const divider=dark?'#3C4756':'#DDE3E8';
 const settle='cubic-bezier(.22,1,.36,1)';
 return createTheme({
  palette:{mode:dark?'dark':'light',primary:{main:primary,contrastText:onPrimary},secondary:{main:system?.secondary||(dark?'#C5BDEA':'#6650A4')},
   background:{default:dark?'#12161D':'#F6F8FA',paper:surface},
   text:{primary:text,secondary:dark?'#B8C3D1':'#5C6976'},divider,
   action:{hover:alpha(text,dark?.055:.04),selected:alpha(primary,dark?.14:.10)},
   error:{main:dark?'#F1B0A8':'#BA1A1A'},warning:{main:dark?'#E7C48D':'#805500'},success:{main:dark?'#9DD6B4':'#276B3A'},info:{main:dark?'#9DCAFF':'#215D9C'}},
  typography:{fontFamily:'"Noto Sans SC", "Noto Sans CJK SC", system-ui, -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif',fontSize:14,
   h4:{fontSize:'1.875rem',lineHeight:1.3,fontWeight:750,letterSpacing:'-.02em'},
   h5:{fontSize:'1.5rem',lineHeight:1.4,fontWeight:700},
   h6:{fontSize:'1.125rem',lineHeight:1.5,fontWeight:650},
   subtitle1:{fontSize:'1rem',lineHeight:1.5,fontWeight:600},
   body1:{fontSize:'1rem',lineHeight:1.6},body2:{fontSize:'.875rem',lineHeight:1.6},
   caption:{fontSize:'.75rem',lineHeight:1.5},button:{fontSize:'.875rem',lineHeight:1.4,fontWeight:600,textTransform:'none'}},
  shape:{borderRadius:16},
  transitions:{easing:{easeInOut:'cubic-bezier(.4,0,.2,1)',easeOut:settle},duration:{shortest:160,shorter:240,short:320,standard:440,complex:560,enteringScreen:480,leavingScreen:320}},
  components:{
   MuiPaper:{defaultProps:{elevation:0},styleOverrides:{root:{backgroundImage:'none'},outlined:{borderColor:divider,boxShadow:`0 1px 2px ${alpha(dark?'#000000':'#263746',.025)}`}}},
   MuiButton:{defaultProps:{disableElevation:true},styleOverrides:{root:{borderRadius:24,minHeight:48,padding:'10px 18px',transition:`background-color 300ms ease, border-color 300ms ease, color 300ms ease, box-shadow 400ms ease, transform 480ms ${settle}`,'@media (prefers-reduced-motion:no-preference)':{'&:active:not(.Mui-disabled)':{transform:'scale(.97)',transitionDuration:'100ms'}},'@media (hover:hover) and (prefers-reduced-motion:no-preference)':{'&:hover:not(:active)':{transform:'translateY(-1px)'}}},sizeSmall:{padding:'8px 12px'},outlined:{borderColor:outline},text:{padding:'8px 12px'}}},
   MuiIconButton:{styleOverrides:{root:{width:48,height:48,flexShrink:0,transition:`background-color 300ms ease, color 300ms ease, transform 480ms ${settle}`,'@media (prefers-reduced-motion:no-preference)':{'&:active:not(.Mui-disabled)':{transform:'scale(.91)',transitionDuration:'100ms'}}},sizeSmall:{width:48,height:48}}},
   MuiTextField:{defaultProps:{variant:'outlined',fullWidth:true}},
   MuiOutlinedInput:{styleOverrides:{root:{borderRadius:12,fontSize:16,backgroundColor:dark?'#151B24':'#FCFDFE','& .MuiOutlinedInput-notchedOutline':{borderColor:divider},'&:hover .MuiOutlinedInput-notchedOutline':{borderColor:outline},'&.Mui-focused .MuiOutlinedInput-notchedOutline':{borderColor:primary},'&.Mui-error .MuiOutlinedInput-notchedOutline':{borderColor:dark?'#F1B0A8':'#BA1A1A'},'&.MuiInputBase-sizeSmall input':{padding:'12px 14px'}}}},
   MuiDialog:{defaultProps:{maxWidth:'sm',fullWidth:true,transitionDuration:{enter:440,exit:300}},styleOverrides:{paper:{borderRadius:24,margin:16,maxHeight:'calc(100% - 32px)','@media (max-width:599.95px)':{margin:8,width:'calc(100% - 16px)',maxHeight:'calc(100% - 16px)',borderRadius:20}}}},
   MuiDialogTitle:{styleOverrides:{root:{fontSize:'1.5rem',lineHeight:1.4,fontWeight:700,overflowWrap:'anywhere','@media (max-width:599.95px)':{padding:'20px 16px 12px'}}}},
   MuiDialogContent:{styleOverrides:{root:{overflowWrap:'anywhere','@media (max-width:599.95px)':{paddingLeft:16,paddingRight:16}}}},
   MuiDialogActions:{styleOverrides:{root:{padding:'12px 24px 20px','@media (max-width:599.95px)':{padding:'12px 16px 16px'}}}},
   MuiTabs:{styleOverrides:{root:{minHeight:48},indicator:{height:3,borderRadius:3}}},
   MuiTab:{styleOverrides:{root:{textTransform:'none',minHeight:48,fontSize:14,fontWeight:600}}},
   MuiChip:{styleOverrides:{root:{borderRadius:8,fontWeight:600,maxWidth:'100%','&.MuiChip-sizeSmall .MuiChip-label':{padding:'4px 10px'}},label:{fontSize:13,whiteSpace:'normal'},sizeSmall:{height:'auto',minHeight:28}}},
   MuiCheckbox:{styleOverrides:{root:{padding:12,width:48,height:48,flexShrink:0}}},
   MuiSnackbarContent:{styleOverrides:{root:{borderRadius:12,boxShadow:'0 4px 16px rgba(0,0,0,.14)',backgroundColor:dark?'#E3E6EB':'#293138',color:dark?'#222930':'#F2F5F7',lineHeight:1.5}}},
   MuiAccordion:{styleOverrides:{root:{boxShadow:'none',background:'transparent','&:before':{display:'none'}}}},
   MuiMenu:{defaultProps:{transitionDuration:{enter:420,exit:280}},styleOverrides:{paper:{borderRadius:14,border:`1px solid ${divider}`,backgroundColor:dark?'#252D39':surface,boxShadow:`0 8px 32px ${alpha('#000000',dark?.28:.12)}`}}},
   MuiMenuItem:{styleOverrides:{root:{minHeight:44,fontSize:15,lineHeight:1.5}}},
   MuiTooltip:{defaultProps:{enterDelay:400}}
  }
 });
}
