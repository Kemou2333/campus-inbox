import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {RichText,safeMarkdownURL} from '../src/shared/ui/RichText';
import {SearchQueryContext} from '../src/shared/ui/SearchHighlight';
import {markdownLinkTargets} from '../server/vendor/markdown-parser.mjs';
import {ownSourceLinks} from '../server/contracts/markdown-links.mjs';
const hrefs=(html:string)=>[...html.matchAll(/href="([^"]+)"/g)].map(found=>found[1].replaceAll('&amp;','&'));
const render=(text:string,query='')=>renderToStaticMarkup(createElement(SearchQueryContext.Provider,{value:query},createElement(RichText,{text})));
test('deployed parser targets match actual react-markdown / remark-gfm rendering hrefs',()=>{
 for(const text of [
  '[入口](https&#x3A;//phishing.example/form)',
  '[入口](https://campus.example(note)@phishing.example/form)',
  '[入口](https://campus.example/form\\(v2\\)?x=1&amp;y=2)',
  '[入口][Name]\n\n[name]: https://campus.example/form(v2)?x=1&y=2',
  '<https://campus.example/form(v2)>',
  'www.campus.example/form。接着阅读。',
  '资料：https://示例.invalid/课程/第一讲。下一句。',
  '[资料](https://示例.invalid/课程（第二讲）)',
  '`https://not-clickable.example/`',
  '<a href="https://not-clickable.example/">HTML</a>'
 ]){
  const expected=markdownLinkTargets(text).map(target=>safeMarkdownURL(target.url,target.literal)).filter(Boolean);
  expect(hrefs(render(text)),text).toEqual(expected);
 }
});
test('ordinary Chinese punctuation and Unicode targets remain usable, even with search highlights',()=>{
 const text='资料：https://示例.invalid/课程/第一讲。下一句。',expected=new URL('https://示例.invalid/课程/第一讲').href;
 expect(hrefs(render(text))).toEqual([expected]);expect(hrefs(render(text,'课程'))).toEqual([expected]);
 expect(ownSourceLinks('[课程](https://示例.invalid/课程/第一讲)',text)).toBe(true);
 expect(ownSourceLinks('[另一课](https://示例.invalid/课程/第二讲)',text)).toBe(false);
 const explicit='[资料](https://示例.invalid/课程（第二讲）)';expect(hrefs(render(explicit))).toEqual([new URL('https://示例.invalid/课程（第二讲）').href]);
});
test('credentials, including the parentheses prefix attack, never become clickable links',()=>{
 for(const url of ['https://user:password@campus.example/form','https://campus.example(note)@phishing.example/form','https://user@campus.example/']){
  expect(safeMarkdownURL(url)).toBe('');expect(hrefs(render(`[入口](${url})`))).toEqual([]);
 }
});
