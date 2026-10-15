import type {Notice, TimeSpec} from './types';
import {timeFromText, timeSpecToISO} from './time';

export interface TeachingWeekResolution {
  date: string;
  iso: string | null;
  displayText: string;
  sourceText: string;
  week: number;
  /** Monday = 1, Sunday = 7. */
  weekday: number;
  timeSpec: TimeSpec;
}
function dateParts(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100 ? date : null;
}
export function isWeekOneMonday(value: string): boolean {return dateParts(value)?.getUTCDay() === 1;}
function number(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = {一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9};
  if (value === '十') return 10;
  if (value.includes('十')) {
    const match = value.match(/^([一二三四五])?十([一二三四五六七八九])?$/);
    return match ? (match[1] ? digits[match[1]] : 1) * 10 + (match[2] ? digits[match[2]] : 0) : NaN;
  }
  return digits[value] ?? NaN;
}

/** A local calendar conversion, never a claim about the school's official term.
 * Ambiguous ranges, recurrence and an already explicit calendar date are refused. */
export function resolveTeachingWeek(text: string, weekOneMonday: string): TeachingWeekResolution | null {
  if (!isWeekOneMonday(weekOneMonday) || !text || text.length > 500) return null;
  const s = text.trim();
  if (/(?:每|隔|单双|单周|双周|连续|逐周|逢周)|(?:至|到|[-~～—–])\s*(?:第?\s*\d|[一二三四五六七八九十]|周|星期)|\d{1,4}\s*(?:年|月)|[零〇一二三四五六七八九十两\d]{1,3}\s*(?:月|日|号)|\d{4}[-/]\d|\d{1,2}[./-]\d{1,2}/.test(s)) return null;
  const weeks = [...s.matchAll(/第\s*(\d{1,2}|[一二三四五六七八九十两]{1,3})\s*(?:教学)?周/g)];
  if (weeks.length !== 1) return null;
  const match = s.match(/第\s*(\d{1,2}|[一二三四五六七八九十两]{1,3})\s*(?:教学)?周\s*(?:的)?\s*[（(]?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
  if (!match || [...s.matchAll(/(?:周|星期|礼拜)\s*([一二三四五六日天])/g)].length !== 1) return null;
  const week = number(match[1]), weekday = '一二三四五六日'.indexOf(match[2] === '天' ? '日' : match[2]) + 1;
  if (!Number.isInteger(week) || week < 1 || week > 53) return null;
  const clockMatches = [...s.matchAll(/\d{1,2}[:：]\d{2}|[零〇一二三四五六七八九十两\d]{1,3}(?:时|点)/g)];
  const clock = timeFromText(s);
  if (clockMatches.length > 1 || clockMatches.length && (clock.hour === null || clock.minute === null)) return null;
  if (clock.hour !== null && (/(?:上午|早上|凌晨|清晨)/.test(s) && clock.hour > 12 || /午夜/.test(s) && clock.hour === 12 || /(?:晚上|傍晚)/.test(s) && clock.hour === 0)) return null;
  const date = dateParts(weekOneMonday)!;
  date.setUTCDate(date.getUTCDate() + (week - 1) * 7 + weekday - 1);
  const day = date.toISOString().slice(0, 10);
  const timeSpec: TimeSpec = {type: clock.hour === null ? 'date' : 'date_time', year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: clock.hour, minute: clock.minute, rawText: s};
  const iso = timeSpecToISO(timeSpec);
  const displayText = `${date.getUTCMonth() + 1}月${date.getUTCDate()}日${clock.hour === null ? '' : ` ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`}`;
  return {date: iso?.slice(0, 10) ?? day, iso, displayText, sourceText: s, week, weekday, timeSpec};
}

function hasCalendarDate(iso: string | null, spec?: TimeSpec): boolean {
  return !!iso || !!spec && spec.year !== null && spec.month !== null && spec.day !== null;
}
function convertedText(result: TeachingWeekResolution): string {return `${result.sourceText}（按学期设置：${result.displayText}）`;}
function sourceHasExplicitDate(notice: Notice, result: TeachingWeekResolution): boolean {
  // An abbreviated model time must not discard a calendar date in the source.
  // Different dates elsewhere in the notice do not veto an unrelated week.
  return notice.originalText.split(/[。；;\n]/).some(clause => {
    const mentions = [...clause.matchAll(/第\s*(\d{1,2}|[一二三四五六七八九十两]{1,3})\s*(?:教学)?周/g)];
    return mentions.some(mention => number(mention[1]) === result.week)
      && /[零〇一二三四五六七八九十两\d]{1,3}\s*(?:月|日|号)|\d{1,4}[./-]\d{1,2}/.test(clause);
  });
}

/** Display-only projection. Never save this result back into the notice store. */
export function withTeachingCalendar(notice: Notice, weekOneMonday: string): Notice {
  if (!isWeekOneMonday(weekOneMonday)) return notice;
  let changed = false;
  const candidate = !notice.localDeadline && !hasCalendarDate(notice.deadline, notice.deadlineSpec) ? resolveTeachingWeek(notice.deadlineText, weekOneMonday) : null;
  const deadline = candidate && !sourceHasExplicitDate(notice, candidate) ? candidate : null;
  const tasks = notice.tasks.map(task => {
    if (task.localDeadline || notice.localDeadline || hasCalendarDate(task.time, task.timeSpec)) return task;
    const result = resolveTeachingWeek(task.timeText, weekOneMonday);
    if (!result || sourceHasExplicitDate(notice, result)) return task;
    changed = true; return {...task, time: result.iso, timeText: convertedText(result), timeSpec: result.timeSpec};
  });
  const timeline = notice.timeline.map(item => {
    if (hasCalendarDate(item.time, item.timeSpec)) return item;
    const result = resolveTeachingWeek(item.timeText, weekOneMonday);
    if (!result || sourceHasExplicitDate(notice, result)) return item;
    changed = true; return {...item, time: result.iso, timeText: convertedText(result), timeSpec: result.timeSpec};
  });
  if (!changed && !deadline) return notice;
  return {...notice, tasks, timeline, ...(deadline ? {deadline: deadline.iso, deadlineText: convertedText(deadline), deadlineSpec: deadline.timeSpec} : {})};
}
