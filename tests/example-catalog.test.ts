import {expect,test,vi} from 'vitest';
import catalog from '../public/examples.json';
import {createExampleCatalog} from '../src/infrastructure/example-catalog';

test('constructing a catalog does no network work; tutorial prefetch is reused by the show action',async()=>{
 const fetcher=vi.fn(async(path:RequestInfo|URL)=>Response.json(String(path).includes('legacy')?[]:catalog));
 const cache=createExampleCatalog(fetcher);
 expect(fetcher).not.toHaveBeenCalled();
 await Promise.all([cache.prefetch(),cache.prefetch()]);
 const first=await cache.load(),second=await cache.load();
 expect(first).toBe(second);
 expect(first.records.map(n=>n.id)).toEqual(catalog.notices.map(n=>n.id));
 expect(fetcher).toHaveBeenCalledTimes(2);
});

test('a failed background download can be retried by the show action',async()=>{
 let available=false;
 const fetcher=vi.fn(async(path:RequestInfo|URL)=>String(path).includes('legacy')?Response.json([]):available?Response.json(catalog):new Response('',{status:503}));
 const cache=createExampleCatalog(fetcher);
 await expect(cache.prefetch()).rejects.toThrow('示例暂时无法载入');
 available=true;
 expect((await cache.load()).records.length).toBe(catalog.notices.length);
 expect(fetcher).toHaveBeenCalledTimes(4);
});

test('missing legacy fingerprints do not prevent a fresh reviewed catalog from being cached',async()=>{
 const fetcher=vi.fn(async(path:RequestInfo|URL)=>{if(String(path).includes('legacy'))throw new TypeError('offline');return Response.json(catalog);});
 const cache=createExampleCatalog(fetcher);
 await cache.prefetch();
 const result=await cache.load();
 expect(result.registry).toBeNull();expect(result.records.length).toBe(catalog.notices.length);
 expect(fetcher).toHaveBeenCalledTimes(2);
});
