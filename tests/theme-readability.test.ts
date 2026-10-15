import {expect,test} from 'vitest';
import {getContrastRatio} from '@mui/material/styles';
import {makeTheme} from '../src/app/theme';
// All these roles are used as small labels, never as the only status indicator.
for(const dark of [false,true])test(`semantic labels stay readable on default ${dark?'dark':'light'} surfaces`,()=>{
 const theme=makeTheme(dark,null);
 for(const role of ['primary','secondary','success','warning','error','info'] as const){
  for(const background of [theme.palette.background.paper,theme.palette.background.default])expect(getContrastRatio(theme.palette[role].main,background),`${role} on ${background}`).toBeGreaterThanOrEqual(4.5);
 }
});
