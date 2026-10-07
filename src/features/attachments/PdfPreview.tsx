import {useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,CircularProgress,IconButton,Stack,Tooltip,Typography} from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ZoomIn from '@mui/icons-material/ZoomIn';
import ZoomOut from '@mui/icons-material/ZoomOut';
import type {PDFDocumentLoadingTask,PDFDocumentProxy,PDFPageProxy,PDFWorker,RenderTask} from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/legacy/build/pdf.worker.mjs?worker&url';

const MAX_FILE_BYTES=5*1024*1024;
const MAX_PAGES=200;
const MAX_CANVAS_PIXELS=4*1024*1024;
const MAX_PAGE_EDGE=14400;
const MIN_ZOOM=.75,MAX_ZOOM=2.5;

// Hash-named local resources keep Chinese PDFs and scanned pages usable offline.
const resources=import.meta.glob([
 '/node_modules/pdfjs-dist/cmaps/*.bcmap',
 '/node_modules/pdfjs-dist/standard_fonts/*.pfb',
 '/node_modules/pdfjs-dist/standard_fonts/*.ttf',
 '/node_modules/pdfjs-dist/wasm/*.wasm',
],{eager:true,query:'?url',import:'default'}) as Record<string,string>;

class LocalPdfResources {
 async fetch({kind,filename}:{kind:string;filename:string}):Promise<Uint8Array>{
  const folder=kind==='cMapUrl'?'cmaps':kind==='standardFontDataUrl'?'standard_fonts':kind==='wasmUrl'||kind==='iccUrl'?'wasm':null;
  const url=folder?resources[`/node_modules/pdfjs-dist/${folder}/${filename}`]:null;
  if(!url)throw new Error('PDF resource unavailable');
  const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error('PDF resource unavailable');
  return new Uint8Array(await response.arrayBuffer());
 }
}

function loadingMessage(error:unknown,timedOut:boolean){
 if(timedOut)return '读取时间较长，请保存后查看。';
 if(error instanceof Error&&error.name==='PasswordException')return '这份 PDF 有密码，请保存后打开。';
 return '无法预览这份 PDF，请保存后查看。';
}

