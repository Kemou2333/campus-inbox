/** Layout is kept independent of the DOM so long notices can be checked before
 * allocating any image. Text is never turned into HTML or external resources. */
export type ShareTextKind='title'|'summary'|'fact'|'heading'|'body'|'detail'|'task'|'step';
export type ShareTaskState='pending'|'completed'|'dismissed';
export type ShareTextTone='accent'|'time'|'reminder'|'warning';
export interface ShareTextBlock {kind:ShareTextKind;text:string;state?:ShareTaskState;tone?:ShareTextTone}
export interface ShareImageLine extends ShareTextBlock {y:number;block:number}
export interface ShareImagePage {lines:ShareImageLine[];height:number}
export const SHARE_IMAGE_WIDTH=900;
export const SHARE_IMAGE_MAX_HEIGHT=1320;
export const SHARE_IMAGE_MAX_PAGES=8;
export const SHARE_IMAGE_MAX_CHARACTERS=18000;
export const shareTextStyles:Record<ShareTextKind,{size:number;line:number;gap:number;indent:number;weight:number}>={
 title:{size:54,line:70,gap:24,indent:0,weight:750},
 summary:{size:32,line:48,gap:22,indent:0,weight:400},
 fact:{size:30,line:46,gap:16,indent:16,weight:600},
 heading:{size:30,line:48,gap:14,indent:0,weight:750},
 body:{size:31,line:47,gap:16,indent:0,weight:400},
 detail:{size:30,line:46,gap:14,indent:50,weight:400},
 task:{size:36,line:54,gap:18,indent:50,weight:700},
 step:{size:30,line:46,gap:14,indent:50,weight:550},
};

/** Break even unspaced URLs and CJK text; Array.from keeps surrogate pairs
 * together. Blank paragraphs survive, and no ellipsis or slice hides content. */
export function wrapShareText(text:string,maxWidth:number,measure:(value:string)=>number):string[]{
 const result:string[]=[];
 for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')){
  let line='';
  for(const character of Array.from(paragraph)){
   if(line&&measure(line+character)>maxWidth){
    // Carry a preceding character rather than start a line with CJK punctuation.
    const previous=Array.from(line);
    if(/^[，。！？、；：）》」』】]$/.test(character)&&previous.length>1){
     const carried=previous.pop()!;
     if(measure(carried+character)<=maxWidth){result.push(previous.join(''));line=carried+character;continue;}
    }
    result.push(line);line=character;
   }
   else line+=character;
  }
  result.push(line);
 }
 return result;
}

export function layoutShareImages(blocks:ShareTextBlock[],measure:(value:string,kind:ShareTextKind)=>number):ShareImagePage[]{
 if(blocks.reduce((sum,block)=>sum+Array.from(block.text).length,0)>SHARE_IMAGE_MAX_CHARACTERS)throw new Error('内容较长，请关闭“含详情”后重试。通知内容未删减。');
 const pages:ShareImagePage[]=[];
 let lines:ShareImageLine[]=[],cursor=104;
 const bottom=SHARE_IMAGE_MAX_HEIGHT-140;
 function finish(){if(!lines.length)return;pages.push({lines,height:Math.min(SHARE_IMAGE_MAX_HEIGHT,Math.max(360,cursor+124))});lines=[];cursor=104;if(pages.length>SHARE_IMAGE_MAX_PAGES)throw new Error('图片超过 8 页，请关闭“含详情”后重试。通知内容未删减。');}
 for(const [blockIndex,block] of blocks.entries()){
  const style=shareTextStyles[block.kind];
  const wrapped=wrapShareText(block.text,SHARE_IMAGE_WIDTH-120-style.indent,value=>measure(value,block.kind));
  // Keep the whole section heading with its first content line where possible.
  const next=blocks[blockIndex+1],followingLine=block.kind==='heading'&&next?style.gap+shareTextStyles[next.kind].line:0;
  if(lines.length&&cursor+wrapped.length*style.line+followingLine>bottom&&block.kind==='heading')finish();
  wrapped.forEach((text,index)=>{
   if(cursor+style.line>bottom)finish();
   lines.push({kind:block.kind,text,y:cursor,block:blockIndex,tone:block.tone,state:index===0?block.state:undefined});cursor+=style.line;
  });
  cursor+=style.gap;
 }
 finish();return pages;
}

export function shareImageFileName(title:string,page:number,total:number):string{
 const safe=Array.from(title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').trim()).slice(0,40).join('')||'校园通知';
 return `${safe}${total>1?`-${page+1}共${total}页`:''}.png`;
}

export function shareImageTimestamp(date:Date):string{
 const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const get=(type:string)=>parts.find(part=>part.type===type)?.value??'';
 return `${get('month')}月${get('day')}日 ${get('hour')}:${get('minute')}`;
}
