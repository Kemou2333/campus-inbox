import { describe, expect, test } from 'vitest';
import { createNotice, updateNote } from '../src/domain/notice';
import type { Notice, NoticeAnalysis } from '../src/domain/types';
import { createCloudSync, normalizeSyncEndpoint, recordHash } from '../src/infrastructure/sync-client';
import { LocalRepository } from '../src/infrastructure/local-repository';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
const analysis: NoticeAnalysis = { schemaVersion: 4, kind: 'task', title: '核对学籍', summary: '核对学籍信息后确认。', deadline: null, deadlineText: '10月15日前', timeline: [], materials: [], warnings: [], reminders: [], tasks: [{ text: '核对学籍信息', assignee: '2026级新生', scope: 'all', condition: '', details: [], steps: [], time: null, timeText: '10月15日前', location: null }] };
const record = () => createNotice(analysis, '通知原文', '2026-10-01T13:00:00Z');
type Row = { id: string; version: number; record: Notice | null };
type Body = { cursor: number; changes: { id: string; baseVersion: number; record: Notice | null }[] };
class SyncServer {
  key = 'A'.repeat(43);
  revision = 0;
  rows = new Map<string, Row>();
  requests: Body[] = [];
  pageSize = 100;
  beforeReply: (() => Promise<void> | void) | null = null;
  failed = false;
  fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (this.failed) throw new TypeError('Failed to fetch');
    if (new Headers(init?.headers).get('Authorization') !== `Bearer ${this.key}`) return Response.json({}, { status: 401 });
    const body = JSON.parse(String(init?.body)) as Body; this.requests.push(structuredClone(body));
    const accepted: { id: string; version: number }[] = [], conflicts: Row[] = [];
    for (const change of body.changes) {
      const current = this.rows.get(change.id);
      if ((current?.version ?? 0) !== change.baseVersion) { conflicts.push(structuredClone(current!)); continue; }
      const next = { id: change.id, version: ++this.revision, record: structuredClone(change.record) };
      this.rows.set(change.id, next); accepted.push({ id: next.id, version: next.version });
    }
    const updates = [...this.rows.values()].filter(r => r.version > body.cursor).sort((a, b) => a.version - b.version).slice(0, this.pageSize);
    const hasMore = updates.length > 0 && updates[updates.length - 1].version < this.revision;
    const cursor = hasMore ? updates[updates.length - 1].version : this.revision;
    const reply = { accepted, conflicts, updates: structuredClone(updates), cursor, hasMore };
    const hook = this.beforeReply; this.beforeReply = null; await hook?.();
    return Response.json(reply);
  }) as typeof fetch;
}
function device(server: SyncServer, records: Notice[] = []) {
  const storage = new MemoryStorage(), repository = new LocalRepository(storage); repository.load(); repository.save(records);
  const sync = createCloudSync(repository, 'https://example.test/analyze', { storage, fetch: server.fetch });
  return { storage, repository, sync };
}

