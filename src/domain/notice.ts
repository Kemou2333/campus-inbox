import type { AnalysisBatch, AnalysisStep, AnalysisTask, Backup, BackupAttachment, Notice, NoticeAnalysis, NoticeStatus, NoteTarget, Priority, SortOrder, Step, Task, TimelineEntry } from './types';
import { parseTimeSpec, timeFromText, timeSpecToISO } from './time';

export const MAX_TEXT = 4000;
export const MAX_NOTE = 4000;
export const MAX_NOTICES = 2000;

function object(value: unknown, label = '记录'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式不正确`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 2000, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || !allowEmpty && !value.trim()) throw new Error(`${label}格式不正确`);
  return value.trim();
}
function array(value: unknown, label: string, max = 100): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label}格式不正确`);
  return value;
}
function strings(value: unknown, label: string, max = 100, itemMax = 2000): string[] {
  return array(value, label, max).map(v => text(v, label, itemMax));
}
function bool(value: unknown, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error('完成状态格式不正确');
  return value;
}
function fields(value: Record<string, unknown>, required: string[], optional: string[], strict: boolean): void {
  if (strict && (required.some(key => !(key in value)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key)))) throw new Error('整理结果字段不完整或包含多余字段');
}

/** ISO input must be complete and real; Date.parse alone silently accepts February 30. */
export function parseDate(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('时间格式不正确');
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/);
  if (!m) throw new Error('请使用完整日期与时间');
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(v => Number(v || 0));
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) throw new Error('日期或时间不存在');
  if (m[8] && m[8] !== 'Z') {
    const [h, min] = m[8].slice(1).split(':').map(Number);
    if (h > 14 || min > 59 || h === 14 && min !== 0) throw new Error('时区格式不正确');
  }
  if (!Number.isFinite(Date.parse(value))) throw new Error('日期无法识别');
  return value;
}
function timeSpec(value: Record<string, unknown>, key: 'timeSpec' | 'deadlineSpec', raw: string) {
  return key in value ? { [key]: parseTimeSpec(value[key], raw) } : {};
}

function parseStep(value: unknown, strict: boolean): AnalysisStep {
  const o = object(value, '步骤');
  fields(o, ['text', 'details'], [], strict);
  return { text: text(o.text, '步骤名称', 60), details: strings(strict ? o.details : o.details ?? [], '步骤细节', 5, 500) };
}
function parseTask(value: unknown, strict: boolean): AnalysisTask {
  const o = typeof value === 'string' && !strict ? { text: value } : object(value, '事项');
  fields(o, ['text', 'assignee', 'details', 'time', 'timeText', 'location'], ['scope', 'condition', 'steps', 'timeSpec'], strict);
  const scope = o.scope ?? 'unspecified';
  if (!['all', 'conditional', 'role', 'unspecified'].includes(String(scope))) throw new Error('任务适用范围不正确');
  if (strict && ('scope' in o) !== ('condition' in o)) throw new Error('适用范围与条件须同时提供');
  const condition = text(o.condition ?? '', '适用条件', 120, true);
  const assignee = o.assignee == null ? null : text(o.assignee, '责任对象', 80);
  if (scope === 'conditional' && !condition) throw new Error('条件任务须写明适用条件');
  if (scope === 'role' && !assignee) throw new Error('角色任务须写明责任对象');
  const timeText = text(o.timeText ?? '', '原文时间', 500, true);
  return {
    text: text(o.text, '事项名称', strict ? 60 : 2000), assignee, scope: scope as AnalysisTask['scope'], condition,
    details: strings(strict ? o.details : o.details ?? [], '执行细节', strict ? 20 : 100, strict ? 500 : 2000),
    steps: array(o.steps ?? [], '步骤', 10).map(v => parseStep(v, strict)),
    time: parseDate(o.time), timeText, location: o.location == null ? null : text(o.location, '地点', 500), ...timeSpec(o, 'timeSpec', timeText),
  };
}
function parseTimeline(value: unknown, strict: boolean): TimelineEntry[] {
  return array(strict ? value : value ?? [], '时间节点').map(value => {
    const o = object(value, '时间节点');
    fields(o, ['label', 'time', 'timeText', 'location'], ['timeSpec'], strict);
    const timeText = text(o.timeText, '原文时间', 500, true);
    return { label: text(o.label, '节点名称', 200), time: parseDate(o.time), timeText, location: o.location == null ? null : text(o.location, '地点', 500), ...timeSpec(o, 'timeSpec', timeText) };
  });
}

