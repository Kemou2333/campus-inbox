import type {Notice} from '../../domain/types';
import {layoutShareImages,SHARE_IMAGE_WIDTH,shareImageTimestamp,shareTextStyles,type ShareTextKind} from '../../domain/share-image';
import {noticeShareBlocks} from './notice-share-content';

export interface ShareImage {blob:Blob;width:number;height:number}
const font=(kind:ShareTextKind)=>{const style=shareTextStyles[kind];return `${style.weight} ${style.size}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;};
function png(canvas:HTMLCanvasElement):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片生成失败，请重试。')),'image/png'));}
function check(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('已取消','AbortError');}

/** One bounded canvas is reused, then released. No DOM screenshot engine,
 * downloaded fonts, remote images, workers, HTML or network requests are used. */
export async function renderShareImages(notice:Notice,details:boolean,generatedAt:Date,signal?:AbortSignal):Promise<ShareImage[]>{
 const canvas=document.createElement('canvas');canvas.width=SHARE_IMAGE_WIDTH;canvas.height=1;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前设备无法生成图片。');
 try{
  check(signal);if(document.fonts?.ready)await document.fonts.ready;check(signal);
  const pages=layoutShareImages(noticeShareBlocks(notice,details),(value,kind)=>{ctx.font=font(kind);return ctx.measureText(value).width;});
  const result:ShareImage[]=[];
  const stamp=shareImageTimestamp(generatedAt);
  for(const [index,page] of pages.entries()){
   check(signal);canvas.height=page.height;ctx.fillStyle='#f0f6f6';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.fillStyle='#ffffff';ctx.beginPath();ctx.roundRect(20,20,canvas.width-40,canvas.height-40,24);ctx.fill();ctx.strokeStyle='#cddcdd';ctx.lineWidth=2;ctx.stroke();
   ctx.textBaseline='top';ctx.fillStyle='#13746f';ctx.font='650 22px system-ui, sans-serif';ctx.fillText(`校园通知 · ${details?'详细版':'简洁版'}`,60,54);
   ctx.textAlign='right';ctx.fillStyle='#60717c';ctx.fillText(`${index+1}/${pages.length}`,canvas.width-60,54);ctx.textAlign='left';
   for(const line of page.lines){
    const style=shareTextStyles[line.kind];ctx.font=font(line.kind);
    ctx.fillStyle=line.kind==='heading'?'#116d68':line.kind==='fact'?'#41647d':line.kind==='summary'?'#475966':'#192e3e';
    if(line.state==='completed')ctx.fillStyle='#24764a';if(line.state==='dismissed')ctx.fillStyle='#63727b';
    if(line.kind==='heading'){ctx.fillStyle='#e6f3f0';ctx.beginPath();ctx.roundRect(48,line.y-6,canvas.width-96,style.line+3,8);ctx.fill();ctx.fillStyle='#116d68';}
    ctx.fillText(line.text,60+style.indent,line.y);
    if(line.state){const x=62,y=line.y+5;ctx.lineWidth=2.5;ctx.strokeStyle=line.state==='completed'?'#24764a':'#7b919b';ctx.beginPath();ctx.roundRect(x,y,23,23,4);ctx.stroke();
     if(line.state==='completed'){ctx.beginPath();ctx.moveTo(x+5,y+12);ctx.lineTo(x+10,y+17);ctx.lineTo(x+19,y+6);ctx.stroke();}
     if(line.state==='dismissed'){ctx.beginPath();ctx.moveTo(x+5,y+12);ctx.lineTo(x+18,y+12);ctx.stroke();}
    }
   }
   const footer=canvas.height-88;ctx.strokeStyle='#d5e2e3';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(60,footer-18);ctx.lineTo(canvas.width-60,footer-18);ctx.stroke();
   ctx.fillStyle='#126c67';ctx.font='700 24px system-ui, sans-serif';ctx.fillText('校园 Inbox',60,footer);
   ctx.textAlign='right';ctx.fillStyle='#5d6f7b';ctx.font='20px system-ui, sans-serif';ctx.fillText(stamp,canvas.width-60,footer+4);ctx.textAlign='left';
   const blob=await png(canvas);check(signal);result.push({blob,width:canvas.width,height:canvas.height});
   // Give navigation and cancellation a chance between pages on small phones.
   await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  return result;
 }finally{canvas.width=1;canvas.height=1;}
}
