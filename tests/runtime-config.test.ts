import {afterEach,expect,test,vi} from 'vitest';
import {loadConfig} from '../src/app/config';
import {API_ORIGINS,CONFIG_ORIGIN,CONNECT_SOURCES} from '../src/app/network-policy';

afterEach(()=>vi.unstubAllGlobals());
const config={apiEndpoint:`${API_ORIGINS[0]}/analyze`,syncEndpoint:`${API_ORIGINS[0]}/sync`};
test('native remote configuration comes from the exact trusted origin allowed by production CSP',async()=>{
 const fetcher=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>Response.json(config));vi.stubGlobal('fetch',fetcher);
 expect(await loadConfig(true)).toEqual(config);expect(fetcher.mock.calls[0][0]).toBe(`${CONFIG_ORIGIN}/campus-inbox/runtime-config.json`);
 expect(CONNECT_SOURCES.split(' ')).toContain(CONFIG_ORIGIN);
});
test('untrusted API origins and URL credentials are refused rather than outgrowing CSP',async()=>{
 for(const apiEndpoint of ['https://untrusted.example/analyze','https://user@123.57.30.129/analyze','https://123.57.30.129/analyze?secret=1','https://123.57.30.129/other']){
  vi.stubGlobal('fetch',async()=>Response.json({...config,apiEndpoint}));expect(await loadConfig(true)).toEqual(config);
 }
});
test('unavailable remote config falls back; development endpoints stay browser-only',async()=>{
 vi.stubGlobal('fetch',async()=>{throw new TypeError('offline');});expect(await loadConfig(true)).toEqual(config);
 const local={apiEndpoint:'http://127.0.0.1:8787/analyze',syncEndpoint:'http://127.0.0.1:8787/sync'};
 vi.stubGlobal('fetch',async()=>Response.json(local));expect(await loadConfig(false)).toEqual(local);expect(await loadConfig(true)).toEqual(config);
});
