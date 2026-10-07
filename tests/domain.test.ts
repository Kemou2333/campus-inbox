import { describe, expect, test } from 'vitest';
import { createNotice, effectiveDeadline, exportBackup, exportTextBackup, getNoticeStatus, parseAnalysis, parseAnalysisBatch, parseBackup, parseDate, parseNotice, pendingTasks, priority, setNoticeCompleted, setTaskApplicable, sortNotices, toggleStep, toggleTask, updateNote } from '../src/domain/notice';
import { parseTimeSpec, timeFromText, timeSpecToDate, timeSpecToISO } from '../src/domain/time';
import type { NoticeAnalysis } from '../src/domain/types';
import { LocalRepository } from '../src/infrastructure/local-repository';
import { LEGACY_NOTICE_KEY, NOTICE_KEY } from '../src/infrastructure/legacy-migration';

const analysis: NoticeAnalysis = {
  schemaVersion: 4, kind: 'task', title: '办理普通请假', summary: '需办理请假的同学按流程提交。', deadline: null, deadlineText: '10月7日17:00前',
  timeline: [], materials: ['家长短信截图'], warnings: ['去向地点写详细'], reminders: [],
  tasks: [{ text: '办理普通请假', assignee: '请假学生', scope: 'conditional', condition: '需办理10月8日请假的同学', details: [],
    steps: [{ text: '提交家长短信截图', details: ['发给通知发布者'] }, { text: '填写办事簿', details: ['写明事由和去向'] }, { text: '提交智慧学工请假', details: [] }], time: null, timeText: '10月7日17:00前', location: null }],
};
const record = () => createNotice(analysis, '请需要办理8号普通请假的同学务必在10月7号17:00前完善好请假流程。', '2026-10-01T13:00:00Z');
class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe('AI and stored-data boundaries', () => {
  test('one result becomes a local record without changing AI text or inventing time', () => {
    const n = record();
    expect(n.schemaVersion).toBe(5);
    expect(n.tasks[0].condition).toBe(analysis.tasks[0].condition);
    expect(n.tasks[0].steps.map(({ text, details }) => ({ text, details }))).toEqual(analysis.tasks[0].steps);
    expect(n.deadline).toBeNull();
    expect(n.tasks[0].id).toBeTruthy();
    expect(n.tasks[0].steps.every(s => !!s.id && !s.completed && !s.note)).toBe(true);
  });
  test('external AI cannot provide private notes, local state or executable fields', () => {
    for (const key of ['note', 'completed', 'audienceOverride', 'execute']) expect(() => parseAnalysis({ ...analysis, [key]: 'unexpected' })).toThrow();
    for (const key of ['id', 'note', 'completed', 'dismissed', 'execute']) expect(() => parseAnalysis({ ...analysis, tasks: [{ ...analysis.tasks[0], [key]: true }] })).toThrow();
    expect(() => parseAnalysis({ ...analysis, kind: 'reminder' })).toThrow();
    expect(() => parseAnalysisBatch({ schemaVersion: 4, notices: [], execute: 'anything' })).toThrow();
  });
  test('new source 4000 limit allows old stored 12000-character records', () => {
    expect(createNotice(analysis, '字'.repeat(4000)).originalText).toHaveLength(4000);
    expect(() => createNotice(analysis, '字'.repeat(4001))).toThrow();
    expect(parseNotice({ ...record(), originalText: '字'.repeat(12000) }).originalText).toHaveLength(12000);
    expect(() => parseNotice({ ...record(), originalText: '字'.repeat(12001) })).toThrow();
  });
  test('date validation rejects silent rollovers and invalid offsets', () => {
    for (const value of ['2026-02-29T10:00:00', '2026-04-31T10:00:00', '2026-10-07T24:00:00', '2026-10-07T10:60:00', '2026-10-07T10:00:00+14:01']) expect(() => parseDate(value)).toThrow();
    expect(parseDate('2028-02-29T10:00:00+08:00')).toBe('2028-02-29T10:00:00+08:00');
  });
  test('duplicate entity IDs and corrupt state are rejected before import', () => {
    const n = record();
    expect(() => parseBackup({ app: 'campus-inbox', version: 5, notices: [n, n] })).toThrow();
    expect(() => parseNotice({ ...n, tasks: [n.tasks[0], n.tasks[0]] })).toThrow();
    expect(() => parseNotice({ ...n, tasks: [{ ...n.tasks[0], completed: 'yes' }] })).toThrow();
    expect(() => parseNotice({ ...n, attachments: ['same', 'same'] })).toThrow();
  });
});

