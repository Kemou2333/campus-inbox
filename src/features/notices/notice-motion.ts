import {keyframes} from '@emotion/react';

export const noticeMotion={
 duration:{enter:620,exit:500},
 easing:{enter:'cubic-bezier(.22,1,.36,1)',exit:'cubic-bezier(.65,0,.35,1)'},
 transition:'440ms cubic-bezier(.22,1,.36,1)',
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
