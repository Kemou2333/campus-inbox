import {afterEach,describe,expect,it,vi} from 'vitest';
import {createNotice} from '../../domain/notice';
import type {NoticeAnalysis} from '../../domain/types';
import {renderShareImages} from './render-share-image';
import {SHARE_IMAGE_MAX_EDGE,SHARE_IMAGE_MAX_PIXELS} from '../../domain/share-image';

const analysis:NoticeAnalysis={schemaVersion:4,kind:'task',title:'课程报名',summary:'完成报名。',deadline:null,deadlineText:'10月20日24:00',timeline:[],materials:[],warnings:['须本人提交。'],reminders:['检查报名状态。'],tasks:[{text:'提交报名',assignee:null,scope:'all',condition:'',details:[],steps:[],time:null,timeText:'',location:null}]};

function canvasEnvironment(failPNG=false){
 const drawn:{text:string;font:string;color:string|CanvasGradient|CanvasPattern}[]=[];
 const ctx={font:'',fillStyle:'' as string|CanvasGradient|CanvasPattern,strokeStyle:'',lineWidth:1,lineCap:'butt',lineJoin:'miter',textBaseline:'top',textAlign:'left',
  beginPath:vi.fn(),roundRect:vi.fn(),fill:vi.fn(),stroke:vi.fn(),fillRect:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),save:vi.fn(),restore:vi.fn(),translate:vi.fn(),scale:vi.fn(),
  fillText(text:string){drawn.push({text,font:this.font,color:this.fillStyle});},measureText(text:string){return {width:Array.from(text).length*20};},
 };
 const canvas={width:0,height:0,getContext:()=>ctx,toBlob:(callback:BlobCallback)=>callback(failPNG?null:new Blob(['png'],{type:'image/png'}))};
 vi.stubGlobal('document',{createElement:vi.fn(()=>canvas),fonts:{ready:Promise.resolve()}});
 return {canvas,ctx,drawn};
}

afterEach(()=>vi.unstubAllGlobals());
describe('local Canvas share rendering',()=>{
 it('draws the product icon, readable hierarchy, Shanghai watermark and distinct semantic colors',async()=>{
  const {canvas,ctx,drawn}=canvasEnvironment(),notice=createNotice(analysis,'原文不得导出');notice.note='笔记不得导出';
  const images=await renderShareImages(notice,true,new Date('2026-10-16T16:01:00Z'));
  expect(images).toHaveLength(1);expect(images.every(image=>image.width===900&&image.height<=SHARE_IMAGE_MAX_EDGE&&image.blob.type==='image/png')).toBe(true);
  expect(drawn.find(item=>item.text==='课程报名')?.font).toContain('54px');
  expect(drawn.find(item=>item.text==='提交报名')?.font).toContain('36px');
  expect(drawn.find(item=>item.text==='截止：10月20日24:00')?.color).toBe('#205d94');
  expect(drawn.find(item=>item.text==='提醒')?.color).toBe('#68478c');expect(drawn.find(item=>item.text==='注意')?.color).toBe('#815109');
  expect(drawn.some(item=>item.text==='拾笺 Inbox')).toBe(true);expect(drawn.some(item=>item.text==='10月17日 00:01')).toBe(true);
  expect(ctx.fillRect).toHaveBeenCalledWith(19,17,26,30);expect(ctx.lineTo).toHaveBeenCalledWith(41,33);
  expect(drawn.some(item=>/不得导出/.test(item.text))).toBe(false);expect(canvas.width).toBe(1);expect(canvas.height).toBe(1);
  expect(drawn.some(item=>/^\d+ \/ \d+$/.test(item.text))).toBe(false);
 });
 it('renders full long detail content into one proportionally reduced PNG',async()=>{
  const {ctx,drawn}=canvasEnvironment(),detail='完整细节'.repeat(2000)+'末尾必须保留';
  const notice=createNotice({...analysis,tasks:[{...analysis.tasks[0],details:detail.match(/.{1,500}/gu)!}]},'原文不得导出');
  const images=await renderShareImages(notice,true,new Date());
  expect(images).toHaveLength(1);expect(images[0].height).toBeGreaterThan(1320);expect(images[0].width).toBeLessThan(900);
  expect(images[0].width*images[0].height).toBeLessThanOrEqual(SHARE_IMAGE_MAX_PIXELS);
  expect(images[0].height).toBeLessThanOrEqual(SHARE_IMAGE_MAX_EDGE);
  expect(ctx.scale.mock.calls[0][0]).toBeLessThan(1);
  expect(drawn.map(item=>item.text).join('')).toContain(detail);
 });
 it('releases the bounded canvas when PNG conversion fails or generation was cancelled',async()=>{
  const failed=canvasEnvironment(true);
  await expect(renderShareImages(createNotice(analysis,'课程报名原文'),false,new Date())).rejects.toThrow('图片生成失败');
  expect(failed.canvas.width).toBe(1);expect(failed.canvas.height).toBe(1);
  const cancelled=canvasEnvironment(),abort=new AbortController();abort.abort();
  await expect(renderShareImages(createNotice(analysis,'课程报名原文'),false,new Date(),abort.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(cancelled.drawn).toHaveLength(0);expect(cancelled.canvas.width).toBe(1);expect(cancelled.canvas.height).toBe(1);
 });
});
