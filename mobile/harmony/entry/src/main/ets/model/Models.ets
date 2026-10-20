// Native projection only. It is never written back over a server/web record.
export interface ServerStep { id: string; text: string; details: string[]; completed: boolean }
export interface ServerTask {
  id: string; text: string; details: string[]; steps: ServerStep[];
  completed: boolean; dismissed: boolean; condition: string;
  time: string | null; timeText: string; location: string | null;
}
export interface ServerReminder { id: string; text: string; note: string }
export interface ServerNotice {
  schemaVersion: number; id: string; kind: string; title: string; summary: string;
  originalText: string; deadline: string | null; deadlineText: string;
  tasks: ServerTask[]; warnings: string[]; materials: string[]; reminders: ServerReminder[];
  createdAt: string; updatedAt: string; completed: boolean; dismissed: boolean;
}
export interface NoticeRow { record: ServerNotice; expanded: boolean; openTasks: string[]; sourceOpen: boolean }
export interface PendingSubmission { requestId: string; text: string; jobId: string; createdAt: string }
export interface SavedState { version: number; rows: NoticeRow[]; deletedRows: NoticeRow[]; pending: PendingSubmission | null; draft: string; demoIndex: number; selectedDemo: number }
export interface Session { key: string; username: string; email: string | null; expiresAt: string }
export interface AuthChallenge { id: string; image: string; expiresAt: string; retryAfterSeconds: number }
export interface ImageProof { type: string; image: string; token: string; expires: number }
export interface Job {
  id: string; requestId: string; status: string; createdAt: string; updatedAt: string;
  noticeIds: string[]; records?: ServerNotice[]; error?: string;
}
export interface JobReply { job: Job }
export interface JobList { jobs: Job[]; hasMore: boolean; nextBefore?: string }
export interface ServiceFailure { error?: string; code?: string; challenge?: ImageProof; remainingAttempts?: number }
export interface DemoFixture { notice: ServerNotice }
export function emptyState(): SavedState { return { version: 1, rows: [], deletedRows: [], pending: null, draft: '', demoIndex: 0, selectedDemo: -1 }; }
export function emptyRow(): NoticeRow {
  return { record: { schemaVersion: 5, id: 'empty', kind: 'task', title: '', summary: '', originalText: '', deadline: null,
    deadlineText: '', tasks: [], warnings: [], materials: [], reminders: [], createdAt: '', updatedAt: '', completed: false, dismissed: false },
    expanded: false, openTasks: [], sourceOpen: false };
}
export function validID(value: string): boolean { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(value); }
function validLines(values: string[]): boolean {
  return Array.isArray(values) && values.length <= 100 && values.every((text: string) => typeof text === 'string' && text.length <= 4000);
}
export function validateRecord(value: ServerNotice): ServerNotice {
  if (!value || value.schemaVersion !== 5 || !validID(value.id) || typeof value.title !== 'string' ||
    value.title.length < 1 || value.title.length > 300 || typeof value.summary !== 'string' || value.summary.length > 4000 ||
    typeof value.originalText !== 'string' || value.originalText.length > 4000 || !Array.isArray(value.tasks) ||
    value.tasks.length > 100 || !validLines(value.warnings) || !validLines(value.materials) || !Array.isArray(value.reminders) || value.reminders.length > 100 ||
    typeof value.completed !== 'boolean' || typeof value.dismissed !== 'boolean' || typeof value.deadlineText !== 'string' ||
    (value.deadline !== null && typeof value.deadline !== 'string')) {
    throw new Error('这条整理结果暂时无法读取，原文还在。');
  }
  value.tasks.forEach((task: ServerTask) => {
    if (!task || !validID(task.id) || typeof task.text !== 'string' || task.text.length > 4000 || !validLines(task.details) ||
      typeof task.completed !== 'boolean' || typeof task.condition !== 'string' || typeof task.timeText !== 'string' ||
      (task.time !== null && typeof task.time !== 'string') || (task.location !== null && typeof task.location !== 'string') ||
      !Array.isArray(task.steps) || task.steps.length > 100) {
      throw new Error('待办信息不完整，原文还在。');
    }
    task.steps.forEach((step: ServerStep) => {
      if (!step || !validID(step.id) || typeof step.text !== 'string' || step.text.length > 4000 || !validLines(step.details)) throw new Error('待办步骤暂时无法读取。');
    });
  });
  value.reminders.forEach((reminder: ServerReminder) => {
    if (!reminder || !validID(reminder.id) || typeof reminder.text !== 'string' || reminder.text.length > 4000) throw new Error('提醒信息暂时无法读取。');
  });
  return value;
}
export function displayTime(instant: string | null, wording: string): string {
  if (instant) {
    const time = new Date(instant);
    if (Number.isFinite(time.getTime())) {
      const clock = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
      return `${time.getMonth() + 1}月${time.getDate()}日 ${clock}`;
    }
  }
  // An unknown year or relative deadline stays exactly as written; never fabricate a date.
  return typeof wording === 'string' ? wording.trim() : '';
}
export function readable(text: string): string { return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'); }
