import {describe, expect, test} from 'vitest';
import {createNotice} from '../src/domain/notice';
import {isWeekOneMonday, resolveTeachingWeek, withTeachingCalendar} from '../src/domain/teaching-calendar';

const monday = '2026-09-07';
function notice() {
  return createNotice({schemaVersion: 4, kind: 'task', title: '课程作业', summary: '按时交作业。', deadline: null, deadlineText: '第16周周日24:00截止', timeline: [{label: '答疑', time: null, timeText: '第十五周星期三下午3点', location: null}], materials: [], warnings: [], reminders: [], tasks: [{text: '交作业', assignee: '全体同学', scope: 'all', condition: '', details: [], steps: [], time: null, timeText: '第16周周日24:00前', location: null}]}, '第16周周日24:00前交作业，第十五周星期三下午3点答疑。');
}
describe('explicit local teaching-week conversion', () => {
  test('requires a user-confirmed real Monday and does not guess a term anchor', () => {
    expect(isWeekOneMonday(monday)).toBe(true);
    for (const anchor of ['', '2026-09-08', '2026-02-30', '2026-9-7', '1900-01-01']) expect(resolveTeachingWeek('第5周周一', anchor)).toBeNull();
  });
  test('supports Chinese week numbers, date-only results and year rollover without guessing a clock', () => {
    expect(resolveTeachingWeek('第十六周星期日', monday)).toMatchObject({date: '2026-12-27', iso: null, week: 16, weekday: 7, timeSpec: {type: 'date', hour: null}});
    expect(resolveTeachingWeek('第十八周周一', monday)).toMatchObject({date: '2027-01-04', iso: null});
    expect(resolveTeachingWeek('第1周（周一）上午9:30', monday)?.iso).toBe('2026-09-07T09:30:00');
    expect(resolveTeachingWeek('第十五周星期三下午3点', monday)?.iso).toBe('2026-12-16T15:00:00');
  });
  test('24:00 advances to next day while retaining the original Sunday wording', () => {
    expect(resolveTeachingWeek('第16周周日24:00截止', monday)).toMatchObject({date: '2026-12-28', iso: '2026-12-28T00:00:00', sourceText: '第16周周日24:00截止', displayText: '12月27日 24:00'});
  });
  test('refuses ranges, repeated events, multiple times, explicit or conflicting dates and incomplete weekdays', () => {
    for (const text of ['第16周', '第16周周末', '第5至16周周日', '第5周至第16周周日', '每学期第16周周日', '第16周周六和周日', '第16周周日18:00-20:00', '第16周周日18:00、20:00', '第16周周日2026年12月27日', '第16周周日12月28日', '第16周周日十二月二十七日', '第16周周日25:00', '第16周周日上午18点', '第16周周日午夜12点', '第16周周日晚上12点', '第0周周一', '第54周周一', '第十十周周日']) expect(resolveTeachingWeek(text, monday), text).toBeNull();
  });
});
describe('display-only projection', () => {
  test('derives task, deadline and timeline while keeping the stored record intact', () => {
    const n = notice(), original = structuredClone(n), view = withTeachingCalendar(n, monday);
    expect(view.deadline).toBe('2026-12-28T00:00:00');
    expect(view.tasks[0].time).toBe('2026-12-28T00:00:00');
    expect(view.timeline[0].time).toBe('2026-12-16T15:00:00');
    expect(view.deadlineText).toContain('第16周周日24:00截止');
    expect(view.deadlineText).toContain('按学期设置');
    expect(n).toEqual(original);
    expect(withTeachingCalendar(view, monday)).toBe(view);
  });
  test('preserves manual deadlines, absolute original times and the immutable original text', () => {
    const n = notice(); n.localDeadline = '2026-12-20T18:00:00';
    let view = withTeachingCalendar(n, monday);
    expect(view.deadline).toBeNull(); expect(view.tasks[0].time).toBeNull();
    n.localDeadline = null; n.deadline = '2026-12-30T18:00:00'; n.tasks[0].localDeadline = '2026-12-29T19:00:00';
    view = withTeachingCalendar(n, monday);
    expect(view.deadline).toBe(n.deadline); expect(view.tasks[0].time).toBeNull();
    expect(view.originalText).toBe(n.originalText);
  });
  test('refuses a model abbreviation when the source names an explicit conflicting date for that week', () => {
    for (const originalText of ['第16周周日（12月28日）24:00前交作业。', '第16周周日（12.28）24:00前交作业。']) {
      const n = notice(); n.originalText = originalText;
      const view = withTeachingCalendar(n, monday);
      expect(view.deadline).toBeNull(); expect(view.tasks[0].time).toBeNull();
      expect(view.timeline[0].time).toBe('2026-12-16T15:00:00');
    }
  });
});
