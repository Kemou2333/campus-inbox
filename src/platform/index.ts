import { createAndroidPlatform } from './android';
import { createBrowserPlatform } from './browser';

/** Device functions live behind this boundary; the notification UI is shared. */
export interface NativeTheme {
  dark: boolean;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  surface: string;
  surfaceVariant: string;
  onSurface: string;
  outline: string;
  secondary: string;
  tertiary: string;
}

export interface PlatformCapabilities {
  calendar: boolean;
  fileSave: boolean;
  shareText: boolean;
  localReminders: boolean;
  /** Installed APK version, when reported by the native host. */
  appVersion?: string;
  theme: NativeTheme | null;
}

export interface CalendarEvent {
  title: string;
  description?: string;
  location?: string;
  startMillis: number;
  endMillis?: number;
  allDay?: boolean;
}

export type SaveResult = { status: 'saved' | 'cancelled' | 'downloaded' };
export type CalendarResult = { status: 'opened' | 'downloaded' | 'cancelled'; saved: false };

export interface LocalReminder {
  id: string;
  /** Parent record for task alarms. Older bridges can ignore this optional field. */
  noticeId?: string;
  title: string;
  body?: string;
  triggerMillis: number;
}
export type ReminderResult = { status: 'scheduled' | 'permission-denied' | 'unsupported'; approximate: true };
export type OperationHaptic = 'complete' | 'organized' | 'remove' | 'step' | 'selection';
export type AppUpdateResult = {
  status: 'current' | 'available' | 'busy' | 'cooldown' | 'error' | 'unsupported';
  currentVersion?: string;
  version?: string;
  download?: string;
  github?: string;
  aliyun?: string;
};

export interface HomeWidgetSummary {pendingCount:number;title?:string;noticeId?:string}

export interface PlatformAPI {
  readonly kind: 'browser' | 'android';
  readonly ready: Promise<PlatformCapabilities>;
  /** Keep native system bars in the same light/dark mode as the web surface. */
  setAppearance?(dark:boolean):Promise<void>;
  /** Best-effort confirmation after saving an important action; follows system touch feedback. */
  hapticFeedback?(kind:OperationHaptic):Promise<void>;
  /** Public release metadata only; never downloads or installs an APK. */
  checkForUpdate?():Promise<AppUpdateResult>;
  /** Local desktop summary only; null removes stale/private presentation data. */
  updateHomeWidget?(summary:HomeWidgetSummary|null):Promise<void>;
  getOpenedInbox?():Promise<boolean>;
  onOpenInbox?(listener:()=>void):()=>void;
  /** Takes one item from the native queue. Never triggers AI or alters a draft. */
  getSharedText(): Promise<string | null>;
  onShare(listener: () => void): () => void;
  /** Return true to consume Back, for example while closing an application dialog. */
  onBack(listener: () => boolean): () => void;
  getOpenedNotice(): Promise<string | null>;
  onOpenNotice(listener: () => void): () => void;
  saveFile(blob: Blob, name: string): Promise<SaveResult>;
  openCalendar(event: CalendarEvent): Promise<CalendarResult>;
  scheduleReminder(reminder: LocalReminder): Promise<ReminderResult>;
  cancelReminder(id: string): Promise<void>;
  dispose(): void;
}

export function createPlatform(): PlatformAPI {
  return typeof window !== 'undefined' && window.CampusNative?.postMessage
    ? createAndroidPlatform(window.CampusNative)
    : createBrowserPlatform();
}
