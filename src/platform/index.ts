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
  title: string;
  body?: string;
  triggerMillis: number;
}
export type ReminderResult = { status: 'scheduled' | 'permission-denied' | 'unsupported'; approximate: true };

export interface PlatformAPI {
  readonly kind: 'browser' | 'android';
  readonly ready: Promise<PlatformCapabilities>;
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
