import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {RichText,safeMarkdownURL} from '../src/shared/ui/RichText';
import {makeTheme} from '../src/app/theme';

const render=(text:string,inline=false)=>renderToStaticMarkup(createElement(RichText,{text,inline}));
function luminance(hex:string){const c=hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];}
function contrast(a:string,b:string){const [light,dark]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (light+.05)/(dark+.05);}
describe('notification reading',()=>{
 it('renders emphasis, lists and original absolute links',()=>{const html=render('请提交**家长短信截图**。\n\n- **姓名**\n- 学号\n\n[办理入口](https://example.edu/form)');expect(html).toContain('<strong>家长短信截图</strong>');expect(html).toContain('<ul>');expect(html).toContain('href="https://example.edu/form"');expect(html).toContain('noopener noreferrer');});
 it('does not execute raw HTML, executable URLs or fetch remote images',()=>{const html=render('<script>alert(1)</script>\n\n[危险](javascript:alert%281%29)\n\n![图片](https://example.edu/secret.png)');expect(html).not.toMatch(/<script|<img|href="javascript:/);expect(html).toContain('危险');});
 it('retains the whole text of long Chinese emphasis',()=>{const text='将家长短信截图发给通知发布者';expect(render(`**${text}**`)).toContain(`<strong>${text}</strong>`);});
 it('keeps inline headings free from nested paragraphs',()=>{const html=render('提交 **截图**',true);expect(html).not.toContain('<p>');expect(html).toContain('<strong>截图</strong>');});
 it('only permits HTTP and HTTPS links',()=>{for(const url of ['javascript:alert(1)','data:text/html,test','file:///tmp/x','//example.com'])expect(safeMarkdownURL(url)).toBe('');expect(safeMarkdownURL('https://example.edu/x')).toBe('https://example.edu/x');});
 for(const dark of [false,true])it(`${dark?'dark':'light'} text and accent roles meet normal-text contrast`,()=>{const t=makeTheme(dark,null);for(const surface of [t.palette.background.default,t.palette.background.paper]){expect(contrast(t.palette.text.primary,surface)).toBeGreaterThanOrEqual(4.5);expect(contrast(t.palette.text.secondary,surface)).toBeGreaterThanOrEqual(4.5);expect(contrast(t.palette.primary.main,surface)).toBeGreaterThanOrEqual(4.5);}expect(contrast(t.palette.primary.main,t.palette.primary.contrastText)).toBeGreaterThanOrEqual(4.5);});
});
