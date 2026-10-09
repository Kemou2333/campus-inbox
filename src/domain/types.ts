/** Local v5 records. The server's AI contract remains v4 and never contains progress or notes. */
export type NoticeKind = 'task' | 'reminder' | 'information';
export type NoticeStatus = 'pending' | 'completed' | 'dismissed' | 'reminder';
export type TaskScope = 'all' | 'conditional' | 'role' | 'unspecified';
export type SortOrder = 'priority' | 'deadline' | 'newest';

export interface TimeSpec {
  type: 'date_time' | 'date' | 'partial' | 'relative' | 'unknown';
  year: number | null;
  month: number | null;
  day: number | null;
  hour: number | null;
  minute: number | null;
  rawText: string;
}

export interface TimelineEntry {
  label: string;
  time: string | null;
  timeText: string;
  location: string | null;
  timeSpec?: TimeSpec;
}

export interface AnalysisStep { text: string; details: string[] }
export interface AnalysisTask {
  text: string;
  assignee: string | null;
  scope: TaskScope;
  condition: string;
  details: string[];
  steps: AnalysisStep[];
  time: string | null;
  timeText: string;
  location: string | null;
  timeSpec?: TimeSpec;
}
export interface NoticeAnalysis {
  schemaVersion: 4;
  kind: NoticeKind;
  title: string;
  summary: string;
  deadline: string | null;
  deadlineText: string;
  deadlineSpec?: TimeSpec;
  timeline: TimelineEntry[];
  tasks: AnalysisTask[];
  materials: string[];
  warnings: string[];
  reminders: string[];
}
export interface AnalysisBatch { schemaVersion: 4; notices: NoticeAnalysis[]; sourceIndexes?: number[] }

export interface Step extends AnalysisStep {
  id: string;
  completed: boolean;
  note: string;
}
export interface Task extends Omit<AnalysisTask, 'steps'> {
  id: string;
  completed: boolean;
  dismissed: boolean;
  note: string;
  localDeadline: string | null;
  steps: Step[];
}
export interface Reminder { id: string; text: string; note: string }
export interface Notice extends Omit<NoticeAnalysis, 'schemaVersion' | 'tasks' | 'reminders'> {
  schemaVersion: 5;
  id: string;
  originalText: string;
  createdAt: string;
  updatedAt: string;
  completed: boolean;
  dismissed: boolean;
  note: string;
  localDeadline: string | null;
  audienceOverride: '' | 'all';
  reminders: Reminder[];
  attachments: string[];
  tasks: Task[];
}

export interface BackupAttachment { id: string; name: string; type: string; size: number; data: string }
export interface Backup {
  app: 'campus-inbox';
  version: 5;
  exportedAt: string;
  notices: Notice[];
  attachments?: BackupAttachment[];
}
export interface Priority {
  level: 'overdue' | 'today' | 'upcoming' | 'scheduled' | 'unknown';
  rank: number;
  due: string | null;
  label: string;
}
export type NoteTarget =
  | { type: 'notice' }
  | { type: 'task'; taskId: string }
  | { type: 'step'; taskId: string; stepId: string }
  | { type: 'reminder'; reminderId: string };

/** Future sync adapts this repository without giving UI components network responsibilities. */
export interface NoticeRepository {
  load(): Notice[];
  save(notices: Notice[]): void;
  subscribe(listener: (notices: Notice[]) => void): () => void;
}
