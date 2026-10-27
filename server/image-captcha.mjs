import {createHash,randomInt} from 'node:crypto';
import {deflateSync} from 'node:zlib';

// Small readable raster font. No answer, SVG text or PNG textual metadata is sent to clients.
const DIGITS=[
  ['01110','10001','10011','10101','11001','10001','01110'],
  ['00100','01100','00100','00100','00100','00100','01110'],
  ['01110','10001','00001','00010','00100','01000','11111'],
  ['11110','00001','00001','01110','00001','00001','11110'],
  ['00010','00110','01010','10010','11111','00010','00010'],
  ['11111','10000','10000','11110','00001','00001','11110'],
  ['01110','10000','10000','11110','10001','10001','01110'],
  ['11111','00001','00010','00100','01000','01000','01000'],
  ['01110','10001','10001','01110','10001','10001','01110'],
  ['01110','10001','10001','01111','00001','00001','01110']
];
const WIDTH=240,HEIGHT=88;
const crcTable=Array.from({length:256},(_,index)=>{
  let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;
});
function chunk(name,data){
  const kind=Buffer.from(name),length=Buffer.alloc(4),checksum=Buffer.alloc(4);
  length.writeUInt32BE(data.length);let crc=0xffffffff;
  for(const byte of Buffer.concat([kind,data]))crc=crcTable[(crc^byte)&255]^(crc>>>8);
  checksum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([length,kind,data,checksum]);
}
export function captchaAnswerHash(id,answer){return createHash('sha256').update(id+':'+answer).digest('hex');}

/** Returns only a salted hash and the PNG. Plain digits exist briefly during rasterization. */
export function createImageCaptcha(id,randomNumber=randomInt){
  const answer=String(randomNumber(10000)).padStart(4,'0');
  const pixels=Buffer.alloc(WIDTH*HEIGHT*3);
  const pixel=(x,y,color)=>{
    if(x<0||x>=WIDTH||y<0||y>=HEIGHT)return;
    const offset=(y*WIDTH+x)*3;for(let channel=0;channel<3;channel++)pixels[offset+channel]=color[channel];
  };
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)pixel(x,y,[247,249,250]);
  // Low-contrast texture stays behind the digits; it is not another puzzle to solve.
  for(let count=0;count<250;count++)pixel(randomInt(WIDTH),randomInt(HEIGHT),[166,192,191]);
  for(let line=0;line<6;line++){
    const start=randomInt(HEIGHT),slope=(randomInt(13)-6)/30;
    for(let x=0;x<WIDTH;x++)pixel(x,Math.round(start+x*slope),[203,219,219]);
  }
  for(let index=0;index<answer.length;index++){
    const font=DIGITS[Number(answer[index])],centerX=40+index*51+randomInt(-3,4),centerY=44+randomInt(-5,6);
    const scaleX=randomInt(65,75)/10,scaleY=randomInt(64,73)/10;
    const angle=randomInt(-10,11)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    const shear=randomInt(-8,9)/100,wave=randomInt(10,19)/10,phase=randomInt(628)/100;
    const color=[randomInt(30,49),randomInt(60,80),randomInt(65,85)];
    // Sample each independently rotated and gently warped glyph backwards so
    // strokes stay solid, rather than leaving holes from forward pixel rotation.
    for(let y=Math.floor(centerY-32);y<=Math.ceil(centerY+32);y++)for(let x=Math.floor(centerX-28);x<=Math.ceil(centerX+28);x++){
      const dx=x-centerX,dy=y-centerY,localY=-dx*sin+dy*cos;
      const localX=dx*cos+dy*sin-shear*localY-wave*Math.sin(localY/13+phase);
      const row=localY/scaleY+3.5,column=localX/scaleX+2.5;
      if(row<0||row>=7||column<0||column>=5)continue;
      if(font[Math.floor(row)][Math.floor(column)]==='1'&&row%1<.96&&column%1<.95)pixel(x,y,color);
    }
  }
  // Two thin, lighter curves cross the strokes without hiding a whole digit.
  for(let line=0;line<2;line++){
    const start=randomInt(23,66),slope=randomInt(-9,10)/100,phase=randomInt(628)/100;
    const amplitude=randomInt(6,12),period=randomInt(28,46);
    for(let x=7;x<WIDTH-7;x++){
      const y=Math.round(start+slope*(x-WIDTH/2)+amplitude*Math.sin(x/period+phase));
      pixel(x,y,[137,165,164]);
      if(x%3===0)pixel(x,y+1,[177,196,195]);
    }
  }
  const scanlines=Buffer.alloc(HEIGHT*(WIDTH*3+1));
  for(let row=0;row<HEIGHT;row++)pixels.copy(scanlines,row*(WIDTH*3+1)+1,row*WIDTH*3,(row+1)*WIDTH*3);
  const header=Buffer.alloc(13);header.writeUInt32BE(WIDTH);header.writeUInt32BE(HEIGHT,4);header[8]=8;header[9]=2;
  const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]);
  return {image:'data:image/png;base64,'+png.toString('base64'),answerHash:captchaAnswerHash(id,answer)};
}
