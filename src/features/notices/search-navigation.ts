export interface SearchLocation<T=HTMLElement> {element:T;noticeID:string;taskID?:string;text:string;occurrence:number;context:boolean}
const readingKey=(text:string)=>text.replace(/\s+/gu,' ').replace(/^…|…$/gu,'').trim().toLocaleLowerCase();

/** Reading snippets stand in for folded text; they are not a second copy of visible prose. */
export function uniqueSearchLocations<T>(locations:SearchLocation<T>[]):SearchLocation<T>[] {
 const body=locations.filter(location=>!location.context),seen=new Set<string>();
 return locations.filter(location=>{
  const text=readingKey(location.text);
  if(!text||location.context&&body.some(other=>other.noticeID===location.noticeID&&readingKey(other.text).includes(text)))return false;
  const key=`${location.noticeID}\u0000${text}\u0000${location.occurrence}`;
  if(seen.has(key))return false;seen.add(key);return true;
 });
}

/** Retain the same reading place when expanding replaces its snippet with the full field. */
export function resolveSearchLocation<T>(locations:SearchLocation<T>[],previous:SearchLocation<T>|null):SearchLocation<T>|undefined {
 if(!previous)return;
 return locations.find(location=>location.element===previous.element)??locations.find(location=>location.noticeID===previous.noticeID&&readingKey(location.text)===readingKey(previous.text)&&location.occurrence===previous.occurrence)??locations.find(location=>location.noticeID===previous.noticeID&&!location.context&&readingKey(location.text).includes(readingKey(previous.text))&&location.occurrence===previous.occurrence);
}

/** Scope is the result list only. Off-screen text counts, CSS-hidden/collapsed text does not. */
export function collectSearchLocations(root:HTMLElement):SearchLocation[] {
 const view=root.ownerDocument.defaultView;if(!view)return [];
 const styles=new WeakMap<Element,CSSStyleDeclaration>(),rects=new WeakMap<Element,DOMRect>();
 const style=(element:Element)=>{let value=styles.get(element);if(!value){value=view.getComputedStyle(element);styles.set(element,value);}return value;};
 const rect=(element:Element)=>{let value=rects.get(element);if(!value){value=element.getBoundingClientRect();rects.set(element,value);}return value;};
 const indexes=new WeakMap<Element,number>(),locations:SearchLocation[]=[];
 for(const element of root.querySelectorAll<HTMLElement>('mark.search-match')){
  if(element.closest('[hidden],[inert],[aria-hidden="true"],[data-search-editing="true"],[data-search-active="false"],.correction-target'))continue;
  const bounds=rect(element);if(!element.getClientRects().length||bounds.width<=0||bounds.height<=0)continue;
  let visible=true;
  for(let parent:Element|null=element;parent&&parent!==root.parentElement;parent=parent.parentElement){const css=style(parent);if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||css.opacity==='0'){visible=false;break;}if(parent!==element&&(/hidden|clip/.test(css.overflowY)||/hidden|clip/.test(css.overflowX))){const clip=rect(parent);if(clip.height<=0||clip.width<=0||bounds.bottom<=clip.top||bounds.top>=clip.bottom||bounds.right<=clip.left||bounds.left>=clip.right){visible=false;break;}}}
  if(!visible)continue;
  const article=element.closest<HTMLElement>('article.notice-card'),context=element.closest<HTMLElement>('.search-results-context');
  const noticeID=article?.id.replace(/^notice-/,'')??context?.dataset.searchNoticeId;if(!noticeID)continue;
  const block=element.closest<HTMLElement>('[data-search-excerpt],p,li,h1,h2,h3,h4,.MuiTypography-root,.MuiChip-label,button')??element.parentElement;if(!block)continue;
  const occurrence=indexes.get(block)??0;indexes.set(block,occurrence+1);
  const taskID=element.closest<HTMLElement>('[data-search-task-id]')?.dataset.searchTaskId??element.closest<HTMLElement>('.task-item')?.querySelector<HTMLElement>('[id^="task-body-"]')?.id.replace(/^task-body-/,'');
  locations.push({element,noticeID,...(taskID?{taskID}:{}),text:block.textContent??'',occurrence,context:!!context});
 }
 return uniqueSearchLocations(locations);
}
