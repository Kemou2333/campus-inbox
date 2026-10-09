import type { TimeSpec } from './types';

const fields = ['type', 'year', 'month', 'day', 'hour', 'minute', 'rawText'] as const;
const parts = ['year', 'month', 'day', 'hour', 'minute'] as const;
const numberPattern = '(?:\\d{1,2}|[零〇一二三四五六七八九十两]{1,3})';

function empty(rawText: string): TimeSpec {
  return { type: 'unknown', year: null, month: null, day: null, hour: null, minute: null, rawText };
}
function chineseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === '十') return 10;
  if (value.includes('十')) {
    const [tens, units] = value.split('十');
    return (tens ? digits[tens] : 1) * 10 + (units ? digits[units] : 0);
  }
  return digits[value] ?? NaN;
}
function validParts(s: TimeSpec): boolean {
  if (parts.some(key => s[key] !== null && !Number.isInteger(s[key]))) return false;
  if (s.year !== null && (s.year < 1000 || s.year > 9999)) return false;
  if (s.month !== null && (s.month < 1 || s.month > 12)) return false;
  if (s.day !== null && (s.day < 1 || s.day > 31)) return false;
  if (s.month !== null && s.day !== null) {
    const leap = s.year === null || (s.year % 4 === 0 && (s.year % 100 !== 0 || s.year % 400 === 0));
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (s.day > days[s.month - 1]) return false;
  }
  return !(s.hour !== null && (s.hour < 0 || s.hour > 24)
    || s.minute !== null && (s.minute < 0 || s.minute > 59)
    || s.hour === null && s.minute !== null || s.hour === 24 && s.minute !== 0);
}
function classify(s: TimeSpec): TimeSpec['type'] {
  if (s.year !== null && s.month !== null && s.day !== null) {
    if (s.hour !== null && s.minute !== null) return 'date_time';
    if (s.hour === null && s.minute === null) return 'date';
  }
  return parts.some(key => s[key] !== null) ? 'partial' : 'unknown';
}

/** Port of the established time parser: no current-year or publication-time guesses. */
export function timeFromText(rawText: string): TimeSpec {
  const s = rawText.trim(), out = empty(s);
  if (new RegExp(`(?:月|日|号|时|点)\\s*[-~～—–至到]\\s*(?:\\d|[一二三四五六七八九十])`).test(s)) return out;
  if (!s || /(?:每(?:天|日|周|星期|月|年)|隔周|逢周)/.test(s)) return out;
  if (new RegExp(`(?:\\d{1,4}|[一二三四五六七八九十]{1,3})\\s*(?:至|到|[-~～—–])\\s*(?:\\d{1,4}|[一二三四五六七八九十]{1,3})(?:年|月|日|号|时|点)`).test(s)) return out;
  const dates = [...s.matchAll(new RegExp(`(?:(\\d{4})年)?(${numberPattern})月(${numberPattern})(?:日|号)|(\\d{4})[-/]([0-9]{1,2})[-/]([0-9]{1,2})|(${numberPattern})(?:日|号)`, 'g'))];
  const clocks = [...s.matchAll(new RegExp(`(\\d{1,2})[:：](\\d{2})|(${numberPattern})(?:时|点)(?:(${numberPattern})分)?`, 'g'))];
  const pointIndex = dates[0]?.index ?? clocks[0]?.index ?? Infinity;
  if (dates.length > 1 || clocks.length > 1 || [...s.matchAll(/(?:至|到|[~～—–])\s*(?:\d|[一二三四五六七八九十])/g)].some(m => (m.index ?? 0) > pointIndex)) return out;
  if (dates.length) {
    const m = dates[0];
    if (m[2] !== undefined) { out.year = m[1] === undefined ? null : Number(m[1]); out.month = chineseNumber(m[2]); out.day = chineseNumber(m[3]); }
    else if (m[4] !== undefined) { out.year = Number(m[4]); out.month = Number(m[5]); out.day = Number(m[6]); }
    else out.day = chineseNumber(m[7]);
  } else {
    const year = s.match(/(?:^|[^\d])(\d{4})年(?!级|度|第|第一|第二|春|秋|学期)/);
    const month = s.match(new RegExp(`(${numberPattern})月`));
    if (year && !/学年/.test(s)) out.year = Number(year[1]);
    if (month) out.month = chineseNumber(month[1]);
  }
  if (clocks.length) {
    const m = clocks[0], end = (m.index ?? 0) + m[0].length;
    if (/^(?:半|一刻|三刻|左右|[:：]\d{2}(?!\d))/.test(s.slice(end))) return empty(s);
    out.hour = chineseNumber(m[1] === undefined ? m[3] : m[1]);
    out.minute = m[2] === undefined ? m[4] === undefined ? 0 : chineseNumber(m[4]) : Number(m[2]);
    const prefix = s.slice(Math.max(0, (m.index ?? 0) - 6), m.index);
    if (out.hour !== null && /(?:下午|晚上|傍晚)/.test(prefix) && out.hour >= 1 && out.hour <= 11) out.hour += 12;
    if (out.hour === 12 && /(?:晚上|傍晚)/.test(prefix)) return empty(s);
  }
  if (!validParts(out)) return empty(s);
  if (!dates.length && /(?:今天|明天|后天|昨天|今晚|今早|明早|本周|下周|上周|这周|周[一二三四五六日天末]|星期[一二三四五六日天])/.test(s)) {
    out.year = null; out.month = null; out.day = null; out.type = 'relative';
  } else out.type = classify(out);
  return out;
}

export function parseTimeSpec(value: unknown, rawText: string): TimeSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('结构化时间格式不正确');
  const o = value as Record<string, unknown>;
  if (fields.some(key => !(key in o)) || fields.some(key => key === 'type' || key === 'rawText' ? typeof o[key] !== 'string' : o[key] !== null && !Number.isInteger(o[key]))) throw new Error('结构化时间字段不完整');
  const s: TimeSpec = { type: o.type as TimeSpec['type'], year: o.year as number | null, month: o.month as number | null, day: o.day as number | null, hour: o.hour as number | null, minute: o.minute as number | null, rawText: (o.rawText as string).trim() };
  if (!['date_time', 'date', 'partial', 'relative', 'unknown'].includes(s.type) || !validParts(s) || s.rawText !== rawText.trim()) throw new Error('结构化时间与原文不一致');
  if (s.type === 'unknown') {
    if (parts.some(key => s[key] !== null)) throw new Error('未知时间不能包含猜测日期');
    return s;
  }
  const expected = timeFromText(rawText);
  if (fields.some(key => s[key] !== expected[key])) throw new Error('结构化时间包含原文未确认的内容');
  return s;
}

const pad = (n: number | null) => String(n).padStart(2, '0');
export function timeSpecToISO(s: TimeSpec): string | null {
  if (s.type !== 'date_time') return null;
  if (s.hour === 24) return new Date(Date.UTC(s.year!, s.month! - 1, s.day! + 1)).toISOString().slice(0, 19);
  return `${s.year}-${pad(s.month)}-${pad(s.day)}T${pad(s.hour)}:${pad(s.minute)}:00`;
}
export function timeSpecToDate(s: TimeSpec): string | null {
  if (s.type !== 'date' && s.type !== 'date_time') return null;
  return s.hour === 24 ? timeSpecToISO(s)!.slice(0, 10) : `${s.year}-${pad(s.month)}-${pad(s.day)}`;
}
