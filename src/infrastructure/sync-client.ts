import { newID, parseNotice } from '../domain/notice';
import type { Notice, NoticeRepository } from '../domain/types';

export interface SyncConflict { id: string; version: number; local: Notice | null; remote: Notice | null }
export interface SyncState {
  connected: boolean;
  status: 'disconnected' | 'idle' | 'syncing' | 'offline' | 'error';
  lastSyncedAt: string | null;
  error: string | null;
  pendingChanges: number;
  hasMore: boolean;
  conflicts: SyncConflict[];
}
interface RemoteUpdate { id: string; version: number; record: Notice | null }
interface Change { id: string; baseVersion: number; record: Notice | null }
interface Metadata {
  version: 1;
  key: string;
  cursor: number;
  versions: Record<string, number>;
  hashes: Record<string, string | null>;
  conflicts: RemoteUpdate[];
  lastSyncedAt: string | null;
  hasMore: boolean;
}
interface SyncReply {
  cursor: number;
  accepted: { id: string; version: number }[];
  updates: RemoteUpdate[];
  conflicts: RemoteUpdate[];
  hasMore: boolean;
}
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface CloudSyncOptions {
  onState?: (state: SyncState) => void;
  storage?: StoragePort;
  fetch?: typeof fetch;
}

/** No attachments, credentials or device-only files are part of a cloud record. */
export function cloudRecord(record: Notice): Notice { return { ...record, attachments: [] }; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
/** A compact change fingerprint, not authentication. Server CAS versions protect writes. */
export function recordHash(record: Notice | null): string | null {
  if (!record) return null;
  const text = canonical(cloudRecord(record));
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i); first = Math.imul(first ^ c, 0x01000193); second = Math.imul(second ^ c, 0x85ebca6b);
  }
  return `${text.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}
export function normalizeSyncEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('云同步需要 HTTPS 地址');
  url.pathname = `${url.pathname.replace(/\/(?:analyze|sync(?:\/accounts)?)\/?$/, '').replace(/\/$/, '')}/sync`;
  url.search = ''; url.hash = ''; url.username = ''; url.password = '';
  return url.href;
}
function emptyMetadata(key: string): Metadata {
  return { version: 1, key, cursor: 0, versions: {}, hashes: {}, conflicts: [], lastSyncedAt: null, hasMore: false };
}
function parseUpdate(value: unknown): RemoteUpdate {
  const o = value as Partial<RemoteUpdate> | null;
  if (!o || typeof o.id !== 'string' || !o.id || o.id.length > 150 || !Number.isSafeInteger(o.version) || Number(o.version) < 1) throw new Error('云同步返回了无效记录');
  const record = o.record === null ? null : parseNotice(o.record);
  if (record && (record.id !== o.id || record.attachments.length)) throw new Error('云通知字段不正确');
  return { id: o.id, version: o.version!, record };
}
function parseReply(value: unknown): SyncReply {
  const o = value as Partial<SyncReply> | null;
  if (!o || !Number.isSafeInteger(o.cursor) || Number(o.cursor) < 0 || typeof o.hasMore !== 'boolean' || !Array.isArray(o.accepted) || !Array.isArray(o.updates) || !Array.isArray(o.conflicts)) throw new Error('云同步返回格式不正确');
  const accepted = o.accepted.map(a => {
    if (!a || typeof a.id !== 'string' || !Number.isSafeInteger(a.version) || a.version < 1) throw new Error('云同步确认格式不正确');
    return { id: a.id, version: a.version };
  });
  return { cursor: o.cursor!, accepted, updates: o.updates.map(parseUpdate), conflicts: o.conflicts.map(parseUpdate), hasMore: o.hasMore };
}

/** Local-first continuous sync. The app schedules saves/polls; no hidden background timer. */
export class CloudSync {
  private endpoint: string;
  private storage: StoragePort;
  private fetcher: typeof fetch;
  private storageKey: string;
  private metadata: Metadata | null = null;
  private state: SyncState = { connected: false, status: 'disconnected', lastSyncedAt: null, error: null, pendingChanges: 0, hasMore: false, conflicts: [] };
  private listeners = new Set<(state: SyncState) => void>();
  private running: Promise<SyncState> | null = null;
  private rerun = false;
  private generation = 0;
  private controller: AbortController | null = null;

  constructor(private repository: NoticeRepository, endpoint: string, options: CloudSyncOptions = {}) {
    this.endpoint = normalizeSyncEndpoint(endpoint);
    this.storageKey = `campus-inbox:sync:v1:${this.endpoint}`;
    this.storage = options.storage ?? localStorage;
    this.fetcher = (options.fetch ?? fetch).bind(globalThis);
    if (options.onState) this.listeners.add(options.onState);
    const raw = this.storage.getItem(this.storageKey);
    if (raw) {
      const saved = JSON.parse(raw) as Metadata;
      if (saved.version !== 1 || typeof saved.key !== 'string' || !Number.isSafeInteger(saved.cursor) || !saved.versions || !saved.hashes || !Array.isArray(saved.conflicts)) throw new Error('同步设置格式异常，请重新连接云空间');
      this.metadata = { ...saved, conflicts: saved.conflicts.map(parseUpdate), hasMore: !!saved.hasMore };
      this.refreshState('idle');
    }
  }
  getKey(): string | null { return this.metadata?.key ?? null; }
  getState(): SyncState { return structuredClone(this.state); }
  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener); listener(this.getState());
    return () => { this.listeners.delete(listener); };
  }
  private localMap(): Map<string, Notice> { return new Map(this.repository.load().map(n => [n.id, n])); }
  private changes(local: Map<string, Notice>): Change[] {
    if (!this.metadata) return [];
    const m = this.metadata, conflictIDs = new Set(m.conflicts.map(c => c.id));
    const ids = new Set([...local.keys(), ...Object.keys(m.versions)]), result: Change[] = [];
    for (const id of ids) {
      if (conflictIDs.has(id)) continue;
      const n = local.get(id) ?? null, hash = recordHash(n), old = m.hashes[id];
      if (hash === old || hash === null && old === undefined) continue;
      result.push({ id, baseVersion: m.versions[id] ?? 0, record: n ? cloudRecord(n) : null });
    }
    return result;
  }
  private refreshState(status = this.state.status, error: string | null = null): void {
    const local = this.localMap(), m = this.metadata;
    this.state = {
      connected: !!m, status: m ? status : 'disconnected', error, lastSyncedAt: m?.lastSyncedAt ?? null,
      pendingChanges: this.changes(local).length, hasMore: m?.hasMore ?? false,
      conflicts: m?.conflicts.map(c => ({ ...c, local: local.get(c.id) ?? null, remote: c.record })) ?? [],
    };
    const state = this.getState(); this.listeners.forEach(fn => fn(state));
  }
  private persist(): void { if (this.metadata) this.storage.setItem(this.storageKey, JSON.stringify(this.metadata)); }
  private async request(body: unknown, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController(), abort = () => controller.abort();
    const timer = setTimeout(abort, 15000); signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.metadata!.key}` }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        const messages: Record<number, string> = { 401: '同步密钥无效，请检查后重新连接', 413: '同步内容超出云空间限制，原记录仍保存在本机', 429: '同步请求较多，稍后会继续', 503: '云同步暂时不可用，原记录仍保存在本机' };
        throw new Error(messages[response.status] ?? '云同步失败，原记录仍保存在本机');
      }
      return await response.json();
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async connect(key: string): Promise<SyncState> {
    const trimmed = key.trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(trimmed)) throw new Error('登录会话无效，请重新登录');
    this.generation++; this.controller?.abort();
    if (this.metadata?.key !== trimmed) this.metadata = emptyMetadata(trimmed);
    this.persist(); this.refreshState('idle');
    // An old connection may still be unwinding; its response cannot modify this generation.
    if (this.running) await this.running;
    return this.syncNow();
  }
  disconnect(): void {
    this.generation++; this.controller?.abort(); this.metadata = null; this.rerun = false;
    this.storage.removeItem(this.storageKey); this.refreshState('disconnected');
  }
  /** Concurrent save/focus calls coalesce. New edits during a request get another pass. */
  syncNow(): Promise<SyncState> {
    if (!this.metadata) return Promise.resolve(this.getState());
    if (this.running) { this.rerun = true; return this.running; }
    const generation = this.generation;
    this.running = this.run(generation).finally(() => { this.running = null; });
    return this.running;
  }
  private batch(changes: Change[]): Change[] {
    const result: Change[] = []; let bytes = 100;
    for (const change of changes) {
      const size = new TextEncoder().encode(JSON.stringify(change)).length;
      if (change.record && new TextEncoder().encode(JSON.stringify(change.record)).length > 65536) throw new Error('有一条通知超过云同步的 64 KB 限制，请先精简该通知；本地记录已保留');
      if (result.length >= 50 || bytes + size > 950000) break;
      result.push(change); bytes += size;
    }
    return result;
  }
  private async run(generation: number): Promise<SyncState> {
    this.controller = new AbortController(); const signal = this.controller.signal;
    try {
      // Five bounded batches per wake-up; ordinary use completes in the first one.
      for (let round = 0; round < 5 && this.metadata && generation === this.generation; round++) {
        this.rerun = false;
        if (this.localMap().size > 1000) throw new Error('当前本机超过 1000 条通知，云空间最多同步 1000 条；本地通知不会删除');
        this.refreshState('syncing');
        const changes = this.metadata.hasMore ? [] : this.batch(this.changes(this.localMap()));
        const reply = parseReply(await this.request({ cursor: this.metadata.cursor, changes }, signal));
        if (!this.metadata || generation !== this.generation) return this.getState();
        this.apply(reply, changes);
        this.metadata.lastSyncedAt = new Date().toISOString(); this.persist();
        this.refreshState('idle');
        if (!this.rerun && !this.metadata.hasMore && !this.changes(this.localMap()).length) break;
      }
    } catch (error) {
      if (generation === this.generation && this.metadata) {
        const offline = error instanceof TypeError || error instanceof Error && error.name === 'AbortError';
        this.refreshState(offline ? 'offline' : 'error', offline ? '暂时无法连接云端，修改已保存在本机，稍后自动重试' : error instanceof Error ? error.message : '暂时无法同步，稍后自动重试');
      }
    } finally {
      if (generation === this.generation) this.controller = null;
    }
    return this.getState();
  }
  private apply(reply: SyncReply, changes: Change[]): void {
    const m = structuredClone(this.metadata!), local = this.localMap(), submitted = new Map(changes.map(c => [c.id, c]));
    let recordsChanged = false;
    for (const ack of reply.accepted) {
      const sent = submitted.get(ack.id);
      if (!sent) throw new Error('云同步确认了未提交的通知');
      m.versions[ack.id] = ack.version; m.hashes[ack.id] = recordHash(sent.record);
    }
    const conflicts = new Map(m.conflicts.map(c => [c.id, c]));
    const incomingConflicts = new Set(reply.conflicts.map(c => c.id));
    for (const update of reply.updates) {
      if (incomingConflicts.has(update.id) || update.version <= (m.versions[update.id] ?? 0)) continue;
      const current = local.get(update.id) ?? null, hash = recordHash(current), remoteHash = recordHash(update.record);
      if (hash !== remoteHash && hash !== m.hashes[update.id] && !(hash === null && m.hashes[update.id] === undefined)) {
        conflicts.set(update.id, update); continue;
      }
      if (hash !== remoteHash) {
        if (update.record) local.set(update.id, { ...update.record, attachments: current?.attachments ?? [] });
        else local.delete(update.id);
        recordsChanged = true;
      }
      m.versions[update.id] = update.version; m.hashes[update.id] = remoteHash; conflicts.delete(update.id);
    }
    for (const conflict of reply.conflicts) {
      const hash = recordHash(local.get(conflict.id) ?? null), remoteHash = recordHash(conflict.record);
      if (hash === remoteHash) { m.versions[conflict.id] = conflict.version; m.hashes[conflict.id] = remoteHash; conflicts.delete(conflict.id); }
      else if (conflict.version >= (conflicts.get(conflict.id)?.version ?? 0)) conflicts.set(conflict.id, conflict);
    }
    if (recordsChanged) this.repository.save([...local.values()]);
    m.conflicts = [...conflicts.values()]; m.cursor = reply.cursor; m.hasMore = reply.hasMore;
    this.metadata = m;
  }
  async resolveConflict(id: string, choice: 'local' | 'remote' | 'both'): Promise<SyncState> {
    if (!this.metadata) return this.getState();
    if (this.running) await this.running;
    if (!this.metadata) return this.getState();
    const m = this.metadata, conflict = m.conflicts.find(c => c.id === id);
    if (!conflict) return this.getState();
    const local = this.localMap(), current = local.get(id) ?? null;
    if (choice === 'remote' || choice === 'both') {
      if (choice === 'both' && current) {
        const copy: Notice = { ...structuredClone(current), id: newID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        local.set(copy.id, copy);
      }
      if (conflict.record) local.set(id, { ...conflict.record, attachments: choice === 'both' ? [] : current?.attachments ?? [] });
      else local.delete(id);
      this.repository.save([...local.values()]);
    }
    m.versions[id] = conflict.version; m.hashes[id] = recordHash(conflict.record); m.conflicts = m.conflicts.filter(c => c.id !== id);
    this.persist(); this.refreshState('idle');
    return this.syncNow();
  }
}

export function createCloudSync(repository: NoticeRepository, endpoint: string, options: CloudSyncOptions = {}): CloudSync {
  return new CloudSync(repository, endpoint, options);
}