/** Boundary for AI and old records. User progress is deliberately excluded. */
export function parseAnalysis(value: unknown, strict = true): NoticeAnalysis {
  const o = object(value, '整理结果');
  fields(o, ['schemaVersion', 'kind', 'title', 'summary', 'deadline', 'deadlineText', 'timeline', 'tasks', 'materials', 'warnings', 'reminders'], ['deadlineSpec'], strict);
  if (strict && o.schemaVersion !== 4) throw new Error('AI 整理格式版本不正确');
  const tasks = array(o.tasks, '事项').map(t => parseTask(t, strict));
  const kind = o.kind ?? (tasks.length ? 'task' : 'information');
  if (!['task', 'reminder', 'information'].includes(String(kind))) throw new Error('通知类别不正确');
  const reminders = strings(strict ? o.reminders : o.reminders ?? [], '提醒', strict ? 20 : 100, strict ? 500 : 2000);
  if (strict && ((kind === 'task') !== !!tasks.length || kind === 'reminder' && !reminders.length)) throw new Error('通知类别与内容不一致');
  const deadlineText = text(o.deadlineText ?? '', '截止描述', 500, true);
  return {
    schemaVersion: 4, kind: kind as NoticeAnalysis['kind'], title: text(o.title, '标题', strict ? 40 : 200),
    summary: text(o.summary, '摘要', strict ? 140 : 2000), deadline: parseDate(o.deadline), deadlineText,
    timeline: parseTimeline(o.timeline, strict), tasks, materials: strings(strict ? o.materials : o.materials ?? [], '材料'), warnings: strings(strict ? o.warnings : o.warnings ?? [], '注意事项'), reminders,
    ...timeSpec(o, 'deadlineSpec', deadlineText),
  };
}
export function parseAnalysisBatch(value: unknown): AnalysisBatch {
  const o = object(value, '整理结果');
  fields(o, ['schemaVersion', 'notices'], ['sourceIndexes'], true);
  if (o.schemaVersion !== 4) throw new Error('AI 整理格式版本不正确');
  const notices = array(o.notices, '整理结果', 20).map(n => parseAnalysis(n));
  if (!notices.length) throw new Error('AI 没有返回通知');
  if(o.sourceIndexes!==undefined){
    const indexes=array(o.sourceIndexes,'原文对应关系',20);
    if(indexes.length!==notices.length||indexes.some(v=>!Number.isSafeInteger(v)||Number(v)<0||Number(v)>=20))throw new Error('原文对应关系格式不正确');
    return { schemaVersion: 4, notices, sourceIndexes:indexes as number[] };
  }
  return { schemaVersion: 4, notices };
}

