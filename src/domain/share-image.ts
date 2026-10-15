/** Layout is kept independent of the DOM so long notices can be checked before
 * allocating any image. Text is never turned into HTML or external resources. */
export type ShareTextKind='title'|'summary'|'fact'|'heading'|'body'|'task'|'step';
export type ShareTaskState='pending'|'completed'|'dismissed';
export interface ShareTextBlock {kind:ShareTextKind;text:string;state?:ShareTaskState}
export interface ShareImageLine {kind:ShareTextKind;text:string;y:number;state?:ShareTaskState}
export interface ShareImagePage {lines:ShareImageLine[];height:number}
export const SHARE_IMAGE_WIDTH=900;
export const SHARE_IMAGE_MAX_HEIGHT=1320;
export const SHARE_IMAGE_MAX_PAGES=8;
export const SHARE_IMAGE_MAX_CHARACTERS=18000;
export const shareTextStyles:Record<ShareTextKind,{size:number;line:number;gap:number;indent:number;weight:number}>={
 title:{size:44,line:59,gap:22,indent:0,weight:750},
 summary:{size:27,line:42,gap:20,indent:0,weight:400},
 fact:{size:25,line:38,gap:12,indent:0,weight:500},
 heading:{size:27,line:42,gap:10,indent:0,weight:700},
 body:{size:25,line:39,gap:12,indent:0,weight:400},
 task:{size:29,line:43,gap:14,indent:42,weight:650},
 step:{size:25,line:38,gap:10,indent:42,weight:400},
};

/** Break even unspaced URLs and CJK text; Array.from keeps surrogate pairs
 * together. Blank paragraphs survive, and no ellipsis or slice hides content. */
export function wrapShareText(text:string,maxWidth:number,measure:(value:string)=>number):string[]{
 const result:string[]=[];
 for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')){
  let line='';
  for(const character of Array.from(paragraph)){
   if(line&&measure(line+character)>maxWidth){result.push(line);line=character;}
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
 const bottom=SHARE_IMAGE_MAX_HEIGHT-128;
 function finish(){if(!lines.length)return;pages.push({lines,height:Math.min(SHARE_IMAGE_MAX_HEIGHT,Math.max(560,cursor+120))});lines=[];cursor=104;if(pages.length>SHARE_IMAGE_MAX_PAGES)throw new Error('图片超过 8 页，请关闭“含详情”后重试。通知内容未删减。');}
 for(const block of blocks){
  const style=shareTextStyles[block.kind];
  const wrapped=wrapShareText(block.text,SHARE_IMAGE_WIDTH-120-style.indent,value=>measure(value,block.kind));
  // Keep a section heading with at least one following text line where possible.
  if(lines.length&&cursor+style.line+(block.kind==='heading'?55:0)>bottom)finish();
  wrapped.forEach((text,index)=>{
   if(cursor+style.line>bottom)finish();
   lines.push({kind:block.kind,text,y:cursor,state:index===0?block.state:undefined});cursor+=style.line;
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
