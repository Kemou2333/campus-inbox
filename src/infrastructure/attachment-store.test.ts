import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Notice } from '../domain/types';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
});

function noticeWithFiles(attachments: string[]): Notice {
  // The store only uses file references; domain parsing has its own tests.
  return { id: 'notice', attachments } as Notice;
}

describe('local attachment store', () => {
  it('stores original binary data and exports a complete backup', async () => {
    const store = await import('./attachment-store');
    const bytes = Uint8Array.from([0, 255, 128, 42]);
    const ids = await store.addFiles([new File([bytes], '记录.bin', { type: 'application/octet-stream' })]);
    const stored = await store.getFile(ids[0]);
    expect(stored?.name).toBe('记录.bin');
    expect(new Uint8Array(await stored!.blob.arrayBuffer())).toEqual(bytes);
    const backup = await store.exportFiles([noticeWithFiles(ids)]);
    expect(backup[0]).toMatchObject({ id: ids[0], size: 4, data: 'AP+AKg==' });
  });

  it('restores under new file ids and preserves pre-existing files', async () => {
    const store = await import('./attachment-store');
    const oldIds = await store.addFiles([new File(['旧内容'], '旧文件.txt')]);
    const backup = [{ id: oldIds[0], name: '恢复文件.txt', type: 'text/plain', size: 3, data: btoa('new') }];
    const result = await store.restoreFiles(backup, [noticeWithFiles(oldIds)]);
    expect(result.ids[0]).not.toBe(oldIds[0]);
    expect(result.notices[0].attachments).toEqual(result.ids);
    expect(await (await store.getFile(oldIds[0]))!.blob.text()).toBe('旧内容');
    expect(await (await store.getFile(result.ids[0]))!.blob.text()).toBe('new');
  });

  it('reads the old v1 database without moving or overwriting attachment data', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('campus-inbox-files', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
      request.onsuccess = () => {
        const transaction = request.result.transaction('files', 'readwrite');
        transaction.objectStore('files').put({ id: 'legacy-id', name: '原附件.txt', type: 'text/plain', size: 6, blob: new Blob(['旧的']) });
        transaction.oncomplete = () => { request.result.close(); resolve(); };
      };
      request.onerror = () => reject(request.error);
    });
    const store = await import('./attachment-store');
    expect(await (await store.getFile('legacy-id'))!.blob.text()).toBe('旧的');
  });

  it('keeps shared attachments until all notice references have gone', async () => {
    const store = await import('./attachment-store');
    const ids = await store.addFiles([new File(['data'], '共享.txt')]);
    await store.cleanupFiles(ids, [noticeWithFiles(ids)]);
    expect(await store.getFile(ids[0])).not.toBeNull();
    await store.cleanupFiles(ids, []);
    expect(await store.getFile(ids[0])).toBeNull();
  });

  it('rejects missing or inconsistent backup bytes before writing anything', async () => {
    const store = await import('./attachment-store');
    const notices = [noticeWithFiles(['one'])];
    await expect(store.restoreFiles([], notices)).rejects.toThrow('缺失');
    await expect(store.restoreFiles([{ id: 'one', name: '文件', type: '', size: 5, data: btoa('a') }], notices)).rejects.toThrow('大小');
    expect(await store.getFile('one')).toBeNull();
  });

  it('enforces practical file-count and byte limits at the persistence boundary', async () => {
    const store = await import('./attachment-store');
    expect(() => store.validateFiles(Array.from({ length: 11 }, () => ({ size: 1 })))).toThrow('10');
    expect(() => store.validateFiles([{ size: store.MAX_FILE_BYTES + 1 }])).toThrow('5 MB');
    expect(() => store.validateFiles(Array.from({ length: 5 }, () => ({ size: store.MAX_FILE_BYTES })))).toThrow('20 MB');
  });
});