/** Local canvas rendering only. PDF actions, links and form scripts are not run. */
export function PdfPreview({blob,name='PDF 附件'}:{blob:Blob;name?:string}){
 const holder=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const workerRef=useRef<PDFWorker|null>(null);
 const renderQueue=useRef<Promise<void>>(Promise.resolve());
 const [document,setDocument]=useState<PDFDocumentProxy|null>(null);
 const [width,setWidth]=useState(0),[pageNumber,setPageNumber]=useState(1),[zoom,setZoom]=useState(1);
 const [loading,setLoading]=useState(true),[rendering,setRendering]=useState(false);
 const [error,setError]=useState(''),[pageError,setPageError]=useState('');

 useEffect(()=>{
  const element=holder.current;if(!element)return;
  const measure=()=>setWidth(Math.max(0,Math.floor(element.clientWidth-2)));
  const observer=new ResizeObserver(measure);observer.observe(element);measure();
  return()=>observer.disconnect();
 },[]);

 useEffect(()=>{
  let active=true,timedOut=false,task:PDFDocumentLoadingTask|undefined,worker:PDFWorker|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  setDocument(null);setPageNumber(1);setZoom(1);setLoading(true);setRendering(false);setError('');setPageError('');
  if(blob.size>MAX_FILE_BYTES){setError('文件较大，请保存后查看。');setLoading(false);return;}
  void(async()=>{
   const library=await import('pdfjs-dist/legacy/build/pdf.mjs');
   const bytes=new Uint8Array(await blob.arrayBuffer());if(!active)return;
   library.GlobalWorkerOptions.workerSrc=workerURL;
   worker=library.PDFWorker.create({});workerRef.current=worker;
   task=library.getDocument({data:bytes,worker,enableXfa:false,
    useWorkerFetch:false,BinaryDataFactory:LocalPdfResources,
    maxImageSize:16*1024*1024,canvasMaxAreaInBytes:MAX_CANVAS_PIXELS*4,
    verbosity:0});
   timer=setTimeout(()=>{timedOut=true;setError('读取时间较长，请保存后查看。');setLoading(false);worker?.destroy();void task?.destroy().catch(()=>{});},15000);
   const loaded=await task.promise;
   if(!active)return;
   if(loaded.numPages>MAX_PAGES){worker.destroy();void task.destroy().catch(()=>{});throw new Error('PDF has too many pages');}
   setDocument(loaded);
  })().catch(issue=>{if(active)setError(loadingMessage(issue,timedOut));})
   .finally(()=>{clearTimeout(timer);if(active)setLoading(false);});
  return()=>{active=false;clearTimeout(timer);void task?.destroy().catch(()=>{});worker?.destroy();if(workerRef.current===worker)workerRef.current=null;};
 },[blob]);

 useEffect(()=>{
  if(!document||!width||!canvas.current)return;
  let cancelled=false,page:PDFPageProxy|undefined,render:RenderTask|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const target=canvas.current;setRendering(true);setPageError('');target.style.visibility='hidden';
  renderQueue.current=renderQueue.current.catch(()=>{}).then(async()=>{
   if(cancelled)return;
   timer=setTimeout(()=>{if(cancelled)return;cancelled=true;render?.cancel();workerRef.current?.destroy();setDocument(null);setRendering(false);setError('预览耗时较长，请保存后查看。');},15000);
   page=await document.getPage(pageNumber);if(cancelled)return;
   const original=page.getViewport({scale:1});
   if(!Number.isFinite(original.width)||!Number.isFinite(original.height)||original.width<=0||original.height<=0
    ||Math.max(original.width,original.height)>MAX_PAGE_EDGE
    ||Math.max(original.width/original.height,original.height/original.width)>20){
    throw new Error('PDF page too large');
   }
   const viewport=page.getViewport({scale:width/original.width*zoom});
   const outputScale=Math.min(window.devicePixelRatio||1,2,Math.sqrt(MAX_CANVAS_PIXELS/(viewport.width*viewport.height)));
   target.width=Math.max(1,Math.floor(viewport.width*outputScale));
   target.height=Math.max(1,Math.floor(viewport.height*outputScale));
   target.style.width=`${Math.floor(viewport.width)}px`;target.style.height=`${Math.floor(viewport.height)}px`;
   render=page.render({canvas:target,viewport,transform:[outputScale,0,0,outputScale,0,0],annotationMode:0});
   await render.promise;
   if(!cancelled){target.style.visibility='visible';holder.current?.scrollTo({top:0,left:0,behavior:'instant'});}
  }).catch(issue=>{
   if(!cancelled&&!(issue instanceof Error&&issue.name==='RenderingCancelledException'))setPageError('这一页无法预览，请保存后查看。');
  }).finally(()=>{clearTimeout(timer);page?.cleanup();if(!cancelled)setRendering(false);});
  return()=>{cancelled=true;clearTimeout(timer);render?.cancel();};
 },[document,pageNumber,width,zoom]);

 useEffect(()=>{const target=canvas.current;return()=>{if(target){target.width=0;target.height=0;}};},[]);
 const ready=!!document&&!loading;
 return <Stack spacing={1.5} sx={{minWidth:0,width:'100%'}}>
  {ready&&<Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:1,flexWrap:'wrap'}}>
   <Stack direction="row" sx={{alignItems:'center',gap:.25}}>
    <Tooltip title="上一页"><IconButton aria-label="PDF 上一页" disabled={pageNumber<=1} onClick={()=>setPageNumber(value=>value-1)}><ChevronLeft/></IconButton></Tooltip>
    <Typography variant="body2" sx={{minWidth:48,textAlign:'center',fontVariantNumeric:'tabular-nums'}} aria-live="polite">{pageNumber} / {document.numPages}</Typography>
    <Tooltip title="下一页"><IconButton aria-label="PDF 下一页" disabled={pageNumber>=document.numPages} onClick={()=>setPageNumber(value=>value+1)}><ChevronRight/></IconButton></Tooltip>
   </Stack>
   <Stack direction="row" sx={{alignItems:'center',gap:.25}}>
    <Tooltip title="缩小"><IconButton aria-label="缩小 PDF" disabled={zoom<=MIN_ZOOM} onClick={()=>setZoom(value=>Math.max(MIN_ZOOM,value-.25))}><ZoomOut/></IconButton></Tooltip>
    <Tooltip title="适合宽度"><Button size="small" variant="outlined" aria-label="PDF 适合宽度" onClick={()=>setZoom(1)} sx={{minWidth:64,fontVariantNumeric:'tabular-nums'}}>{Math.round(zoom*100)}%</Button></Tooltip>
    <Tooltip title="放大"><IconButton aria-label="放大 PDF" disabled={zoom>=MAX_ZOOM} onClick={()=>setZoom(value=>Math.min(MAX_ZOOM,value+.25))}><ZoomIn/></IconButton></Tooltip>
   </Stack>
  </Stack>}
  {error&&<Alert severity="info">{error}</Alert>}
  {pageError&&<Alert severity="info">{pageError}</Alert>}
  <Box ref={holder} className="pdf-viewport" sx={{position:'relative',width:'100%',minWidth:0,overflow:'auto',maxHeight:'60vh',border:ready?'1px solid':'none',borderColor:'divider',borderRadius:1.5,bgcolor:ready?'#FFF':'transparent'}}>
   {(loading||rendering)&&<Box role="status" aria-label="正在读取 PDF" sx={{position:ready?'absolute':'relative',inset:0,display:'flex',alignItems:'center',justifyContent:'center',minHeight:100,zIndex:1}}><CircularProgress size={28}/></Box>}
   <Box sx={{width:'max-content',minWidth:'100%',display:ready&&!pageError?'block':'none'}}><canvas ref={canvas} role="img" aria-label={`${name}，第 ${pageNumber} 页`} style={{display:'block',margin:'0 auto',visibility:'hidden'}}/></Box>
  </Box>
 </Stack>;
}

export default PdfPreview;
