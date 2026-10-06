import type { BackupAttachment, Notice } from '../domain/types';
import { MAX_NOTICES } from '../domain/notice';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_NOTICE_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_NOTICE_FILES = 10;

export interface StoredAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
}

let connection: Promise<IDBDatabase> | undefined;

/** The existing database name and record format preserve v1 attachments in place. */
function database(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('campus-inbox-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('附件存储不可用，请检查浏览器存储设置。'));
  }).catch(error => { connection = undefined; throw error; });
  return connection;
}

async function write(operation: (store: IDBObjectStore) => void): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('附件未能保存，设备存储空间可能不足。'));
    transaction.onabort = () => reject(new Error('附件保存未完成，原有文件仍保留。'));
    try { operation(transaction.objectStore('files')); }
    catch (error) { transaction.abort(); reject(error); }
  });
}

export function validateFiles(files: readonly Pick<Blob, 'size'>[]): void {
  if (files.length > MAX_NOTICE_FILES) throw new Error('每条通知最多添加 10 个附件。');
  if (files.some(file => file.size > MAX_FILE_BYTES)) throw new Error('单个附件不能超过 5 MB。');
  if (files.reduce((total, file) => total + file.size, 0) > MAX_NOTICE_FILE_BYTES) {
    throw new Error('一条通知的附件总大小不能超过 20 MB。');
  }
}

export async function getFile(id: string): Promise<StoredAttachment | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('files').objectStore('files').get(id);
    request.onsuccess = () => resolve((request.result as StoredAttachment | undefined) ?? null);
    request.onerror = () => reject(new Error('无法读取附件。'));
  });
}

export async function addFiles(files: readonly File[]): Promise<string[]> {
  validateFiles(files);
  if (!files.length) return [];
  const records: StoredAttachment[] = files.map(file => ({
    id: crypto.randomUUID(), name: file.name.slice(0, 250) || '附件',
    type: file.type.slice(0, 100), size: file.size, blob: file,
  }));
  await write(store => { for (const record of records) store.put(record); });
  return records.map(record => record.id);
}

export async function removeFiles(ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  await write(store => { for (const id of new Set(ids)) store.delete(id); });
}

/** Call after undo expires; include drafts or pending results in protected notices. */
export async function cleanupFiles(ids: readonly string[], notices: readonly Notice[]): Promise<void> {
  const used = new Set(notices.flatMap(notice => notice.attachments));
  await removeFiles(ids.filter(id => !used.has(id)));
}

async function encode(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 32_768));
  }
  return btoa(binary);
}

export async function exportFiles(notices: readonly Notice[]): Promise<BackupAttachment[]> {
  const ids = [...new Set(notices.flatMap(notice => notice.attachments))];
  let size = 0;
  const files: BackupAttachment[] = [];
  for (const id of ids) {
    const file = await getFile(id);
    if (!file) throw new Error('有附件不在此设备，无法生成完整备份。');
    size += file.size;
    if (size > MAX_BACKUP_FILE_BYTES) throw new Error('备份附件总大小不能超过 50 MB。');
    files.push({ id, name: file.name, type: file.type, size: file.size, data: await encode(file.blob) });
  }
  return files;
}

/** Imported files use new ids so restoring a backup cannot overwrite an existing file. */
export async function restoreFiles(attachments: unknown, notices: Notice[]): Promise<{ notices: Notice[]; ids: string[] }> {
  const required = new Set(notices.flatMap(notice => notice.attachments));
  if (!required.size) {
    if (attachments !== undefined && (!Array.isArray(attachments) || attachments.length)) {
      throw new Error('备份包含未关联的附件。');
    }
    return { notices, ids: [] };
  }
  if (!Array.isArray(attachments) || attachments.length > MAX_NOTICES * MAX_NOTICE_FILES) {
    throw new Error('备份缺少附件或附件数量过多。');
  }
  const mapping = new Map<string, string>();
  const records = new Map<string, StoredAttachment>();
  let total = 0;
  for (const value of attachments) {
    const file = value as BackupAttachment | null;
    if (!file || !required.has(file.id) || mapping.has(file.id)
      || typeof file.name !== 'string' || !file.name || file.name.length > 250
      || typeof file.type !== 'string' || file.type.length > 100
      || !Number.isInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES
      || typeof file.data !== 'string' || file.data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4
      || file.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) {
      throw new Error('附件备份格式不正确。');
    }
    const binary = atob(file.data);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    if (bytes.length !== file.size) throw new Error('附件大小与备份记录不一致。');
    total += bytes.length;
    if (total > MAX_BACKUP_FILE_BYTES) throw new Error('备份附件总大小不能超过 50 MB。');
    const id = crypto.randomUUID();
    mapping.set(file.id, id);
    records.set(file.id, { id, name: file.name, type: file.type, size: file.size,
      blob: new Blob([bytes], { type: file.type }) });
  }
  if (mapping.size !== required.size) throw new Error('备份中有附件缺失。');
  for (const notice of notices) validateFiles(notice.attachments.map(id => records.get(id)!));
  await write(store => { for (const record of records.values()) store.put(record); });
  return {
    notices: notices.map(notice => ({ ...notice, attachments: notice.attachments.map(id => mapping.get(id)!) })),
    ids: [...mapping.values()],
  };
}

export const attachmentStore = { validateFiles, getFile, addFiles, removeFiles, cleanupFiles, exportFiles, restoreFiles };