describe('migration and stable child identity', () => {
  test.each([1, 2, 3, 4])('legacy backup v%i keeps notes, progress, applicability and file references', version => {
    const legacy = { ...record(), schemaVersion: 4, attachments: ['old-file'], note: '原笔记',
      tasks: [{ ...analysis.tasks[0], completed: false, dismissed: true, note: '不适用于本人', localDeadline: null,
        steps: [{ ...analysis.tasks[0].steps[0], id: 'old-stable-step', completed: true, note: '已发送' }, ...analysis.tasks[0].steps.slice(1)] }] };
    const before = structuredClone(legacy);
    const [n] = parseBackup({ app: 'campus-inbox', version, notices: [legacy] });
    expect(n.tasks[0].dismissed).toBe(true);
    expect(n.tasks[0].completed).toBe(false);
    expect(n.tasks[0].steps[0]).toMatchObject({ id: 'old-stable-step', completed: true, note: '已发送' });
    expect(n.attachments).toEqual(['old-file']);
    expect(n.note).toBe('原笔记');
    expect(parseBackup({ app: 'campus-inbox', version, notices: [legacy] })[0].tasks[0].id).toBe(n.tasks[0].id);
    expect(legacy).toEqual(before);
  });
  test('minimal legacy fields receive defaults without losing completed tasks', () => {
    const n = record();
    const legacy = { id: n.id, title: n.title, summary: n.summary, deadline: null, deadlineText: '明天', originalText: '原文', createdAt: n.createdAt, completed: true, tasks: [{ text: '旧任务', completed: true }] };
    const [upgraded] = parseBackup({ app: 'campus-inbox', version: 1, notices: [legacy] });
    expect(upgraded.completed).toBe(true); expect(upgraded.tasks[0].completed).toBe(true);
    expect(upgraded.tasks[0].scope).toBe('unspecified'); expect(upgraded.tasks[0].steps).toEqual([]);
    expect(upgraded.deadline).toBeNull(); expect(upgraded.updatedAt).toBe(upgraded.createdAt);
  });
  test('reminder notes gain stable IDs and stay with their text when reordered', () => {
    const n = createNotice({ ...analysis, kind: 'reminder', tasks: [], reminders: ['拔电源', '按时返校'] }, '离校注意事项');
    const legacy = { ...n, schemaVersion: 4, reminders: ['拔电源', '按时返校'], reminderNotes: ['已经检查', '买票了'] };
    const upgraded = parseNotice(legacy);
    expect(upgraded.reminders.map(r => r.note)).toEqual(['已经检查', '买票了']);
    const reordered = { ...upgraded, reminders: [...upgraded.reminders].reverse() };
    expect(parseBackup(exportBackup([reordered]))[0].reminders).toEqual(reordered.reminders);
    const target = reordered.reminders[0];
    expect(updateNote(reordered, { type: 'reminder', reminderId: target.id }, '改签').reminders[0]).toMatchObject({ text: '按时返校', note: '改签' });
    expect(updateNote(reordered, { type: 'reminder', reminderId: target.id }, '改签').reminders[1].note).toBe('已经检查');
  });
  test('v5 backup roundtrip preserves all entity IDs, source and per-step notes', () => {
    let n = record(); n = updateNote(n, { type: 'step', taskId: n.tasks[0].id, stepId: n.tasks[0].steps[0].id }, '已联系家长');
    expect(parseBackup(exportBackup([n]))).toEqual([n]);
    expect(() => parseBackup({ app: 'different-app', version: 5, notices: [] })).toThrow();
  });
  test('text-only backup restores progress without missing local files and leaves the live notice intact', () => {
    let n=record();n.attachments=['only-on-other-device'];
    n=toggleStep(n,n.tasks[0].id,n.tasks[0].steps[0].id);
    n=updateNote(n,{type:'step',taskId:n.tasks[0].id,stepId:n.tasks[0].steps[0].id},'已发给通知发布者');
    const before=structuredClone(n),backup=exportTextBackup([n]);
    expect(parseBackup(backup)).toEqual([{...n,attachments:[]}]);
    expect(n).toEqual(before);expect(backup.attachments).toBeUndefined();
  });
});

