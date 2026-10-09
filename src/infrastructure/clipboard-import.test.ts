import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_FILE_BYTES, MAX_NOTICE_FILE_BYTES } from './attachment-store';
import { readClipboard, readTransfer } from './clipboard-import';

// Node has no DOMParser. These fixtures exercise traversal, not HTML parsing;
// the integrated browser check covers the real inert template parser separately.
interface FixtureNode {
  nodeType: number;
  childNodes: FixtureNode[];
  textContent?: string;
  tagName?: string;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
}
const text = (value: string): FixtureNode => ({ nodeType: 3, childNodes: [], textContent: value });
function element(tagName: string, attrs: Record<string, string> = {}, ...childNodes: FixtureNode[]): FixtureNode {
  return { nodeType: 1, tagName, childNodes, getAttribute: name => attrs[name] ?? null,
    hasAttribute: name => Object.hasOwn(attrs, name) };
}
const fragment = (...childNodes: FixtureNode[]): FixtureNode => ({ nodeType: 11, childNodes });
const htmlFixtures = new Map<string, FixtureNode>();
const parseCalls: string[] = [];

function fixture(html: string, ...nodes: FixtureNode[]): string {
  htmlFixtures.set(html, fragment(...nodes));
  return html;
}
function transfer(plain = '', html = '', files: File[] = [], itemFiles: File[] = []): DataTransfer {
  return { files, getData: (type: string) => type === 'text/plain' ? plain : type === 'text/html' ? html : '',
    items: itemFiles.map(file => ({ kind: 'file', getAsFile: () => file })) } as unknown as DataTransfer;
}
function clipboardItem(types: Record<string, Blob>): ClipboardItem {
  return { types: Object.keys(types), getType: vi.fn(async type => types[type]) } as unknown as ClipboardItem;
}
const pngData = 'data:image/png;base64,AQID';
const png = () => new File([Uint8Array.of(1, 2, 3)], '图.png', { type: 'image/png', lastModified: 1 });

beforeEach(() => {
  htmlFixtures.clear(); parseCalls.length = 0;
  vi.stubGlobal('DOMParser', class {
    parseFromString(html: string) {
      parseCalls.push(html);
      return {
        createElement(tag: string) {
          if (tag !== 'template') throw new Error('Fixture only permits inert template content.');
          const template: { content?: FixtureNode; innerHTML?: string } = {};
          Object.defineProperty(template, 'innerHTML', { set(value: string) {
            const content = htmlFixtures.get(value);
            if (!content) throw new Error('Unknown fixture.');
            template.content = content;
          } });
          return template;
        },
      };
    }
  });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Clipboard import must never fetch.'); }));
});
afterEach(() => vi.unstubAllGlobals());