describe('continuous text-only cloud sync', () => {
  test('creation uploads actual local records, another device continuously receives edits', async () => {
    const server = new SyncServer(), n = { ...record(), attachments: ['private-file'] }, first = device(server, [n]);
    await first.sync.connect(server.key); expect(first.sync.getKey()).toBe(server.key);
    expect(server.rows.get(n.id)?.record?.attachments).toEqual([]);
    expect(first.repository.load()[0].attachments).toEqual(['private-file']);
    const second = device(server); await second.sync.connect(server.key);
    expect(second.repository.load()[0].title).toBe(n.title); expect(second.repository.load()[0].attachments).toEqual([]);
    second.repository.save([updateNote(second.repository.load()[0], { type: 'notice' }, '明天办理')]); await second.sync.syncNow(); await first.sync.syncNow();
    expect(first.repository.load()[0].note).toBe('明天办理'); expect(first.repository.load()[0].attachments).toEqual(['private-file']);
    expect(first.sync.getState().pendingChanges).toBe(0);
  });
  test('the sync identity persists; reloading does not turn it into a one-shot import', async () => {
    const server = new SyncServer(), first = device(server, [record()]); await first.sync.connect(server.key);
    const loaded = createCloudSync(first.repository, 'https://example.test/analyze', { storage: first.storage, fetch: server.fetch });
    expect(loaded.getState().connected).toBe(true); expect(loaded.getKey()).toBe(server.key);
    const before = server.revision; await loaded.syncNow(); expect(server.revision).toBe(before);
    expect(loaded.getState().lastSyncedAt).toBeTruthy();
  });
  test('remote text updates never clear or upload files owned by this device', async () => {
    const server = new SyncServer(), n = record(), first = device(server, [{ ...n, attachments: ['local-image'] }]); await first.sync.connect(server.key);
    const second = device(server); await second.sync.connect(server.key);
    const edited = updateNote(second.repository.load()[0], { type: 'task', taskId: n.tasks[0].id }, '已确认');
    second.repository.save([edited]); await second.sync.syncNow(); await first.sync.syncNow();
    expect(first.repository.load()[0].attachments).toEqual(['local-image']); expect(server.rows.get(n.id)?.record?.attachments).toEqual([]);
    const before = server.revision; first.repository.save([{ ...first.repository.load()[0], attachments: ['new-local-file'] }]); await first.sync.syncNow();
    expect(server.revision).toBe(before);
  });
  test('deletion propagates as a tombstone and a later poll does not resurrect it', async () => {
    const server = new SyncServer(), n = record(), first = device(server, [n]); await first.sync.connect(server.key);
    const second = device(server); await second.sync.connect(server.key);
    first.repository.save([]); await first.sync.syncNow(); expect(server.rows.get(n.id)?.record).toBeNull();
    await second.sync.syncNow(); expect(second.repository.load()).toEqual([]);
    const before = server.revision; await second.sync.syncNow(); await first.sync.syncNow(); expect(server.revision).toBe(before);
  });
  test('an edit made during upload is not falsely acknowledged or overwritten', async () => {
    const server = new SyncServer(), n = record(), first = device(server, [n]);
    server.beforeReply = () => { first.repository.save([updateNote(first.repository.load()[0], { type: 'notice' }, '请求过程中补充的笔记')]); };
    await first.sync.connect(server.key);
    expect(server.rows.get(n.id)?.record?.note).toBe('请求过程中补充的笔记');
    expect(first.repository.load()[0].note).toBe('请求过程中补充的笔记');
    expect(server.requests.filter(r => r.changes.length)).toHaveLength(2);
  });
  test('network failure retains changes and the next automatic wake-up uploads them', async () => {
    const server = new SyncServer(), n = record(), first = device(server, [n]); await first.sync.connect(server.key);
    first.repository.save([updateNote(n, { type: 'notice' }, '离线新增笔记')]); server.failed = true; await first.sync.syncNow();
    expect(first.sync.getState()).toMatchObject({ status: 'offline', pendingChanges: 1 }); expect(first.repository.load()[0].note).toBe('离线新增笔记');
    server.failed = false; await first.sync.syncNow(); expect(server.rows.get(n.id)?.record?.note).toBe('离线新增笔记');
  });
});

describe('conflicts preserve both devices until a choice is made', () => {
  async function conflict() {
    const server = new SyncServer(), n = record(), first = device(server, [{ ...n, attachments: ['image'] }]); await first.sync.connect(server.key);
    const second = device(server); await second.sync.connect(server.key);
    first.repository.save([updateNote(first.repository.load()[0], { type: 'notice' }, '第一台笔记')]);
    second.repository.save([updateNote(second.repository.load()[0], { type: 'notice' }, '第二台笔记')]);
    await first.sync.syncNow(); await second.sync.syncNow();
    return { server, n, first, second };
  }
  test('concurrent updates remain local with an explicit remote conflict', async () => {
    const { n, second } = await conflict();
    expect(second.repository.load()[0].note).toBe('第二台笔记');
    expect(second.sync.getState().conflicts[0]).toMatchObject({ id: n.id, local: { note: '第二台笔记' }, remote: { note: '第一台笔记' } });
  });
  test('choosing local retries against the current server version', async () => {
    const { server, n, first, second } = await conflict(); await second.sync.resolveConflict(n.id, 'local'); await first.sync.syncNow();
    expect(server.rows.get(n.id)?.record?.note).toBe('第二台笔记'); expect(first.repository.load()[0].note).toBe('第二台笔记');
    expect(second.sync.getState().conflicts).toEqual([]);
  });
  test('choosing remote accepts it without generating an echo update', async () => {
    const { server, n, second } = await conflict(), before = server.revision; await second.sync.resolveConflict(n.id, 'remote');
    expect(second.repository.load()[0].note).toBe('第一台笔记'); expect(server.revision).toBe(before); expect(second.sync.getState().conflicts).toEqual([]);
  });
  test('keeping both duplicates the local card and retains original AI wording', async () => {
    const { server, n, second } = await conflict(); await second.sync.resolveConflict(n.id, 'both');
    const records = second.repository.load(); expect(records).toHaveLength(2); expect(server.rows.size).toBe(2);
    expect(records.find(r => r.id === n.id)?.note).toBe('第一台笔记');
    const copy = records.find(r => r.id !== n.id)!; expect(copy.note).toBe('第二台笔记'); expect(copy.originalText).toBe(n.originalText); expect(copy.title).toBe(n.title);
  });
  test('a stale local deletion cannot silently remove a newer server edit', async () => {
    const server = new SyncServer(), n = record(), first = device(server, [n]); await first.sync.connect(server.key);
    const second = device(server); await second.sync.connect(server.key);
    first.repository.save([updateNote(n, { type: 'notice' }, '更新通知')]); await first.sync.syncNow();
    second.repository.save([]); await second.sync.syncNow();
    expect(server.rows.get(n.id)?.record?.note).toBe('更新通知'); expect(second.sync.getState().conflicts[0].local).toBeNull();
    await second.sync.resolveConflict(n.id, 'remote'); expect(second.repository.load()[0].note).toBe('更新通知');
  });
});