function id(value: unknown): string { return text(value, '编号', 150); }
export function newID(): string { return crypto.randomUUID(); }
/** Deterministic migration identity, not a password/security hash. */
function legacyID(noticeID: string, group: string, index: number, content: unknown): string {
  const source = JSON.stringify([noticeID, group, index, content]);
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `legacy-${group}-${index}-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}
function uniqueIDs(values: { id: string }[], label: string): void {
  if (new Set(values.map(v => v.id)).size !== values.length) throw new Error(`${label}编号重复`);
}

/** Upgrades v1-v4 records while retaining source text, decisions, notes and attachment references. */
export function parseNotice(value: unknown): Notice {
  const o = object(value, '通知');
  if (o.schemaVersion !== undefined && (typeof o.schemaVersion !== 'number' || ![1, 2, 3, 4, 5].includes(o.schemaVersion))) throw new Error('通知记录版本不正确');
  const rawReminders = array(o.reminders ?? [], '提醒');
  const noticeID = id(o.id), a = parseAnalysis({ ...o, reminders: rawReminders.map(r => typeof r === 'string' ? r : object(r, '提醒').text) }, false);
  const createdAt = parseDate(o.createdAt);
  if (!createdAt) throw new Error('通知缺少创建时间');
  const rawTasks = array(o.tasks, '事项');
  const tasks: Task[] = a.tasks.map((t, index) => {
    const raw = object(rawTasks[index], '事项记录');
    const taskID = raw.id === undefined ? legacyID(noticeID, 'task', index, t) : id(raw.id);
    const rawSteps = array(raw.steps ?? [], '步骤', 10);
    const steps: Step[] = t.steps.map((s, si) => {
      const v = object(rawSteps[si], '步骤记录');
      return { ...s, id: v.id === undefined ? legacyID(taskID, 'step', si, s) : id(v.id), completed: bool(v.completed), note: text(v.note ?? '', '步骤笔记', MAX_NOTE, true) };
    });
    uniqueIDs(steps, '步骤');
    return { ...t, id: taskID, completed: bool(raw.completed), dismissed: bool(raw.dismissed), note: text(raw.note ?? '', '事项笔记', MAX_NOTE, true), localDeadline: parseDate(raw.localDeadline), steps };
  });
  uniqueIDs(tasks, '事项');
  const attachments = strings(o.attachments ?? [], '附件编号', 10, 100);
  if (new Set(attachments).size !== attachments.length) throw new Error('附件编号重复');
  const notes = array(o.reminderNotes ?? [], '提醒笔记', a.reminders.length);
  const reminders = a.reminders.map((content, i) => {
    const raw = rawReminders[i];
    const item = typeof raw === 'string' ? null : object(raw, '提醒');
    return {
      id: item?.id === undefined ? legacyID(noticeID, 'reminder', i, content) : id(item.id), text: content,
      note: text(item?.note ?? notes[i] ?? '', '提醒笔记', MAX_NOTE, true),
    };
  });
  uniqueIDs(reminders, '提醒');
  const audienceOverride = o.audienceOverride ?? '';
  if (audienceOverride !== '' && audienceOverride !== 'all') throw new Error('适用范围设置不正确');
  return {
    ...a, schemaVersion: 5, id: noticeID, tasks, originalText: text(o.originalText, '通知原文', 12000), createdAt,
    updatedAt: parseDate(o.updatedAt) ?? createdAt, completed: bool(o.completed), dismissed: bool(o.dismissed),
    note: text(o.note ?? '', '通知笔记', MAX_NOTE, true), localDeadline: parseDate(o.localDeadline), audienceOverride,
    reminders, attachments,
  };
}
export function parseNotices(value: unknown): Notice[] {
  const result = array(value, '通知列表', MAX_NOTICES).map(parseNotice);
  uniqueIDs(result, '通知');
  return result;
}
export function createNotice(value: unknown, originalText: string, now = new Date().toISOString()): Notice {
  const a = parseAnalysis(value);
  return {
    ...a, schemaVersion: 5, id: newID(), originalText: text(originalText, '通知原文', MAX_TEXT), createdAt: now, updatedAt: now,
    completed: false, dismissed: false, note: '', localDeadline: null, audienceOverride: '', reminders: a.reminders.map(text => ({ id: newID(), text, note: '' })), attachments: [],
    tasks: a.tasks.map(t => ({ ...t, id: newID(), completed: false, dismissed: false, note: '', localDeadline: null, steps: t.steps.map(s => ({ ...s, id: newID(), completed: false, note: '' })) })),
  };
}

export function parseBackup(value: unknown): Notice[] {
  const o = object(value, '备份');
  if (o.app !== 'campus-inbox' || ![1, 2, 3, 4, 5].includes(Number(o.version)) || typeof o.version !== 'number') throw new Error('请选择校园 Inbox 导出的 JSON 备份');
  return parseNotices(o.notices);
}
export function exportBackup(notices: Notice[], attachments?: BackupAttachment[]): Backup {
  return { app: 'campus-inbox', version: 5, exportedAt: new Date().toISOString(), notices: structuredClone(notices), ...(attachments ? { attachments } : {}) };
}
/** Text-only backups remain restorable on devices that do not hold the original files. */
export function exportTextBackup(notices: Notice[]): Backup {
  return exportBackup(notices.map(notice => ({ ...notice, attachments: [] })));
}

export function pendingTasks(n: Notice): Task[] { return n.tasks.filter(t => !t.completed && !t.dismissed); }
export function getNoticeStatus(n: Notice): NoticeStatus {
  if (n.dismissed) return 'dismissed';
  if (n.completed) return 'completed';
  return n.kind === 'task' ? 'pending' : 'reminder';
}
function reconcile(n: Notice): Notice {
  if (n.kind !== 'task' || !n.tasks.length) return n;
  const applicable = n.tasks.filter(t => !t.dismissed);
  return { ...n, completed: applicable.length > 0 && applicable.every(t => t.completed), dismissed: applicable.length === 0 };
}
function changed(n: Notice): Notice { return { ...n, updatedAt: new Date().toISOString() }; }
function changeTask(n: Notice, taskID: string, change: (task: Task) => Task): Notice {
  if (!n.tasks.some(t => t.id === taskID)) return n;
  return changed(reconcile({ ...n, tasks: n.tasks.map(t => t.id === taskID ? change(t) : t) }));
}
export function toggleTask(n: Notice, taskID: string): Notice {
  return changeTask(n, taskID, t => {
    const completed = !t.completed;
    return { ...t, completed, dismissed: false, steps: t.steps.map(s => ({ ...s, completed })) };
  });
}
export function toggleStep(n: Notice, taskID: string, stepID: string): Notice {
  return changeTask(n, taskID, t => {
    if (!t.steps.some(s => s.id === stepID)) return t;
    const steps = t.steps.map(s => s.id === stepID ? { ...s, completed: !s.completed } : s);
    return { ...t, dismissed: false, steps, completed: steps.every(s => s.completed) };
  });
}
export function setTaskApplicable(n: Notice, taskID: string, applicable: boolean): Notice {
  return changeTask(n, taskID, t => ({ ...t, dismissed: !applicable }));
}
export function setNoticeCompleted(n: Notice, completed: boolean): Notice {
  return changed({
    ...n, completed, dismissed: false,
    tasks: n.tasks.map(t => t.dismissed && !n.dismissed ? t : { ...t, dismissed: false, completed, steps: t.steps.map(s => ({ ...s, completed })) }),
  });
}
export function updateNote(n: Notice, target: NoteTarget, note: string): Notice {
  const value = text(note, '笔记', MAX_NOTE, true);
  if (target.type === 'notice') return changed({ ...n, note: value });
  if (target.type === 'reminder') return changed({ ...n, reminders: n.reminders.map(r => r.id === target.reminderId ? { ...r, note: value } : r) });
  // Notes never recalculate completion or restore excluded tasks.
  return changed({ ...n, tasks: n.tasks.map(t => t.id !== target.taskId ? t : target.type === 'task' ? { ...t, note: value } : { ...t, steps: t.steps.map(s => s.id === target.stepId ? { ...s, note: value } : s) }) });
}
export function taskDeadline(n: Notice, t: Task): string | null {
  if (t.localDeadline || n.localDeadline) return t.localDeadline || n.localDeadline;
  const dueWording=/(?:截止|之前|(?:\d|日|号|时|分)前|内$)/.test(t.timeText);
  if (t.time && dueWording) return t.time;
  if (t.time) return null;
  if (t.timeText && t.timeText.replace(/[\s：:]/g, '') !== n.deadlineText.replace(/[\s：:]/g, '')) {
    // Different phrasing may still name the same complete deadline. Re-read
    // only the task wording, without borrowing a year or treating event starts
    // as deadlines, even when the model left its timeSpec unknown.
    return n.deadline && dueWording && timeSpecToISO(timeFromText(t.timeText)) === n.deadline ? n.deadline : null;
  }
  return n.deadline;
}
export function effectiveDeadline(n: Notice): string | null {
  if (getNoticeStatus(n) !== 'pending') return null;
  const dates = pendingTasks(n).map(t => taskDeadline(n, t)).filter((s): s is string => s !== null);
  return dates.length ? dates.reduce((a, b) => Date.parse(a) < Date.parse(b) ? a : b) : null;
}
export function priority(n: Notice, now = Date.now()): Priority {
  const due = effectiveDeadline(n);
  if (!due) return { level: 'unknown', rank: 4, due: null, label: '' };
  const timestamp = Date.parse(due), diff = timestamp - now, day = new Date(now), end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  if (diff < 0) return { level: 'overdue', rank: 0, due, label: '已截止' };
  if (timestamp < end) return { level: 'today', rank: 1, due, label: '今天要办' };
  if (diff <= 259200000) return { level: 'upcoming', rank: 2, due, label: '即将到期' };
  return { level: 'scheduled', rank: 3, due, label: '' };
}
export function sortNotices(notices: Notice[], order: SortOrder, now = Date.now()): Notice[] {
  return [...notices].sort((a, b) => {
    const recency = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (order === 'newest') return recency;
    if (order === 'priority') {
      const rank = priority(a, now).rank - priority(b, now).rank;
      if (rank) return rank;
    }
    const ad = effectiveDeadline(a), bd = effectiveDeadline(b);
    return (ad ? Date.parse(ad) : Infinity) - (bd ? Date.parse(bd) : Infinity) || recency;
  });
}
export function taskAudience(t: Task): string {
  if (t.scope === 'all') return '全体同学';
  if (t.scope === 'conditional') return t.condition;
  return t.assignee || t.condition || '适用对象待确认';
}
