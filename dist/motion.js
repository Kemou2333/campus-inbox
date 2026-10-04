(()=>{
'use strict';
// Native height interpolation is used when available; the same disclosure behavior
// remains smooth on browsers that do not animate ::details-content yet.
if(globalThis.CSS?.supports('interpolate-size','allow-keywords')&&CSS.supports('transition-behavior','allow-discrete')&&CSS.supports('selector(::details-content)'))return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),states=new WeakMap(),active=new Set();
function settle(detail,state){
 if(states.get(detail)!==state)return;
 state.animation?.cancel();detail.open=state.expanded;
 state.body.hidden=!state.expanded;state.body.style.removeProperty('height');state.body.style.removeProperty('opacity');
 detail.removeAttribute('data-motion-expanded');active.delete(detail);states.delete(detail);
}
function toggle(detail){
 let body=detail.querySelector(':scope > .disclosure-motion-body');
 if(!body){
  body=document.createElement('div');body.className='disclosure-motion-body';
  const summary=detail.querySelector(':scope > summary');
  for(const node of [...detail.childNodes])if(node!==summary)body.append(node);
  detail.append(body);detail.dataset.motion='script';body.hidden=!detail.open;
 }
 const previous=states.get(detail),expanded=previous?!previous.expanded:!detail.open;
 const currentHeight=body.hidden?0:body.getBoundingClientRect().height,currentOpacity=body.hidden?0:parseFloat(getComputedStyle(body).opacity)||0;
 previous?.animation?.cancel();detail.open=true;body.hidden=false;body.style.height='auto';body.style.opacity=expanded?'1':'0';
 const targetHeight=expanded?body.getBoundingClientRect().height:0,state={body,expanded,animation:null};
 states.set(detail,state);detail.dataset.motionExpanded=String(expanded);active.add(detail);
 if(reduced.matches||!body.animate){settle(detail,state);return;}
 body.style.height=targetHeight+'px';
 state.animation=body.animate([{height:currentHeight+'px',opacity:currentOpacity},{height:targetHeight+'px',opacity:expanded?1:0}],{duration:480,easing:'cubic-bezier(.22,.75,.2,1)',fill:'both'});
 state.animation.finished.then(()=>settle(detail,state)).catch(()=>{});
}
document.addEventListener('click',event=>{
 const summary=event.target.closest?.('summary');
 if(!summary||!summary.parentElement.matches('.task-extra,.notice-more'))return;
 if(event.target.closest('a,button,input,textarea,select'))return;
 event.preventDefault();toggle(summary.parentElement);
});
reduced.addEventListener?.('change',()=>{if(reduced.matches)for(const detail of [...active])settle(detail,states.get(detail));});
})();
