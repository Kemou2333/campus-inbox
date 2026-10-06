import { parseBackup, parseNotices } from '../domain/notice';
import type { Notice } from '../domain/types';

export const LEGACY_NOTICE_KEY = 'campus-inbox:notices:v1';
export const NOTICE_KEY = 'campus-inbox:notices:v5';
export const LEGACY_ATTACHMENT_DATABASE = 'campus-inbox-files';
export const LEGACY_ATTACHMENT_STORE = 'files';

/** Works for original browser arrays and exported v1-v4/v5 backups. No file IDs are changed. */
export function migrateLegacy(value: unknown): Notice[] {
  return Array.isArray(value) ? parseNotices(value) : parseBackup(value);
}
export function readLegacy(storage: Pick<Storage, 'getItem'>): Notice[] | null {
  const raw = storage.getItem(LEGACY_NOTICE_KEY);
  return raw === null ? null : migrateLegacy(JSON.parse(raw));
}

/** The old key is intentionally left intact until the user chooses to remove the previous app. */
export function legacyAvailable(storage: Pick<Storage, 'getItem'>): boolean {
  return storage.getItem(LEGACY_NOTICE_KEY) !== null;
}
