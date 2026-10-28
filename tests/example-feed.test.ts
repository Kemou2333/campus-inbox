import {afterEach,beforeEach,describe,expect,test,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import type {CampusController} from '../src/app/useCampus';
import {FeedPage,createFeedViewState,type FeedViewState} from '../src/features/notices/FeedPage';
import type {NoticeActions} from '../src/features/notices/NoticeCard';
import {EXAMPLES_HIDDEN_KEY,groupExampleNotices,isExampleNotice,readExamplesHidden,writeExamplesHidden} from '../src/domain/examples';
import {createNotice} from '../src/domain/notice';
import type {Notice,NoticeAnalysis} from '../src/domain/types';
import exampleIDs from '../src/domain/example-ids.json';
import {EMPTY_CAMPUS_PREFERENCES} from '../src/domain/campus-preferences';
import type {AnalysisJob} from '../src/infrastructure/analysis-jobs';

// Exercise the actual feed selection/grouping/counts without depending on card
// markup. Browser checks separately cover click animations and persistence.
vi.mock('../src/features/notices/NoticeCard',()=>({NoticeCard:({notice}:{notice:Notice})=>createElement('article',{'data-notice-id':notice.id},notice.title)}));

const storage=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},values};};
let local:ReturnType<typeof storage>;
beforeEach(()=>{local=storage();vi.stubGlobal('localStorage',local);});
afterEach(()=>vi.unstubAllGlobals());
const analysis:NoticeAnalysis={schemaVersion:4,kind:'task',title:'办理事项',summary:'通知摘要',deadline:null,deadlineText:'',timeline:[],tasks:[{text:'提交材料',assignee:null,scope:'all',condition:'',details:[],steps:[],time:null,timeText:'',location:null}],materials:[],warnings:[],reminders:[]};
function notice(id:string,createdAt='2026-10-01T00:00:00Z',extra:Partial<Notice>={}):Notice{return {...createNotice(analysis,'通知原文',createdAt),id,...extra};}
function feed(notices:Notice[],view:Partial<FeedViewState>={},analysisJobs:AnalysisJob[]=[]){
  const app={analysisJobs,platform:{kind:"browser"},notices,unreadNoticeIDs:[],markNoticeRead:vi.fn(),localDataScope:'device',preferences:structuredClone(EMPTY_CAMPUS_PREFERENCES),report:vi.fn(),loadExamples:vi.fn()} as unknown as CampusController;
  const html=renderToStaticMarkup(createElement(FeedPage,{app,actions:{} as NoticeActions,onCompose:()=>{},focusID:null,viewState:{...createFeedViewState(),...view}}));
  return {html,ids:[...html.matchAll(/data-notice-id="([^"]+)"/g)].map(match=>match[1]),text:html.replace(/<style[^>]*>[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,'')};
}

describe('reviewed built-in identity and visibility',()=>{
  test('identity registry is exactly the reviewed current and legacy catalogs, with no raw content',async()=>{
    const current=JSON.parse(await readFile(new URL('../public/examples.json',import.meta.url),'utf8')).notices as Notice[];
    const legacy=JSON.parse(await readFile(new URL('../public/examples-legacy.json',import.meta.url),'utf8')) as {id:string}[];
    expect(exampleIDs).toEqual([...new Set([...current,...legacy].map(n=>n.id))].sort());
    for(const n of [...current,...legacy])expect(isExampleNotice(n)).toBe(true);
    for(const id of ['example-personal','example-reading-v25-999','my-notice','example-v1-v7-80'])expect(isExampleNotice({id})).toBe(false);
  });
  test('modified legacy progress stays intact and is grouped without mutating any record',()=>{
    const legacy=notice('example-reading-v21-0','2026-10-01T00:00:00Z',{note:'我的笔记',favorite:true,completed:true,attachments:['my-file']});
    legacy.tasks[0].steps.push({id:'step',text:'检查',details:[],note:'步骤笔记',completed:true});
    const personal=notice('example-personal'),before=JSON.stringify([legacy,personal]);
    const groups=groupExampleNotices([legacy,personal]);
    expect(groups.personal).toEqual([personal]);expect(groups.examples).toEqual([legacy]);expect(groups.examples[0]).toBe(legacy);
    expect(JSON.stringify([legacy,personal])).toBe(before);
  });
  test('hide/show uses an independent durable preference and never alters notice data',()=>{
    local.setItem('campus-inbox:notices:v5','preserve records');
    expect(readExamplesHidden(local)).toBe(false);
    writeExamplesHidden(local,true);expect(local.getItem(EXAMPLES_HIDDEN_KEY)).toBe('hidden');expect(readExamplesHidden(local)).toBe(true);
    expect(readExamplesHidden({getItem:key=>local.getItem(key)})).toBe(true);
    writeExamplesHidden(local,false);expect(readExamplesHidden(local)).toBe(false);
    expect(local.getItem('campus-inbox:notices:v5')).toBe('preserve records');
    expect(readExamplesHidden({getItem:()=>{throw new Error('unavailable');}})).toBe(false);
  });
});

describe('feed keeps examples behind personal records',()=>{
  test('each group follows the selected sort while real records always precede examples',()=>{
    const records=[notice('example-reading-v25-0','2026-10-10T00:00:00Z'),notice('mine-old'),notice('example-reading-v25-1','2026-10-12T00:00:00Z'),notice('mine-new','2026-10-03T00:00:00Z')];
    const result=feed(records,{sort:'newest'});
    expect(result.ids).toEqual(['mine-new','mine-old','example-reading-v25-1','example-reading-v25-0']);
    expect(result.text).toContain('待办 2');expect(result.text).toContain('示例通知 2');expect(result.html).toContain('example-group-divider');
  });
  test('hidden samples do not contribute to cards, category counts or favorite badges',()=>{
    writeExamplesHidden(local,true);
    const result=feed([notice('mine'),notice('example-reading-v25-0',undefined,{favorite:true})]);
    expect(result.ids).toEqual(['mine']);expect(result.text).toContain('待办 1');expect(result.text).toContain('显示示例');expect(result.text).not.toContain('已隐藏 1 条示例');expect(result.html).not.toContain('example-group-divider');
    expect(result.html).toContain('显示全部示例');
  });
  test('search matching only samples never changes real counts into example counts',()=>{
    const result=feed([notice('mine'),notice('example-reading-v25-0',undefined,{title:'检索词'})],{query:'检索词'});
    expect(result.ids).toEqual(['example-reading-v25-0']);expect(result.text).toContain('待办 1');expect(result.text).toContain('示例通知 1');
  });
  test('favorites and completed/reminder tabs all preserve the same grouping rule',()=>{
    for(const tab of [0,1,2] as const){
      const extra:Partial<Notice>=tab===2?{completed:true}:tab===1?{kind:'reminder',tasks:[],reminders:[{id:'r',text:'提醒内容',note:''}]}:{};
      const records=[notice('example-reading-v25-0',undefined,{...extra,favorite:true}),notice('mine',undefined,{...extra,favorite:true}),notice('other',undefined,extra)];
      const result=feed(records,{tab,favoritesOnly:true});
      expect(result.ids).toEqual(['mine','example-reading-v25-0']);
      expect(result.text).toContain(`${tab===0?'待办':tab===1?'提醒':'已完成'} 1`);
      writeExamplesHidden(local,true);expect(feed(records,{tab,favoritesOnly:true}).ids).toEqual(['mine']);writeExamplesHidden(local,false);
    }
  });
  test('example-only libraries keep useful sample counts and an empty state can restore hidden samples',()=>{
    const records=[notice('example-reading-v25-0'),notice('example-reading-v25-1')];
    expect(feed(records).text).toContain('待办 2');
    writeExamplesHidden(local,true);const hidden=feed(records);expect(hidden.ids).toEqual([]);expect(hidden.text).toContain('待办 0');expect(hidden.text).toContain('显示示例');
  });
});


describe('pending analysis cards',()=>{
 const job=(extra:Partial<AnalysisJob>={}):AnalysisJob=>({id:'pending-job',requestId:'request-one',status:'running',createdAt:'2026-10-28T00:00:00Z',updatedAt:'2026-10-28T00:00:00Z',noticeIds:[],...extra});
 test('running work occupies the list without empty-state text or a second explanation',()=>{
  const result=feed([],{},[job()]);expect(result.html).toContain('data-pending-job-id="pending-job"');expect(result.html).toContain('aria-busy="true"');expect(result.text).not.toContain('暂时没有待办');expect(result.text).not.toContain('复杂通知可能超过一分钟');
 });
 test('completed work keeps its slot until its actual records exist, while failed work does not look active',()=>{
  const completed=job({status:'completed',noticeIds:['new-record']});expect(feed([],{},[completed]).html).toContain('data-pending-job-id="pending-job"');
  const saved=feed([notice('new-record')],{},[completed]);expect(saved.html).not.toContain('data-pending-job-id');expect(saved.ids).toEqual(['new-record']);
  const failed=feed([],{},[job({status:'failed'})]);expect(failed.html).not.toContain('data-pending-job-id');expect(failed.text).toContain('暂时没有待办');
 });
});
