import { MAX_NOTICES, parseNotices } from '../domain/notice';
import type { Notice, NoticeRepository } from '../domain/types';
import { NOTICE_KEY, readLegacy } from './legacy-migration';

interface StoredNotices { version: 5; revision: number; notices: Notice[] }
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
type StorageEvents = Pick<Window, 'addEventListener' | 'removeEventListener'>;

function read(value: string): StoredNotices {
  const body = JSON.parse(value) as Record<string, unknown>;
  if (!body || body.version !== 5 || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error('通知存储格式异常，请通过备份恢复');
  return { version: 5, revision: body.revision as number, notices: parseNotices(body.notices) };
}

/** One local repository; swapping its implementation later is enough to add a sync service. */
export class LocalRepository implements NoticeRepository {
  private raw: string | null = null;
  private revision = 0;
  private loaded = false;
  private listeners = new Set<(notices: Notice[]) => void>();
  readonly key = NOTICE_KEY;
  migratedFromLegacy = false;

  constructor(private storage: StoragePort = localStorage, private events?: StorageEvents) {}

  load(): Notice[] {
    const raw = this.storage.getItem(NOTICE_KEY);
    if (raw !== null) {
      const body = read(raw);
      this.raw = raw; this.revision = body.revision; this.loaded = true;
      return body.notices;
    }
    const legacy = readLegacy(this.storage);
    this.raw = null; this.revision = 0; this.loaded = true;
    if (legacy !== null) {
      this.save(legacy);
      this.migratedFromLegacy = true;
      return legacy;
    }
    return [];
  }

  save(notices: Notice[]): void {
    if (!this.loaded) this.load();
    if (notices.length > MAX_NOTICES) throw new Error(`最多保存 ${MAX_NOTICES} 条通知`);
    if (this.storage.getItem(NOTICE_KEY) !== this.raw) throw new Error('另一标签页更新了通知，请重新载入后再试');
    const next = JSON.stringify({ version: 5, revision: this.revision + 1, notices } satisfies StoredNotices);
    // If storage is full, nothing in the current repository advances to an unsaved state.
    this.storage.setItem(NOTICE_KEY, next);
    this.raw = next; this.revision++; this.loaded = true;
    this.listeners.forEach(listener => listener(structuredClone(notices)));
  }

  private onStorage = (event: Event): void => {
    const e = event as StorageEvent;
    if (e.key !== NOTICE_KEY || e.storageArea !== undefined && e.storageArea !== null && e.storageArea !== this.storage) return;
    const notices = this.load();
    this.listeners.forEach(listener => listener(notices));
  };
  subscribe(listener: (notices: Notice[]) => void): () => void {
    if (!this.listeners.size) this.events?.addEventListener('storage', this.onStorage);
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.events?.removeEventListener('storage', this.onStorage);
    };
  }
}

export function createLocalRepository(storage: StoragePort = localStorage): LocalRepository {
  return new LocalRepository(storage, typeof window === 'undefined' ? undefined : window);
}
