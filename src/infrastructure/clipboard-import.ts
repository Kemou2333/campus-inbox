import { MAX_FILE_BYTES, MAX_NOTICE_FILE_BYTES, MAX_NOTICE_FILES } from './attachment-store';

export interface ClipboardImport {
  text: string;
  files: File[];
  /** HTML images for which the clipboard supplied no usable local bytes. */
  unavailableImages: number;
  warnings: string[];
}

interface ClipboardSource { plain: string; html: string }
interface ClipboardSnapshot { sources: ClipboardSource[]; files: File[]; warnings: string[] }
interface ParsedHtml { text: string; images: string[]; links: { label: string; href: string }[] }

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp',
};
const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'TR', 'BLOCKQUOTE', 'PRE', 'HR']);
const OMIT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK',
  'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'CANVAS', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON',
  'AUDIO', 'VIDEO', 'SOURCE']);
const MAX_HTML_CHARS = 30 * 1024 * 1024;

function plainFilePaths(text: string, files: readonly File[]): boolean {
  if (!files.length || !text.trim()) return false;
  const names = new Set(files.map(file => file.name));
  return text.trim().split(/\r?\n/).every(line => names.has(line.trim())
    || /^(?:file:\/\/|[A-Za-z]:\\|\/(?:Users|home|storage|sdcard|tmp|private|var)\/)/i.test(line.trim()));
}

/** Parse into inert template content: even image and iframe resources stay unloaded. */
function parseHtml(html: string): ParsedHtml {
  const doc = new DOMParser().parseFromString('<!doctype html><html><body></body></html>', 'text/html');
  const template = doc.createElement('template');
  template.innerHTML = html;
  const images: string[] = [];
  const links: ParsedHtml['links'] = [];
  function walk(node: Node): string {
    if (node.nodeType === 3) return node.textContent ?? '';
    if (node.nodeType !== 1 && node.nodeType !== 11) return '';
    if (node.nodeType === 11) return Array.from(node.childNodes, walk).join('');
    const element = node as Element;
    const tag = element.tagName.toUpperCase();
    const style = element.getAttribute('style') ?? '';
    if (OMIT.has(tag) || element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true'
      || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0)(?:\s*!important)?\s*(?:;|$)/i.test(style)) return '';
    if (tag === 'IMG') {
      images.push(element.getAttribute('src') ?? '');
      return '';
    }
    if (tag === 'BR') return '\n';
    let text = Array.from(node.childNodes, walk).join('');
    if (tag === 'A') {
      const href = element.getAttribute('href')?.trim() ?? '';
      try {
        const url = new URL(href);
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          text = text.trim();
          links.push({ label: text, href });
          if (!text) text = href;
          else if (text !== href) text += ` ${href}`;
        }
      } catch { /* Relative paths and executable or local links are not imported. */ }
    }
    return BLOCKS.has(tag) ? `\n${text}\n` : tag === 'TD' || tag === 'TH' ? `${text}\t` : text;
  }
  const text = walk(template.content).replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text, images, links };
}

function dataImage(source: string, index: number): File {
  // Reject before copying or decoding a payload larger than our persistence boundary.
  const maxEncoded = Math.ceil(MAX_FILE_BYTES / 3) * 4;
  if (source.length > maxEncoded + 100) throw new Error('单个附件不能超过 5 MB。');
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif|avif|bmp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(source);
  if (!match) throw new Error('剪贴板中的图片格式不受支持。');
  const payload = match[2].replace(/\s/g, '');
  if (!payload || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
    throw new Error('剪贴板中的图片数据不完整。');
  }
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  if (payload.length / 4 * 3 - padding > MAX_FILE_BYTES) throw new Error('单个附件不能超过 5 MB。');
  let binary: string;
  try { binary = atob(payload); }
  catch { throw new Error('剪贴板中的图片数据不完整。'); }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const type = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  return new File([bytes], `粘贴图片-${index + 1}.${IMAGE_EXTENSIONS[type]}`, { type });
}

async function sameBytes(left: File, right: File): Promise<boolean> {
  if (left.size !== right.size) return false;
  const [a, b] = await Promise.all([left.arrayBuffer(), right.arrayBuffer()]);
  const first = new Uint8Array(a), second = new Uint8Array(b);
  return first.every((byte, index) => byte === second[index]);
}

