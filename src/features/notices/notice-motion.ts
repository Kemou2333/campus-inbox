import {useMemo} from 'react';
import {keyframes} from '@emotion/react';
import {useTheme,type Theme} from '@mui/material/styles';
import {readMotionPreferences,useMotionPreferences,type MotionSpeed} from '../../shared/motion-preferences';

const originalDuration=new WeakMap<Theme,Theme['transitions']['getAutoHeightDuration']>();
/** Keep short sections quick and let taller content have a natural transition. */
export function withNoticeMotion(theme:Theme,speed:MotionSpeed):Theme{
 const base=originalDuration.get(theme)??theme.transitions.getAutoHeightDuration;
 const adjusted={...theme,transitions:{...theme.transitions,getAutoHeightDuration:(height:number)=>height<=0?0:Math.round(Math.min(620,base(height))/speed)}};
 originalDuration.set(adjusted,base);return adjusted;
}
export function useNoticeMotionTheme(){
 const theme=useTheme(),preferences=useMotionPreferences();
 return useMemo(()=>withNoticeMotion(theme,preferences.notice),[theme,preferences.notice]);
}

export const noticeMotion={
 duration:'auto' as const,
 easing:{enter:'cubic-bezier(.3,0,.2,1)',exit:'cubic-bezier(.4,0,.3,1)'},
 get transition(){return `${Math.round(460/readMotionPreferences().notice)}ms cubic-bezier(.3,0,.2,1)`;},
};

export const favoriteFeedback=keyframes`
 0%{transform:scale(.94) rotate(0deg)}
 45%{transform:scale(1.15) rotate(-8deg)}
 75%{transform:scale(.98) rotate(3deg)}
 100%{transform:scale(1) rotate(0deg)}
`;

export const completeFeedback=keyframes`
 0%{transform:scale(1)}
 18%{transform:scale(.86)}
 48%{transform:scale(1.19)}
 78%{transform:scale(.98)}
 100%{transform:scale(1)}
`;