describe('simple completion and applicability semantics', () => {
  test('last checked AI step completes task and notice; unchecking restores them', () => {
    const original = record(); let n = original;
    for (const step of n.tasks[0].steps) n = toggleStep(n, n.tasks[0].id, step.id);
    expect(getNoticeStatus(n)).toBe('completed'); expect(pendingTasks(n)).toEqual([]);
    n = toggleStep(n, n.tasks[0].id, n.tasks[0].steps[1].id);
    expect(getNoticeStatus(n)).toBe('pending'); expect(n.tasks[0].completed).toBe(false);
    expect(original.tasks[0].steps.every(s => !s.completed)).toBe(true);
  });
  test('whole task checkbox updates its steps consistently', () => {
    const n = record(), done = toggleTask(n, n.tasks[0].id), restored = toggleTask(done, done.tasks[0].id);
    expect(done.tasks[0].steps.every(s => s.completed)).toBe(true);
    expect(restored.tasks[0].steps.every(s => !s.completed)).toBe(true);
  });
  test('not applicable is excluded, never fabricated as a completed task', () => {
    const n = record(), skipped = setTaskApplicable(n, n.tasks[0].id, false);
    expect(getNoticeStatus(skipped)).toBe('dismissed'); expect(skipped.completed).toBe(false);
    expect(skipped.tasks[0].completed).toBe(false); expect(effectiveDeadline(skipped)).toBeNull();
    expect(getNoticeStatus(setTaskApplicable(skipped, skipped.tasks[0].id, true))).toBe('pending');
  });
  test('all applicable tasks complete without forcing excluded branch complete', () => {
    const n = record(); n.tasks.push({ ...n.tasks[0], id: 'conditional-branch', dismissed: true, steps: [] });
    const done = toggleTask(n, n.tasks[0].id);
    expect(getNoticeStatus(done)).toBe('completed'); expect(done.tasks[1].completed).toBe(false); expect(done.tasks[1].dismissed).toBe(true);
    const reopened = setNoticeCompleted(done, false);
    expect(reopened.tasks[1].dismissed).toBe(true); expect(getNoticeStatus(reopened)).toBe('pending');
  });
  test('restoring an entirely excluded record makes tasks applicable again', () => {
    const n = record(), excluded = setTaskApplicable(n, n.tasks[0].id, false), restored = setNoticeCompleted(excluded, false);
    expect(getNoticeStatus(restored)).toBe('pending'); expect(restored.tasks[0].dismissed).toBe(false);
  });
  test('notes on completed or excluded items do not change their state', () => {
    const n = record(), excluded = setTaskApplicable(n, n.tasks[0].id, false);
    const annotated = updateNote(excluded, { type: 'task', taskId: n.tasks[0].id }, '不是我需要办理');
    expect(getNoticeStatus(annotated)).toBe('dismissed'); expect(annotated.tasks[0].note).toBe('不是我需要办理');
  });
});

