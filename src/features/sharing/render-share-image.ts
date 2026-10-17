import type {Notice} from '../../domain/types';
import {layoutShareImages,SHARE_IMAGE_WIDTH,shareImageTimestamp,shareTextStyles,type ShareTextKind,type ShareTextTone} from '../../domain/share-image';
import {noticeShareBlocks} from './notice-share-content';

export interface ShareImage {blob:Blob;width:number;height:number}
const font=(kind:ShareTextKind)=>{const style=shareTextStyles[kind];return `${style.weight} ${style.size}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;};
const tones:Record<ShareTextTone,{text:string;surface:string}>={
 accent:{text:'#19634f',surface:'#eaf4ef'},
 time:{text:'#205d94',surface:'#eaf2fc'},
 reminder:{text:'#68478c',surface:'#f2ecf8'},
 warning:{text:'#815109',surface:'#fff3d9'},
};
function png(canvas:HTMLCanvasElement):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片生成失败，请重试。')),'image/png'));}
function check(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('已取消','AbortError');}

/** The same geometry and colors as public/icon.svg, drawn without loading an image. */
function productIcon(ctx:CanvasRenderingContext2D,x:number,y:number,size:number){
 ctx.save();ctx.translate(x,y);ctx.scale(size/64,size/64);
 ctx.fillStyle='#245E59';ctx.beginPath();ctx.roundRect(0,0,64,64,20);ctx.fill();
 ctx.fillStyle='#DCEEE6';ctx.fillRect(19,17,26,30);
 ctx.strokeStyle='#245E59';ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(25,24);ctx.lineTo(39,24);ctx.moveTo(25,30);ctx.lineTo(33,30);ctx.stroke();
 ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(28,39);ctx.lineTo(32,43);ctx.lineTo(41,33);ctx.stroke();ctx.restore();
}

/** One bounded long canvas is rendered, then released. No DOM screenshot engine,
 * downloaded fonts, remote images, workers, HTML or network requests are used. */
export async function renderShareImages(notice:Notice,details:boolean,generatedAt:Date,signal?:AbortSignal):Promise<ShareImage[]>{
 const canvas=document.createElement('canvas');canvas.width=SHARE_IMAGE_WIDTH;canvas.height=1;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前设备无法生成图片。');
 try{
  check(signal);if(document.fonts?.ready)await document.fonts.ready;check(signal);
  const blocks=noticeShareBlocks(notice,details),pages=layoutShareImages(blocks,(value,kind)=>{ctx.font=font(kind);return ctx.measureText(value).width;});
  const result:ShareImage[]=[];
  const stamp=shareImageTimestamp(generatedAt);
  for(const page of pages){
   check(signal);canvas.width=page.width;canvas.height=page.outputHeight;ctx.scale(page.scale,page.scale);
   ctx.fillStyle='#edf3f2';ctx.fillRect(0,0,SHARE_IMAGE_WIDTH,page.height);
   ctx.fillStyle='#ffffff';ctx.beginPath();ctx.roundRect(20,20,SHARE_IMAGE_WIDTH-40,page.height-40,24);ctx.fill();ctx.strokeStyle='#cddcdd';ctx.lineWidth=2;ctx.stroke();
   ctx.textBaseline='top';ctx.fillStyle='#366c61';ctx.font='650 24px system-ui, sans-serif';ctx.fillText(`校园通知 · ${details?'详细版':'简洁版'}`,60,50);
   for(const [lineIndex,line] of page.lines.entries()){
    const style=shareTextStyles[line.kind],tone=line.tone?tones[line.tone]:undefined,state=blocks[line.block].state;
    if((line.kind==='heading'||line.kind==='fact')&&page.lines[lineIndex-1]?.block!==line.block){
     const group=page.lines.filter(item=>item.block===line.block),height=group.length*style.line;
     ctx.fillStyle=tone?.surface??'#f1f4f5';ctx.beginPath();ctx.roundRect(48,line.y-7,SHARE_IMAGE_WIDTH-96,height+1,10);ctx.fill();
     if(line.kind==='heading'){ctx.fillStyle=tone?.text??tones.accent.text;ctx.beginPath();ctx.roundRect(48,line.y-7,5,height+1,2);ctx.fill();}
    }
    ctx.font=font(line.kind);ctx.fillStyle=tone?.text??(line.kind==='summary'||line.kind==='detail'?'#435664':line.kind==='task'?'#174f45':'#192e3e');
    if(state==='completed')ctx.fillStyle='#24764a';if(state==='dismissed')ctx.fillStyle='#63727b';
    ctx.fillText(line.text,60+style.indent,line.y);
    if(line.state){const x=62,y=line.y+(line.kind==='task'?8:5),size=line.kind==='task'?29:25;ctx.lineWidth=2.5;ctx.strokeStyle=line.state==='completed'?'#24764a':'#6b8e85';ctx.beginPath();ctx.roundRect(x,y,size,size,5);ctx.stroke();
     if(line.state==='completed'){ctx.beginPath();ctx.moveTo(x+6,y+size*.5);ctx.lineTo(x+size*.43,y+size*.72);ctx.lineTo(x+size*.8,y+size*.24);ctx.stroke();}
     if(line.state==='dismissed'){ctx.beginPath();ctx.moveTo(x+6,y+size*.5);ctx.lineTo(x+size-6,y+size*.5);ctx.stroke();}
    }
   }
   const footer=page.height-88;ctx.strokeStyle='#d5e2e3';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(60,footer-22);ctx.lineTo(SHARE_IMAGE_WIDTH-60,footer-22);ctx.stroke();
   productIcon(ctx,60,footer,44);ctx.fillStyle='#245E59';ctx.font='750 28px system-ui, sans-serif';ctx.fillText('校园 Inbox',118,footer+5);
   ctx.textAlign='right';ctx.fillStyle='#5d6f7b';ctx.font='23px system-ui, sans-serif';ctx.fillText(stamp,SHARE_IMAGE_WIDTH-60,footer+9);ctx.textAlign='left';
   const blob=await png(canvas);check(signal);result.push({blob,width:canvas.width,height:canvas.height});
  }
  return result;
 }finally{canvas.width=1;canvas.height=1;}
}