async function finish(snapshot: ClipboardSnapshot): Promise<ClipboardImport> {
  const warnings = [...snapshot.warnings];
  const files: File[] = [];
  let bytes = 0;
  const push = (file: File): boolean => {
    if (file.size > MAX_FILE_BYTES) { warnings.push('单个附件不能超过 5 MB。'); return false; }
    if (files.length >= MAX_NOTICE_FILES) { warnings.push('每条通知最多添加 10 个附件。'); return false; }
    if (bytes + file.size > MAX_NOTICE_FILE_BYTES) { warnings.push('一条通知的附件总大小不能超过 20 MB。'); return false; }
    files.push(file); bytes += file.size; return true;
  };
  const seenFiles = new Set<string>();
  for (const file of snapshot.files) {
    // DataTransfer.files and items often expose the same file as separate wrappers.
    const signature = JSON.stringify([file.name, file.size, file.type, file.lastModified]);
    if (!seenFiles.has(signature)) { seenFiles.add(signature); push(file); }
  }
  const imageFiles = files.filter(file => file.type.startsWith('image/'));
  const representedNative = new Set<File>();
  const imageSources: string[] = [];
  const textParts: string[] = [];
  for (const source of snapshot.sources) {
    let parsed: ParsedHtml = { text: '', images: [], links: [] };
    if (source.html) {
      if (source.html.length > MAX_HTML_CHARS) warnings.push('剪贴板内容过大，已保留文字和文件。');
      else {
        try { parsed = parseHtml(source.html); }
        catch { warnings.push('部分剪贴板内容未能读取；已保留可用文字和附件。'); }
      }
    }
    const plain = plainFilePaths(source.plain, snapshot.files) ? '' : source.plain;
    const fallback = plainFilePaths(parsed.text, snapshot.files) ? '' : parsed.text;
    let text = (plain !== '' ? plain : fallback).replace(/\r\n?/g, '\n');
    if (plain !== '') {
      // Rich copies can advertise only a link label in text/plain. Preserve the
      // supplied body but append actual attachment/form destinations once.
      for (const { label, href } of parsed.links) {
        if (!text.includes(href)) text += `${text.endsWith('\n') ? '' : '\n'}${label && label !== href ? `${label} ` : ''}${href}`;
      }
    }
    if (text && !textParts.includes(text)) textParts.push(text);
    imageSources.push(...parsed.images);
  }
  const pendingMissing: string[] = [];
  const seenData = new Set<string>();
  for (const source of imageSources) {
    if (!/^data:/i.test(source)) { pendingMissing.push(source); continue; }
    if (seenData.has(source)) continue;
    if (seenData.size >= MAX_NOTICE_FILES) { warnings.push('每条通知最多添加 10 个附件。'); continue; }
    seenData.add(source);
    try {
      const file = dataImage(source, files.length);
      let existing: File | undefined;
      for (const native of imageFiles) {
        if (await sameBytes(native, file)) { existing = native; break; }
      }
      if (existing) representedNative.add(existing);
      else push(file);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : '剪贴板中的图片未能读取。');
      pendingMissing.push(source);
    }
  }
  // A remote HTML reference is not a missing image when native bytes accompanied it.
  const availableRepresentations = imageFiles.length - representedNative.size;
  return {
    text: textParts.join('\n\n'), files,
    unavailableImages: Math.max(0, pendingMissing.length - availableRepresentations),
    warnings: [...new Set(warnings)],
  };
}

/** Must be called during the paste event, before browser clipboard data is released. */
export function readTransfer(data: DataTransfer): Promise<ClipboardImport> {
  const warnings: string[] = [];
  const getData = (type: string): string => {
    try { return data.getData(type); }
    catch { warnings.push('部分剪贴板内容未能读取；已保留可用文字和附件。'); return ''; }
  };
  const source = { plain: getData('text/plain'), html: getData('text/html') };
  const files = Array.from(data.files ?? []);
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    try {
      const file = item.getAsFile();
      if (file) files.push(file);
    } catch { warnings.push('部分剪贴板内容未能读取；已保留可用文字和附件。'); }
  }
  return finish({ sources: [source], files, warnings });
}

/** Read once from a user gesture; a permission rejection never triggers another read. */
export async function readClipboard(): Promise<ClipboardImport> {
  const clipboard = navigator.clipboard;
  if (!clipboard) throw new Error('浏览器无法读取剪贴板，请直接粘贴。');
  if (typeof clipboard.read !== 'function') {
    const text = await clipboard.readText();
    return { text: text.replace(/\r\n?/g, '\n'), files: [], unavailableImages: 0, warnings: [] };
  }
  const items = await clipboard.read();
  const snapshot: ClipboardSnapshot = { sources: [], files: [], warnings: [] };
  for (const [index, item] of items.entries()) {
    const source: ClipboardSource = { plain: '', html: '' };
    for (const [type, field] of [['text/plain', 'plain'], ['text/html', 'html']] as const) {
      if (!item.types.includes(type)) continue;
      try { source[field] = await (await item.getType(type)).text(); }
      catch { snapshot.warnings.push('部分剪贴板内容未能读取；已保留可用文字和附件。'); }
    }
    snapshot.sources.push(source);
    const type = Object.keys(IMAGE_EXTENSIONS).find(candidate => item.types.includes(candidate))
      ?? item.types.find(candidate => !candidate.startsWith('text/')
        && candidate !== 'image/svg+xml' && candidate !== 'application/xhtml+xml'
        && candidate !== 'application/rtf' && !candidate.startsWith('web '));
    if (!type) {
      if (item.types.includes('image/svg+xml')) snapshot.warnings.push('剪贴板中的图片格式不受支持。');
      continue;
    }
    if (snapshot.files.length >= MAX_NOTICE_FILES) { snapshot.warnings.push('每条通知最多添加 10 个附件。'); continue; }
    try {
      const blob = await item.getType(type);
      if (blob.size > MAX_FILE_BYTES) { snapshot.warnings.push('单个附件不能超过 5 MB。'); continue; }
      const name = blob instanceof File ? blob.name : `粘贴附件-${index + 1}.${IMAGE_EXTENSIONS[type] ?? (type === 'application/pdf' ? 'pdf' : 'bin')}`;
      snapshot.files.push(new File([blob], name, { type: blob.type || type }));
    } catch { snapshot.warnings.push('部分剪贴板内容未能读取；已保留可用文字和附件。'); }
  }
  return finish(snapshot);
}
