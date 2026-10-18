import {keyframes} from '@emotion/react';

export const noticeMotion={
 duration:{enter:440,exit:360},
 easing:{enter:'cubic-bezier(.22,.75,.25,1)',exit:'cubic-bezier(.4,0,.2,1)'},
 transition:'320ms cubic-bezier(.22,.75,.25,1)',
};

export const favoriteFeedback=keyframes`
 0%{transform:scale(.94) rotate(0deg)}
 45%{transform:scale(1.15) rotate(-8deg)}
 75%{transform:scale(.98) rotate(3deg)}
 100%{transform:scale(1) rotate(0deg)}
`;

export const completeFeedback=keyframes`
 0%{transform:scale(1)}
 35%{transform:scale(.91)}
 70%{transform:scale(1.06)}
 100%{transform:scale(1)}
`;
