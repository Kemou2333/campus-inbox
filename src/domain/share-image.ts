/** Layout is kept independent of the DOM so long notices can be checked before
 * allocating any image. Text is never turned into HTML or external resources. */
export type ShareTextKind='title'|'summary'|'fact'|'heading'|'body'|'detail'|'task'|'step';
export type ShareTaskState='pending'|'completed'|'dismissed';
export type ShareTextTone='accent'|'time'|'reminder'|'warning';
export interface ShareTextBlock {kind:ShareTextKind;text:string;state?:ShareTaskState;tone?:ShareTextTone}
export interface ShareImageLine extends ShareTextBlock {y:number;block:number}
export interface ShareImagePage {lines:ShareImageLine[];height:number;scale:number;width:number;outputHeight:number}
export const SHARE_IMAGE_WIDTH=900;
/** At most 24 MB of RGBA pixels; the canvas is released after one PNG. */
export const SHARE_IMAGE_MAX_PIXELS=6_000_000;
export const SHARE_IMAGE_MAX_EDGE=16384;
export const SHARE_IMAGE_MIN_SCALE=.5;
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
 const lines:ShareImageLine[]=[];
 let cursor=104;
 for(const [blockIndex,block] of blocks.entries()){
  const style=shareTextStyles[block.kind];
  const wrapped=wrapShareText(block.text,SHARE_IMAGE_WIDTH-120-style.indent,value=>measure(value,block.kind));
  wrapped.forEach((text,index)=>{
   lines.push({kind:block.kind,text,y:cursor,block:blockIndex,tone:block.tone,state:index===0?block.state:undefined});cursor+=style.line;
  });
  cursor+=style.gap;
 }
 if(!lines.length)return [];
 const height=Math.max(360,cursor+124);
 const scale=Math.min(1,SHARE_IMAGE_MAX_EDGE/height,Math.sqrt(SHARE_IMAGE_MAX_PIXELS/(SHARE_IMAGE_WIDTH*height)));
 if(scale<SHARE_IMAGE_MIN_SCALE)throw new Error('内容过长，无法生成清晰长图。请关闭“含详情”后重试，通知内容未删减。');
 return [{lines,height,scale,width:Math.floor(SHARE_IMAGE_WIDTH*scale),outputHeight:Math.floor(height*scale)}];
}

export function shareImageFileName(title:string):string{
 const safe=Array.from(title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').trim()).slice(0,40).join('')||'校园通知';
 return `${safe}.png`;
}

export function shareImageTimestamp(date:Date):string{
 const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const get=(type:string)=>parts.find(part=>part.type===type)?.value??'';
 return `${get('month')}月${get('day')}日 ${get('hour')}:${get('minute')}`;
}
