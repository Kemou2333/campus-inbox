/* A single raised selector follows the pointer inside the recessed status rail.
   The existing tab buttons remain responsible for selecting and announcing views. */
(() => {
  'use strict';
  const rail = document.querySelector('.tabs[role="tablist"]');
  if (!rail || rail.dataset.slidingSelector === 'ready') return;
  const tabs = Array.from(rail.querySelectorAll('[role="tab"]'));
  if (tabs.length < 2) return;
  const plate = document.createElement('span');
  plate.className = 'tab-selector';
  plate.setAttribute('aria-hidden', 'true');
  rail.prepend(plate);
  rail.dataset.slidingSelector = 'ready';

  let geometry = [], gesture = null, frame = 0, suppressedClick = null;
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const selected = () => Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'));
  const tone = index => tabs[index].id.replace(/^tab-/, '') || String(index);

  function measure() {
    const bounds = rail.getBoundingClientRect();
    geometry = tabs.map(tab => {
      const box = tab.getBoundingClientRect();
      const left = box.left - bounds.left - rail.clientLeft;
      return {left, width: box.width, top: box.top - bounds.top - rail.clientTop, height: box.height, center: left + box.width / 2};
    });
  }
  function nearest(center) {
    let index = 0;
    for (let i = 1; i < geometry.length; i++) {
      if (Math.abs(geometry[i].center - center) < Math.abs(geometry[index].center - center)) index = i;
    }
    return index;
  }
  function paint(center, direct = false) {
    if (!geometry.length) return;
    center = clamp(center, geometry[0].center, geometry.at(-1).center);
    let left = geometry[0], right = left;
    for (let i = 1; i < geometry.length; i++) {
      if (center <= geometry[i].center) {right = geometry[i]; left = geometry[i - 1]; break;}
      left = right = geometry[i];
    }
    const fraction = right.center === left.center ? 0 : (center - left.center) / (right.center - left.center);
    const width = left.width + (right.width - left.width) * fraction;
    const index = nearest(center);
    plate.style.transition = direct ? 'none' : '';
    plate.style.transform = `translate3d(${center - width / 2}px,0,0)`;
    plate.style.width = `${width}px`;
    plate.style.top = `${left.top + (right.top - left.top) * fraction}px`;
    plate.style.height = `${left.height + (right.height - left.height) * fraction}px`;
    plate.dataset.tone = tone(index);
    for (let i = 0; i < tabs.length; i++) tabs[i].toggleAttribute('data-selector-preview', Boolean(gesture?.dragging) && i === index);
  }
  function sync(immediate = false) {
    measure();
    if (!geometry.length) return;
    paint(gesture?.dragging ? gesture.center : geometry[selected()].center, immediate || Boolean(gesture?.dragging));
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {frame = 0; sync();});
  }
  function clearGesture() {
    const previous = gesture;
    gesture = null;
    rail.classList.remove('is-selector-dragging');
    for (const tab of tabs) tab.removeAttribute('data-selector-preview');
    if (previous && rail.hasPointerCapture(previous.pointerId)) rail.releasePointerCapture(previous.pointerId);
    return previous;
  }
  function cancel() {
    if (!gesture) return;
    clearGesture();
    sync();
  }

  rail.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('[role="tab"]')?.disabled) return;
    // A new intentional press must never be swallowed by an earlier drag.
    suppressedClick = null;
    if (gesture) cancel();
    measure();
    const current = selected(), pressed = tabs.indexOf(event.target.closest('[role="tab"]'));
    const bounds = rail.getBoundingClientRect();
    gesture = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      baseCenter: pressed < 0 || pressed === current ? geometry[current].center : event.clientX - bounds.left - rail.clientLeft,
      center: geometry[current].center, dragging: false, vertical: false,
      threshold: event.pointerType === 'mouse' ? 5 : 8
    };
  });
  window.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId || gesture.vertical) return;
    const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (Math.abs(dy) > gesture.threshold && Math.abs(dy) >= Math.abs(dx)) {
        gesture.vertical = true;
        return; // The browser retains normal vertical page scrolling.
      }
      if (Math.abs(dx) < gesture.threshold || Math.abs(dx) <= Math.abs(dy)) return;
      gesture.dragging = true;
      rail.classList.add('is-selector-dragging');
      rail.setPointerCapture(event.pointerId);
    }
    if (event.cancelable) event.preventDefault();
    gesture.center = clamp(gesture.baseCenter + dx, geometry[0].center, geometry.at(-1).center);
    paint(gesture.center, true);
  }, {passive: false});
  window.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const previous = clearGesture();
    if (previous.dragging) {
      if (event.cancelable) event.preventDefault();
      suppressedClick = {pointerId: event.pointerId, until: performance.now() + 500};
      const index = nearest(previous.center);
      if (index !== selected()) tabs[index].click();
      sync();
    }
  });
  window.addEventListener('pointercancel', event => {if (gesture?.pointerId === event.pointerId) cancel();});
  // Touch initially gives the pressed button implicit capture. Its bubbling
  // lost-capture event is expected when the rail takes over a horizontal drag.
  rail.addEventListener('lostpointercapture', event => {if (event.target === rail && gesture?.pointerId === event.pointerId) cancel();});
  rail.addEventListener('click', event => {
    if (!suppressedClick || !event.isTrusted || event.detail === 0) return;
    if (performance.now() <= suppressedClick.until && (event.pointerId === undefined || event.pointerId === suppressedClick.pointerId)) {
      suppressedClick = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  rail.addEventListener('keydown', () => {cancel(); suppressedClick = null; schedule();});
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => {if (document.hidden) cancel();});
  window.addEventListener('resize', schedule);
  const resize = new ResizeObserver(schedule);
  resize.observe(rail);
  tabs.forEach(tab => resize.observe(tab));
  const changes = new MutationObserver(schedule);
  tabs.forEach(tab => changes.observe(tab, {attributes: true, attributeFilter: ['aria-selected'], childList: true, characterData: true, subtree: true}));
  document.fonts?.addEventListener('loadingdone', schedule);
  rail.classList.add('has-sliding-selector');
  sync(true);
  // Let subsequent click and keyboard changes animate after the initial layout.
  requestAnimationFrame(() => {if (!gesture?.dragging) plate.style.transition = '';});
})();
