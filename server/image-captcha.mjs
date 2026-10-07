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
const WIDTH=240,HEIGHT=88,SCALE=7;
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
  // Light noise and small vertical/shear variations; avoid hard-to-read puzzles.
  for(let count=0;count<130;count++)pixel(randomInt(WIDTH),randomInt(HEIGHT),[166,192,191]);
  for(let line=0;line<6;line++){
    const start=randomInt(HEIGHT),slope=(randomInt(13)-6)/30;
    for(let x=0;x<WIDTH;x++)pixel(x,Math.round(start+x*slope),[203,219,219]);
  }
  for(let index=0;index<answer.length;index++){
    const font=DIGITS[Number(answer[index])],top=18+randomInt(-4,5),shear=randomInt(-1,2);
    const color=index%2?[32,74,79]:[35,59,68];
    for(let row=0;row<7;row++)for(let column=0;column<5;column++)if(font[row][column]==='1'){
      const left=22+index*50+column*SCALE+shear*(row-3);
      for(let y=0;y<SCALE-1;y++)for(let x=0;x<SCALE-1;x++)pixel(left+x,top+row*SCALE+y,color);
    }
  }
  const scanlines=Buffer.alloc(HEIGHT*(WIDTH*3+1));
  for(let row=0;row<HEIGHT;row++)pixels.copy(scanlines,row*(WIDTH*3+1)+1,row*WIDTH*3,(row+1)*WIDTH*3);
  const header=Buffer.alloc(13);header.writeUInt32BE(WIDTH);header.writeUInt32BE(HEIGHT,4);header[8]=8;header[9]=2;
  const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]);
  return {image:'data:image/png;base64,'+png.toString('base64'),answerHash:captchaAnswerHash(id,answer)};
}
