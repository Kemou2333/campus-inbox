import type { CalendarResult, NativeTheme, PlatformAPI, PlatformCapabilities, SaveResult } from './index';
import { calendarFile } from './browser';

export interface NativeBridge {
  postMessage(message: string): void;
  onmessage: ((event: { data: string }) => void) | null;
}

declare global {
  interface Window { CampusNative?: NativeBridge }
}

interface NativeReply { id: string; ok: boolean; data?: unknown; error?: string }
interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer?: ReturnType<typeof setTimeout>;
}

function readTheme(value: unknown): NativeTheme | null {
  if (!value || typeof value !== 'object') return null;
  const theme = value as NativeTheme;
  const colors = ['primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'surface',
    'surfaceVariant', 'onSurface', 'outline', 'secondary', 'tertiary'] as const;
  return typeof theme.dark === 'boolean' && colors.every(key => /^#[0-9a-f]{6}$/i.test(theme[key])) ? theme : null;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 32_768));
  }
  return btoa(binary);
}

export function createAndroidPlatform(bridge: NativeBridge): PlatformAPI {
  const pending = new Map<string, PendingRequest>();
  const shareListeners = new Set<() => void>();
  const backListeners = new Set<() => boolean>();
  const noticeListeners = new Set<() => void>();
  let sequence = 0;
  let disposed = false;
  let saving = false;

  const receive = (event: { data: string }) => {
    let reply: NativeReply;
    try { reply = JSON.parse(event.data) as NativeReply; } catch { return; }
    const request = pending.get(reply.id);
    if (!request) return;
    pending.delete(reply.id);
    clearTimeout(request.timer);
    if (reply.ok) request.resolve(reply.data);
    else request.reject(new Error(reply.error || '手机操作未完成，请重试。'));
  };
  bridge.onmessage = receive;

  const call = <T>(action: string, payload: object = {}, timeout = 30_000): Promise<T> => {
    if (disposed) return Promise.reject(new Error('应用页面已经关闭。'));
    const id = `next:${++sequence}`;
    return new Promise<T>((resolve, reject) => {
      const timer = timeout > 0 ? setTimeout(() => {
        pending.delete(id);
        reject(new Error('手机暂时没有响应，请重试。'));
      }, timeout) : undefined;
      pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      try { bridge.postMessage(JSON.stringify({ id, action, payload })); }
      catch {
        pending.delete(id);
        clearTimeout(timer);
        reject(new Error('无法连接手机功能，请重新打开应用。'));
      }
    });
  };

  const ready: Promise<PlatformCapabilities> = call<Record<string, unknown>>('capabilities', {}, 10_000)
    .then(value => ({
      calendar: value.calendar === true,
      fileSave: value.fileSave === true,
      shareText: value.shareText === true,
      localReminders: value.localReminders === true,
      theme: readTheme(value.theme),
    }));

  const share = () => { for (const listener of shareListeners) listener(); };
  const openNotice = () => { for (const listener of noticeListeners) listener(); };
  const back = (event: Event) => {
    for (const listener of [...backListeners].reverse()) {
      if (listener()) { event.preventDefault(); break; }
    }
  };
  window.addEventListener('campus-native-share', share);
  window.addEventListener('campus-native-back', back);
  window.addEventListener('campus-native-open-notice', openNotice);

  const api: PlatformAPI = {
    kind: 'android', ready,
    async getSharedText() {
      if (!(await ready).shareText) return null;
      const value = await call<{ text: string | null }>('consumeShare');
      return typeof value.text === 'string' ? value.text : null;
    },
    onShare(listener) {
      shareListeners.add(listener);
      return () => shareListeners.delete(listener);
    },
    onBack(listener) {
      backListeners.add(listener);
      return () => backListeners.delete(listener);
    },
    async getOpenedNotice() {
      if (!(await ready).localReminders) return null;
      return (await call<{ id: string | null }>('consumeOpenedNotice')).id;
    },
    onOpenNotice(listener) {
      noticeListeners.add(listener);
      return () => noticeListeners.delete(listener);
    },
    async saveFile(blob, name): Promise<SaveResult> {
      if (!(await ready).fileSave) throw new Error('当前手机无法保存文件，请更新 Android System WebView 后重试。');
      if (saving) throw new Error('请先完成当前的文件保存。');
      saving = true;
      let token: string | undefined;
      try {
        const begin = await call<{ token: string }>('saveBegin', { name, mime: blob.type || 'application/octet-stream', size: blob.size });
        token = begin.token;
        const chunkSize = 192 * 1024;
        for (let offset = 0; offset < blob.size; offset += chunkSize) {
          const bytes = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer());
          await call('saveChunk', { token, base64: base64(bytes) });
        }
        // The user can take as long as needed in the system file picker.
        return await call<{ status: 'saved' | 'cancelled' }>('saveFinish', { token }, 0);
      } catch (error) {
        if (token) await call('saveCancel', { token }).catch(() => {});
        throw error;
      } finally { saving = false; }
    },
    async openCalendar(event): Promise<CalendarResult> {
      if (!(await ready).calendar) {
        const result = await api.saveFile(calendarFile(event), '校园通知.ics');
        return { status: result.status === 'cancelled' ? 'cancelled' : 'downloaded', saved: false };
      }
      await call('calendar', event);
      return { status: 'opened', saved: false };
    },
    async scheduleReminder(reminder) {
      if (!(await ready).localReminders) return { status: 'unsupported', approximate: true };
      return await call('scheduleReminder', reminder, 0);
    },
    async cancelReminder(id) {
      if ((await ready).localReminders) await call('cancelReminder', { id });
    },
    dispose() {
      disposed = true;
      window.removeEventListener('campus-native-share', share);
      window.removeEventListener('campus-native-back', back);
      window.removeEventListener('campus-native-open-notice', openNotice);
      shareListeners.clear();
      backListeners.clear();
      noticeListeners.clear();
      if (bridge.onmessage === receive) bridge.onmessage = null;
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error('应用页面已经关闭。'));
      }
      pending.clear();
    },
  };
  return api;
}
