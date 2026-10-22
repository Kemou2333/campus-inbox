import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareSiteEntry} from '../src/infrastructure/site-transfer';

const pendingKey='campus-inbox:site-transfer:pending';
function memory(initial:Record<string,string>={}){
 const values=new Map(Object.entries(initial));
 return {get length(){return values.size;},key:(index:number)=>[...values.keys()][index]??null,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key),snapshot:()=>Object.fromEntries(values)};
}
function browser(url:string,options:{pending?:string;referrer?:string;native?:boolean}={}){
 const value=new URL(url),reload=vi.fn(),replace=vi.fn();
 const location={origin:value.origin,pathname:value.pathname,search:value.search,hash:value.hash,href:value.href,reload,replace};
 const local=memory({'campus-inbox:notices:v5':'saved personal notifications','campus-inbox:draft:v5':'unsent draft'}),session=memory(options.pending?{[pendingKey]:options.pending}:{});
 const elements:Array<{tag:string;textContent:string;style:{cssText:string};setAttribute:ReturnType<typeof vi.fn>;onclick:(()=>void)|null}>=[];
 const root={replaceChildren:vi.fn(),append:vi.fn()};
 const document={referrer:options.referrer??'',getElementById:vi.fn(()=>root),createElement:(tag:string)=>{const item={tag,textContent:'',style:{cssText:''},setAttribute:vi.fn(),onclick:null};elements.push(item);return item;}};
 const window:Record<string,unknown>={};window.top=window;if(options.native)window.CampusNative={postMessage:vi.fn()};
 const fetcher=vi.fn().mockRejectedValue(new TypeError('synthetic offline'));
 const indexedDB={open:vi.fn(()=>{throw new Error('ordinary entry must not scan attachments');})};
 const history={replaceState:vi.fn(()=>{location.hash='';})};
 for(const [key,value] of Object.entries({window,location,document,localStorage:local,sessionStorage:session,fetch:fetcher,indexedDB,history}))vi.stubGlobal(key,value);
 return {location,local,session,elements,root,fetcher,indexedDB,history};
}
afterEach(()=>vi.unstubAllGlobals());

describe('independent website entry',()=>{
 it.each(['https://kemou2333.github.io/campus-inbox/?examples=1','https://123.57.30.129/?examples=1'])('opens %s directly without exporting, redirecting or scanning local data',async url=>{
  const b=browser(url,{pending:'saved pending handoff'}),beforeLocal=b.local.snapshot(),beforeSession=b.session.snapshot();
  expect(await prepareSiteEntry()).toBe(true);
  expect(b.location.replace).not.toHaveBeenCalled();expect(b.location.reload).not.toHaveBeenCalled();
  expect(b.fetcher).not.toHaveBeenCalled();expect(b.indexedDB.open).not.toHaveBeenCalled();expect(b.root.replaceChildren).not.toHaveBeenCalled();
  expect(b.local.snapshot()).toEqual(beforeLocal);expect(b.session.snapshot()).toEqual(beforeSession);
 });

 it('does not resume an old pending handoff on a normal target visit',async()=>{
  const b=browser('https://123.57.30.129/',{pending:'unfinished saved handoff'});
  expect(await prepareSiteEntry()).toBe(true);
  expect(b.session.getItem(pendingKey)).toBe('unfinished saved handoff');expect(b.fetcher).not.toHaveBeenCalled();expect(b.root.append).not.toHaveBeenCalled();
 });

 it('rejects an explicit handoff from an untrusted site without changing old pending data',async()=>{
  const b=browser('https://123.57.30.129/#campus-transfer=untrusted',{pending:'previous pending',referrer:'https://other.example/'});
  expect(await prepareSiteEntry()).toBe(false);
  expect(b.history.replaceState).toHaveBeenCalled();expect(b.fetcher).not.toHaveBeenCalled();expect(b.session.getItem(pendingKey)).toBe('previous pending');
 });

 it('only a trusted explicit legacy link starts a receive and retries only after its retry button is clicked',async()=>{
  const transfer=['1'.repeat(32),'A'.repeat(43),'A'.repeat(43)].join('.');
  const b=browser('https://123.57.30.129/?examples=1#campus-transfer='+transfer,{referrer:'https://kemou2333.github.io/campus-inbox/'});
  const beforeLocal=b.local.snapshot();
  expect(await prepareSiteEntry()).toBe(false);expect(b.fetcher).toHaveBeenCalledTimes(1);expect(b.session.getItem(pendingKey)).toBe(transfer);expect(b.location.hash).toBe('');
  const retry=b.elements.find(item=>item.tag==='button'&&item.textContent==='重新合并');expect(retry).toBeDefined();
  retry!.onclick!();await vi.waitFor(()=>expect(b.fetcher).toHaveBeenCalledTimes(2));
  const home=b.elements.find(item=>item.tag==='button'&&item.textContent==='先打开主页');home!.onclick!();
  expect(b.location.reload).toHaveBeenCalledTimes(1);expect(b.session.getItem(pendingKey)).toBe(transfer);expect(b.local.snapshot()).toEqual(beforeLocal);
 });

 it('keeps native Android out of website handoff handling',async()=>{
  const b=browser('https://123.57.30.129/#campus-transfer=anything',{native:true});
  expect(await prepareSiteEntry()).toBe(true);expect(b.fetcher).not.toHaveBeenCalled();expect(b.history.replaceState).not.toHaveBeenCalled();
 });
});