describe('time and useful local ordering', () => {
  test('complete dates are readable; missing years and relative times stay unresolved', () => {
    expect(timeSpecToISO(timeFromText('2026年10月7日17:00前'))).toBe('2026-10-07T17:00:00');
    expect(timeSpecToISO(timeFromText('10月7日17:00前'))).toBeNull();
    expect(timeFromText('10月7日17:00前')).toMatchObject({ type: 'partial', year: null, month: 10, day: 7, hour: 17, minute: 0 });
    expect(timeFromText('明天中午前')).toMatchObject({ type: 'relative', year: null, month: null, day: null });
    expect(timeSpecToDate(timeFromText('2026年10月15日'))).toBe('2026-10-15');
    expect(timeSpecToISO(timeFromText('2026年10月20日24:00'))).toBe('2026-10-21T00:00:00');
  });
  test('class year and ranges cannot manufacture precise deadlines', () => {
    expect(timeFromText('2026级新生10月15日前').year).toBeNull();
    expect(timeFromText('2026—2027学年第一学期').year).toBeNull();
    expect(timeFromText('2026年10月7日到2026年10月9日').type).toBe('unknown');
    expect(timeFromText('每周五17:00').type).toBe('unknown');
    const actual = timeFromText('10月7日17:00前');
    expect(() => parseTimeSpec({ ...actual, type: 'date_time', year: 2026 }, actual.rawText)).toThrow();
  });
  test('priority is local-clock based and ignores event starts and resolved tasks', () => {
    const now = new Date(2026, 9, 6, 12).getTime(), n = record();
    expect(priority(n, now).level).toBe('unknown');
    const today = { ...n, id: 'today', localDeadline: new Date(2026, 9, 6, 16).toISOString() };
    const overdue = { ...n, id: 'overdue', localDeadline: new Date(2026, 9, 6, 11).toISOString() };
    expect(priority(today, now).level).toBe('today'); expect(priority(overdue, now).level).toBe('overdue');
    expect(priority(setNoticeCompleted(today, true), now).level).toBe('unknown');
    const event = { ...n, tasks: [{ ...n.tasks[0], time: '2026-10-07T17:00:00', timeText: '2026年10月7日17:00活动开始' }] };
    expect(effectiveDeadline(event)).toBeNull();
    const list = [today, n, overdue];
    expect(sortNotices(list, 'priority', now).map(s => s.id)).toEqual([overdue.id, today.id, n.id]);
    expect(list).toEqual([today, n, overdue]);
  });
});

describe('local persistence and future repository boundary', () => {
  test('first load migrates legacy once and leaves old bytes and attachment IDs intact', () => {
    const storage = new MemoryStorage(), n = record(), old = JSON.stringify([{ ...n, schemaVersion: 4, attachments: ['old-file'] }]);
    storage.setItem(LEGACY_NOTICE_KEY, old);
    const repository = new LocalRepository(storage), records = repository.load();
    expect(repository.migratedFromLegacy).toBe(true); expect(storage.getItem(LEGACY_NOTICE_KEY)).toBe(old);
    expect(records[0].attachments).toEqual(['old-file']); expect(storage.getItem(NOTICE_KEY)).toBeTruthy();
    expect(new LocalRepository(storage).load()).toEqual(records);
  });
  test('invalid legacy data is not overwritten by an empty migration', () => {
    const storage = new MemoryStorage(); storage.setItem(LEGACY_NOTICE_KEY, '{bad json');
    expect(() => new LocalRepository(storage).load()).toThrow();
    expect(storage.getItem(NOTICE_KEY)).toBeNull(); expect(storage.getItem(LEGACY_NOTICE_KEY)).toBe('{bad json');
  });
  test('concurrent stale tab cannot overwrite newer data', () => {
    const storage = new MemoryStorage(), first = new LocalRepository(storage), second = new LocalRepository(storage);
    first.load(); second.load(); first.save([record()]);
    expect(() => second.save([])).toThrow('另一标签页');
    expect(second.load()).toHaveLength(1); second.save([]); expect(first.load()).toEqual([]);
  });
  test('storage write failure preserves last persisted record', () => {
    const storage = new MemoryStorage(), repository = new LocalRepository(storage); repository.load(); repository.save([record()]);
    const before = storage.getItem(NOTICE_KEY); storage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => repository.save([])).toThrow(); expect(storage.getItem(NOTICE_KEY)).toBe(before); expect(repository.load()).toHaveLength(1);
  });
  test('same-tab subscriptions return independent snapshots and can be removed', () => {
    const repository = new LocalRepository(new MemoryStorage()), received: string[] = [];
    const stop = repository.subscribe(records => { received.push(records[0]?.title ?? 'empty'); if (records[0]) records[0].title = 'listener mutation'; });
    const n = record(); repository.save([n]); expect(n.title).toBe(analysis.title); expect(repository.load()[0].title).toBe(analysis.title);
    stop(); repository.save([]); expect(received).toEqual([analysis.title]);
  });
});