describe('paste event clipboard import', () => {
  it('retains ordinary text without requiring rich clipboard support', async () => {
    expect(await readTransfer(transfer('请于明天报名。\r\n地点待通知'))).toEqual({
      text: '请于明天报名。\n地点待通知', files: [], unavailableImages: 0, warnings: [],
    });
  });

  it('preserves ordinary pasted spaces and newlines around the cursor insertion', async () => {
    expect((await readTransfer(transfer(' 原文 \n'))).text).toBe(' 原文 \n');
    expect((await readTransfer(transfer(' '))).text).toBe(' ');
  });

  it('prefers supplied plain text while retaining accompanying images and files', async () => {
    const html = fixture('<p>HTML差异文字</p><img src="x">', element('P', {}, text('HTML差异文字')),
      element('IMG', { src: 'https://example.invalid/image.png' }));
    const pdf = new File(['PDF bytes'], '报名.pdf', { type: 'application/pdf' });
    const result = await readTransfer(transfer('官方通知原文', html, [png(), pdf]));
    expect(result.text).toBe('官方通知原文');
    expect(result.files.map(file => file.name)).toEqual(['图.png', '报名.pdf']);
    expect(result.unavailableImages).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads paste data and file wrappers synchronously before the event data expires', async () => {
    let available = true;
    const getData = vi.fn(() => { if (!available) throw new Error('Expired'); return '原文'; });
    const getAsFile = vi.fn(() => { if (!available) throw new Error('Expired'); return png(); });
    const pending = readTransfer({ getData, files: [], items: [{ kind: 'file', getAsFile }] } as unknown as DataTransfer);
    expect(getData).toHaveBeenCalledTimes(2);
    expect(getAsFile).toHaveBeenCalledTimes(1);
    available = false;
    expect((await pending).files).toHaveLength(1);
    expect(getData).toHaveBeenCalledTimes(2);
  });

  it('does not add the same native file exposed through files and items twice', async () => {
    const result = await readTransfer(transfer('通知', '', [png()], [png()]));
    expect(result.files).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it('keeps useful HTML paragraphs and absolute link destinations when plain text is missing', async () => {
    const html = fixture('<p>报名</p><p>填写<a href="https://docs.qq.com/a">表格</a><br>10月18日前</p>',
      element('P', {}, text('报名')), element('P', {}, text('填写'),
        element('A', { href: 'https://docs.qq.com/a' }, text('表格')), element('BR'), text('10月18日前')));
    const result = await readTransfer(transfer('', html));
    expect(result.text).toBe('报名\n\n填写表格 https://docs.qq.com/a\n10月18日前');
    expect(parseCalls).toEqual(['<!doctype html><html><body></body></html>']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves link targets advertised only in HTML alongside preferred plain text', async () => {
    const url = 'https://docs.qq.com/sheet/actual-file?tab=1';
    const html = fixture('plain label and real HTML destination',
      element('A', { href: url }, text('医保信息反馈表')), element('A', { href: url }, text('同一个表格')),
      element('A', { href: 'javascript:steal()' }, text('不安全链接')));
    expect((await readTransfer(transfer('请填写 医保信息反馈表 ', html))).text)
      .toBe(`请填写 医保信息反馈表 \n医保信息反馈表 ${url}`);
    expect((await readTransfer(transfer(`请填写 ${url}`, html))).text).toBe(`请填写 ${url}`);
  });

  it('omits scripts, styles, hidden content, image alt text and executable/local links', async () => {
    const html = fixture('dangerous HTML fixture', element('SCRIPT', {}, text('steal()')),
      element('STYLE', {}, text('body {}')), element('DIV', { hidden: '' }, text('隐藏内容')),
      element('SPAN', { 'aria-hidden': 'true' }, text('辅助隐藏')),
      element('DIV', { style: ' color: red; display : none !important;' }, text('不可见内容')),
      element('SPAN', { style: 'visibility: hidden' }, text('不显示')),
      element('DIV', { style: 'opacity:0' }, text('透明内容')),
      element('A', { href: 'javascript:alert(1)' }, text('报名')),
      element('A', { href: 'vbscript:alert(1)' }, text(' 链接')),
      element('A', { href: 'file:///Users/private.pdf' }, text(' 附件')),
      element('IMG', { src: 'https://example.invalid/p.png', alt: '图片秘密文字' }),
      element('IFRAME', { src: 'https://example.invalid/frame' }, text('iframe正文')));
    const result = await readTransfer(transfer('', html));
    expect(result.text).toBe('报名 链接 附件');
    expect(result.unavailableImages).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('imports local data image bytes without any URL request', async () => {
    const html = fixture('data image fixture', element('P', {}, text('缴费通知')), element('IMG', { src: pngData }));
    const result = await readTransfer(transfer('', html));
    expect(result.text).toBe('缴费通知');
    expect(result.files[0]).toMatchObject({ type: 'image/png', size: 3 });
    expect(new Uint8Array(await result.files[0].arrayBuffer())).toEqual(Uint8Array.of(1, 2, 3));
    expect(result.unavailableImages).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deduplicates native image bytes with their HTML data representation', async () => {
    const html = fixture('duplicate image fixture', element('IMG', { src: pngData }), element('IMG', { src: pngData }));
    const result = await readTransfer(transfer('图文通知', html, [png()], [png()]));
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe('图.png');
    expect(result.unavailableImages).toBe(0);
  });

  it('keeps additional local images whose bytes differ from the native image', async () => {
    const html = fixture('different image fixture', element('IMG', { src: 'data:image/png;base64,BAUG' }));
    const result = await readTransfer(transfer('图文通知', html, [png()]));
    expect(result.files).toHaveLength(2);
    expect(new Uint8Array(await result.files[1].arrayBuffer())).toEqual(Uint8Array.of(4, 5, 6));
  });

  it('reports remote, blob and local HTML image references without attempting to load them', async () => {
    const html = fixture('unavailable images fixture', ...['https://a.invalid/p.png', 'blob:unavailable', 'file:///private.png']
      .map(src => element('IMG', { src })));
    const result = await readTransfer(transfer('文字仍保留', html));
    expect(result.files).toHaveLength(0);
    expect(result.unavailableImages).toBe(3);
    expect(result.text).toBe('文字仍保留');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not hide a missing remote image behind an already matched native/data representation', async () => {
    const html = fixture('matched plus missing fixture', element('IMG', { src: pngData }),
      element('IMG', { src: 'https://a.invalid/missing.png' }));
    const result = await readTransfer(transfer('原文', html, [png()]));
    expect(result.files).toHaveLength(1);
    expect(result.unavailableImages).toBe(1);
  });

  it('rejects SVG, HTML and damaged data URLs while retaining ordinary text', async () => {
    const html = fixture('unsupported data fixture', ...['data:image/svg+xml;base64,PHN2Zz4=',
      'data:text/html;base64,PGgxPng8L2gxPg==', 'data:image/png;base64,A=='].map(src => element('IMG', { src })));
    const result = await readTransfer(transfer('可信正文', html));
    expect(result.text).toBe('可信正文');
    expect(result.files).toHaveLength(0);
    expect(result.unavailableImages).toBe(3);
    expect(result.warnings).toContain('剪贴板中的图片格式不受支持。');
    expect(result.warnings).toContain('剪贴板中的图片数据不完整。');
  });

  it('rejects an oversized data URL before attempting base64 decoding', async () => {
    const source = 'data:image/png;base64,' + 'A'.repeat(Math.ceil(MAX_FILE_BYTES / 3) * 4 + 101);
    const html = fixture('oversized data fixture', element('IMG', { src: source }));
    const decode = vi.fn(() => { throw new Error('Should not decode.'); });
    vi.stubGlobal('atob', decode);
    const result = await readTransfer(transfer('原文', html));
    expect(result.files).toHaveLength(0);
    expect(result.warnings).toContain('单个附件不能超过 5 MB。');
    expect(decode).not.toHaveBeenCalled();
  });

  it('preserves text and accepts only files within the existing count and byte limits', async () => {
    const many = Array.from({ length: 11 }, (_, index) => new File(['small'], `${index}.txt`));
    const result = await readTransfer(transfer('正文', '', many));
    expect(result.files).toHaveLength(10);
    expect(result.warnings).toEqual(['每条通知最多添加 10 个附件。']);
    expect(result.text).toBe('正文');
    const large = Array.from({ length: 5 }, (_, index) => new File([new Uint8Array(MAX_FILE_BYTES)], `${index}.bin`));
    const byteResult = await readTransfer(transfer('正文', '', large));
    expect(byteResult.files.reduce((size, file) => size + file.size, 0)).toBe(MAX_NOTICE_FILE_BYTES);
    expect(byteResult.warnings).toEqual(['一条通知的附件总大小不能超过 20 MB。']);
    const oversized = await readTransfer(transfer('正文', '', [new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'large.bin')]));
    expect(oversized.files).toHaveLength(0);
    expect(oversized.text).toBe('正文');
    expect(oversized.warnings).toEqual(['单个附件不能超过 5 MB。']);
  });

  it('does not turn native file paths or file-only names into notification text', async () => {
    const file = new File(['body'], '通知.pdf', { type: 'application/pdf' });
    for (const path of ['file:///Users/kemou/通知.pdf', 'C:\\Users\\user\\通知.pdf', '/Users/kemou/通知.pdf', '通知.pdf']) {
      expect((await readTransfer(transfer(path, '', [file]))).text).toBe('');
    }
    expect((await readTransfer(transfer('请完成申请。\n附件：通知.pdf', '', [file]))).text)
      .toBe('请完成申请。\n附件：通知.pdf');
  });

  it('retains text if HTML parsing or a file wrapper fails', async () => {
    const data = transfer('原文', 'not a registered HTML fixture');
    Object.defineProperty(data, 'items', { value: [{ kind: 'file', getAsFile: () => { throw new Error('Unavailable'); } }] });
    const result = await readTransfer(data);
    expect(result.text).toBe('原文');
    expect(result.warnings).toHaveLength(1);
  });

  it('skips exceptionally large HTML without parsing or dropping available text and files', async () => {
    const result = await readTransfer(transfer(' 可用文字 ', 'x'.repeat(30 * 1024 * 1024 + 1), [png()]));
    expect(parseCalls).toHaveLength(0);
    expect(result.text).toBe(' 可用文字 ');
    expect(result.files).toHaveLength(1);
    expect(result.warnings).toEqual(['剪贴板内容过大，已保留文字和文件。']);
  });
});

describe('paste button clipboard import', () => {
  it('reads mixed representations but imports only one image representation per item', async () => {
    const html = fixture('read API HTML fixture', element('P', {}, text('HTML正文')), element('IMG', { src: pngData }));
    const item = clipboardItem({ 'text/plain': new Blob(['通知原文']), 'text/html': new Blob([html]),
      'image/jpeg': new Blob([Uint8Array.of(1, 2, 3)], { type: 'image/jpeg' }),
      'image/png': png() });
    const read = vi.fn(async () => [item]);
    const readText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { read, readText } });
    const result = await readClipboard();
    expect(read).toHaveBeenCalledTimes(1);
    expect(readText).not.toHaveBeenCalled();
    expect(item.getType).toHaveBeenCalledTimes(3);
    expect(item.getType).not.toHaveBeenCalledWith('image/jpeg');
    expect(result.text).toBe('通知原文');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].type).toBe('image/png');
    expect(result.unavailableImages).toBe(0);
  });

  it('preserves HTML-only text from another clipboard item and an actual file name', async () => {
    const html = fixture('second item fixture', element('P', {}, text('第二段正文')));
    const file = new File(['PDF bytes'], '报名表.pdf', { type: 'application/pdf' });
    vi.stubGlobal('navigator', { clipboard: { read: vi.fn(async () => [
      clipboardItem({ 'text/plain': new Blob(['第一段正文']) }), clipboardItem({ 'text/html': new Blob([html]) }),
      clipboardItem({ 'application/pdf': file }),
    ]) } });
    const result = await readClipboard();
    expect(result.text).toBe('第一段正文\n\n第二段正文');
    expect(result.files[0]).toMatchObject({ name: '报名表.pdf', type: 'application/pdf' });
  });

  it('uses readText only when rich clipboard read is unavailable', async () => {
    const readText = vi.fn(async () => ' 旧浏览器文字 \n');
    vi.stubGlobal('navigator', { clipboard: { readText } });
    expect(await readClipboard()).toEqual({ text: ' 旧浏览器文字 \n', files: [], unavailableImages: 0, warnings: [] });
    expect(readText).toHaveBeenCalledTimes(1);
  });

  it('does not make another clipboard request after a permission rejection', async () => {
    const rejection = new DOMException('Clipboard read denied', 'NotAllowedError');
    const read = vi.fn(async () => { throw rejection; });
    const readText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { read, readText } });
    await expect(readClipboard()).rejects.toBe(rejection);
    expect(read).toHaveBeenCalledTimes(1);
    expect(readText).not.toHaveBeenCalled();
  });

  it('does not mistake alternate rich text formats for file attachments', async () => {
    const item = clipboardItem({ 'text/plain': new Blob(['通知']), 'text/rtf': new Blob(['RTF']),
      'application/xhtml+xml': new Blob(['<p>通知</p>']) });
    vi.stubGlobal('navigator', { clipboard: { read: vi.fn(async () => [item]) } });
    const result = await readClipboard();
    expect(result.text).toBe('通知');
    expect(result.files).toHaveLength(0);
    expect(item.getType).toHaveBeenCalledTimes(1);
  });

  it('preserves available text when a file representation fails', async () => {
    const item = clipboardItem({ 'text/plain': new Blob(['正文']), 'image/png': png() });
    vi.mocked(item.getType).mockImplementation(async type => {
      if (type === 'image/png') throw new Error('Unavailable');
      return new Blob(['正文']);
    });
    vi.stubGlobal('navigator', { clipboard: { read: vi.fn(async () => [item]) } });
    const result = await readClipboard();
    expect(result.text).toBe('正文');
    expect(result.files).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });
});
