/* A visible rail for a real scrollable region; no content is moved by transforms. */
(()=>{
 'use strict';
 let serial=0;
 const mounted=new WeakMap();
 function mount(viewport,{root,label='滚动通知输入区'}={}){
  if(mounted.has(viewport))return mounted.get(viewport);
  if(!root)throw new Error('缺少滚动轨道容器。');
  if(!viewport.id)viewport.id='compose-scroll-region-'+(++serial);
  const track=document.createElement('div'),thumb=document.createElement('div');
  track.className='composer-scroll-track';thumb.className='composer-scroll-thumb';
  thumb.setAttribute('role','scrollbar');thumb.setAttribute('aria-label',label);
  thumb.setAttribute('aria-orientation','vertical');thumb.setAttribute('aria-controls',viewport.id);
  thumb.setAttribute('aria-valuemin','0');track.append(thumb);root.append(track);
  let frame=0,drag=null,destroyed=false;
  function range(){return Math.max(0,viewport.scrollHeight-viewport.clientHeight);}
  function update(){
   frame=0;if(destroyed)return;
   const maximum=range(),length=track.clientHeight,overflow=maximum>1;
   const size=overflow?Math.min(length,Math.max(32,length*viewport.clientHeight/viewport.scrollHeight)):length;
   const travel=Math.max(0,length-size),offset=maximum?Math.min(maximum,Math.max(0,viewport.scrollTop))/maximum*travel:0;
   thumb.style.height=size+'px';thumb.style.transform=`translateY(${offset}px)`;
   root.dataset.scrollOverflow=String(overflow);thumb.tabIndex=overflow?0:-1;
   thumb.setAttribute('aria-disabled',String(!overflow));thumb.setAttribute('aria-valuemax',String(Math.ceil(maximum)));
   thumb.setAttribute('aria-valuenow',String(Math.round(Math.min(maximum,Math.max(0,viewport.scrollTop)))));
  }
  function refresh(){if(!frame&&!destroyed)frame=requestAnimationFrame(update);}
  function stop(){if(!drag)return;try{track.releasePointerCapture(drag.pointerId);}catch{}drag=null;track.classList.remove('is-dragging');}
  function down(event){
   if(event.button!==0||range()<=1)return;
   const box=track.getBoundingClientRect(),size=thumb.getBoundingClientRect().height;
   if(event.target!==thumb){const travel=track.clientHeight-size;viewport.scrollTop=travel>0?(event.clientY-box.top-size/2)/travel*range():0;update();}
   drag={pointerId:event.pointerId,y:event.clientY,scroll:viewport.scrollTop};track.classList.add('is-dragging');track.setPointerCapture(event.pointerId);thumb.focus({preventScroll:true});event.preventDefault();
  }
  function move(event){if(!drag||drag.pointerId!==event.pointerId)return;const travel=track.clientHeight-thumb.getBoundingClientRect().height;if(travel>0)viewport.scrollTop=drag.scroll+(event.clientY-drag.y)/travel*range();refresh();event.preventDefault();}
  function key(event){
   const amounts={ArrowUp:-40,ArrowDown:40,PageUp:-viewport.clientHeight*.85,PageDown:viewport.clientHeight*.85};
   if(event.key==='Home')viewport.scrollTop=0;else if(event.key==='End')viewport.scrollTop=range();else if(event.key in amounts)viewport.scrollTop+=amounts[event.key];else return;
   event.preventDefault();refresh();
  }
  function wheel(event){if(range()<=1)return;const before=viewport.scrollTop;viewport.scrollTop+=event.deltaY;if(viewport.scrollTop!==before)event.preventDefault();refresh();}
  const resize=new ResizeObserver(refresh),observed=new Set();
  function observeChildren(){for(const child of observed){if(!viewport.contains(child)){resize.unobserve(child);observed.delete(child);}}for(const child of viewport.children){if(!observed.has(child)){observed.add(child);resize.observe(child);}}refresh();}
  resize.observe(viewport);resize.observe(root);const mutations=new MutationObserver(observeChildren);mutations.observe(viewport,{childList:true,subtree:true,characterData:true});observeChildren();
  viewport.addEventListener('scroll',refresh,{passive:true});viewport.addEventListener('input',refresh);window.addEventListener('resize',refresh,{passive:true});
  track.addEventListener('pointerdown',down);track.addEventListener('pointermove',move);track.addEventListener('pointerup',stop);track.addEventListener('pointercancel',stop);track.addEventListener('lostpointercapture',stop);track.addEventListener('wheel',wheel,{passive:false});thumb.addEventListener('keydown',key);
  const api={refresh,destroy(){destroyed=true;stop();cancelAnimationFrame(frame);resize.disconnect();mutations.disconnect();viewport.removeEventListener('scroll',refresh);viewport.removeEventListener('input',refresh);window.removeEventListener('resize',refresh);track.remove();mounted.delete(viewport);}};
  mounted.set(viewport,api);update();return api;
 }
 globalThis.CampusScroll={mount};
})();