describe('pagination, acknowledgements and storage', () => {
  test('a server no-op deletion acknowledges version zero without repeating forever', async () => {
    const server = new SyncServer(), n = record(), first = device(server);
    first.storage.setItem('campus-inbox:sync:v1:https://example.test/sync', JSON.stringify({
      version: 1, key: server.key, cursor: 0, versions: { [n.id]: 0 },
      hashes: { [n.id]: recordHash(n) }, conflicts: [], lastSyncedAt: null, hasMore: false,
    }));
    const requests: Body[] = [];
    const fetcher = (async (_: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Body; requests.push(body);
      return Response.json({ cursor: 0, accepted: body.changes.map(c => ({ id: c.id, version: 0 })), updates: [], conflicts: [], hasMore: false });
    }) as typeof fetch;
    const sync = createCloudSync(first.repository, 'https://example.test', { storage: first.storage, fetch: fetcher });
    await sync.syncNow(); expect(sync.getState().status).toBe('idle'); expect(sync.getState().pendingChanges).toBe(0);
    expect(requests[0].changes).toEqual([{ id: n.id, baseVersion: 0, record: null }]);
    await sync.syncNow(); expect(requests[1].changes).toEqual([]);
  });
  test('accepted versions stop retransmitting changes before their update page arrives', async () => {
    const server = new SyncServer(); server.pageSize = 1;
    const first = device(server, [record(), record(), record()]); await first.sync.connect(server.key);
    expect(server.requests[0].changes).toHaveLength(3); expect(server.requests.slice(1).every(r => !r.changes.length)).toBe(true);
    expect(server.revision).toBe(3); expect(first.sync.getState().hasMore).toBe(false); expect(first.sync.getState().pendingChanges).toBe(0);
    const second = device(server); await second.sync.connect(server.key); expect(second.repository.load()).toHaveLength(3);
  });
  test('more than 50 records use bounded batches and converge without a user import button', async () => {
    const server = new SyncServer(), first = device(server, Array.from({ length: 120 }, record)); await first.sync.connect(server.key);
    expect(server.rows.size).toBe(120); expect(server.requests.filter(r => r.changes.length).map(r => r.changes.length)).toEqual([50, 50, 20]);
    expect(first.sync.getState().pendingChanges).toBe(0);
  });
  test('remote saves are not re-uploaded as local changes', async () => {
    const server = new SyncServer(), first = device(server, [record()]); await first.sync.connect(server.key);
    const second = device(server); await second.sync.connect(server.key); const before = server.revision;
    await second.sync.syncNow(); expect(server.revision).toBe(before); expect(server.requests.at(-1)?.changes).toEqual([]);
  });
  test('failed local persistence does not advance acknowledgement of remote data', async () => {
    const server = new SyncServer(), first = device(server, [record()]); await first.sync.connect(server.key);
    const second = device(server); const setItem = second.storage.setItem.bind(second.storage);
    second.storage.setItem = (key, value) => { if (key.includes('notices:v5')) throw new Error('QuotaExceededError'); setItem(key, value); };
    await second.sync.connect(server.key); expect(second.repository.load()).toEqual([]); expect(second.sync.getState().status).toBe('error');
    second.storage.setItem = setItem; await second.sync.syncNow(); expect(second.repository.load()).toHaveLength(1);
  });
  test('disconnect removes only this service login; local notes and cloud records stay', async () => {
    const server = new SyncServer(), n = record(), first = device(server, [n]); await first.sync.connect(server.key); first.sync.disconnect();
    expect(first.sync.getState().connected).toBe(false); expect(first.sync.getKey()).toBeNull(); expect(first.repository.load()).toHaveLength(1); expect(server.rows.size).toBe(1);
    const reloaded = createCloudSync(first.repository, 'https://example.test', { storage: first.storage, fetch: server.fetch }); expect(reloaded.getState().connected).toBe(false);
  });
  test('service changes do not silently send a saved key to another host', async () => {
    const server = new SyncServer(), first = device(server, [record()]); await first.sync.connect(server.key);
    const changed = createCloudSync(first.repository, 'https://new-server.example.test', { storage: first.storage, fetch: server.fetch }); expect(changed.getKey()).toBeNull();
    expect(normalizeSyncEndpoint('https://example.test/analyze?private=not-carried')).toBe('https://example.test/sync');
    expect(() => normalizeSyncEndpoint('http://example.test')).toThrow();
  });
  test('stable hashes ignore object property ordering and local attachments', () => {
    const n = record(), reordered = Object.fromEntries(Object.entries(n).reverse()) as unknown as Notice;
    expect(recordHash(n)).toBe(recordHash(reordered)); expect(recordHash({ ...n, attachments: ['local-file'] })).toBe(recordHash(n));
  });
});
