import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAndroidPlatform, type NativeBridge } from './android';
import { calendarFile } from './browser';

interface Request { id: string; action: string; payload: Record<string, unknown> }
function host(handler?: (request: Request) => unknown): { bridge: NativeBridge; requests: Request[] } {
  const requests: Request[] = [];
  const bridge: NativeBridge = {
    onmessage: null,
    postMessage(raw) {
      const request = JSON.parse(raw) as Request;
      requests.push(request);
      const data = handler?.(request) ?? ({ calendar: true, fileSave: true, shareText: true, localReminders: true });
      if (data === 'defer') return;
      queueMicrotask(() => bridge.onmessage?.({ data: JSON.stringify({ id: request.id, ok: true, data }) }));
    },
  };
  return { bridge, requests };
}

beforeEach(() => vi.stubGlobal('window', new EventTarget()));
afterEach(() => { vi.unstubAllGlobals(); });

describe('shared platform adapter', () => {
  it('consumes shared text without changing a draft or calling AI', async () => {
    const queue = ['第一条原文', '第二条原文'];
    const { bridge, requests } = host(request => request.action === 'consumeShare' ? { text: queue.shift() ?? null } : undefined);
    const api = createAndroidPlatform(bridge);
    await api.ready;
    expect(requests.map(value => value.action)).toEqual(['capabilities']);
    expect(await api.getSharedText()).toBe('第一条原文');
    expect(await api.getSharedText()).toBe('第二条原文');
    expect(await api.getSharedText()).toBeNull();
    expect(requests.every(value => ['capabilities', 'consumeShare'].includes(value.action))).toBe(true);
    api.dispose();
  });

  it('shares and Back are application events with unsubscribe support', async () => {
    const { bridge } = host();
    const api = createAndroidPlatform(bridge);
    await api.ready;
    const shared = vi.fn();
    const unsubscribe = api.onShare(shared);
    window.dispatchEvent(new Event('campus-native-share'));
    unsubscribe();
    window.dispatchEvent(new Event('campus-native-share'));
    expect(shared).toHaveBeenCalledTimes(1);
    const releaseBack = api.onBack(() => true);
    expect(window.dispatchEvent(new Event('campus-native-back', { cancelable: true }))).toBe(false);
    releaseBack();
    expect(window.dispatchEvent(new Event('campus-native-back', { cancelable: true }))).toBe(true);
    api.dispose();
  });

  it('transfers original binary bytes in bounded sequential chunks', async () => {
    const received: number[] = [];
    const { bridge, requests } = host(request => {
      if (request.action === 'saveBegin') return { token: 'one-file' };
      if (request.action === 'saveChunk') {
        const chunk = request.payload.base64 as string;
        expect(chunk.length).toBeLessThanOrEqual(262_144);
        const binary = atob(chunk);
        for (let i = 0; i < binary.length; i++) received.push(binary.charCodeAt(i));
        return { bytes: received.length };
      }
      if (request.action === 'saveFinish') return { status: 'saved' };
      return undefined;
    });
    const bytes = Uint8Array.from({ length: 500_123 }, (_value, index) => index % 251);
    const api = createAndroidPlatform(bridge);
    expect(await api.saveFile(new Blob([bytes]), '附件.bin')).toEqual({ status: 'saved' });
    expect(new Uint8Array(received)).toEqual(bytes);
    expect(requests.filter(value => value.action === 'saveChunk')).toHaveLength(3);
    api.dispose();
  });

  it('blocks competing save sessions and releases a waiting session on disposal', async () => {
    const { bridge } = host(request => {
      if (request.action === 'saveBegin') return { token: 'one-file' };
      if (request.action === 'saveFinish') return 'defer';
      return undefined;
    });
    const api = createAndroidPlatform(bridge);
    await api.ready;
    const pending = api.saveFile(new Blob(), '文件.json');
    await expect(api.saveFile(new Blob(), '另一文件.json')).rejects.toThrow('请先完成');
    const rejection = expect(pending).rejects.toThrow('页面已经关闭');
    api.dispose();
    await rejection;
  });

  it('reports a cancelled system save without claiming a file was saved', async () => {
    const { bridge } = host(request => {
      if (request.action === 'saveBegin') return { token: 'one-file' };
      if (request.action === 'saveFinish') return { status: 'cancelled' };
      return undefined;
    });
    const api = createAndroidPlatform(bridge);
    expect(await api.saveFile(new Blob(['备份']), '备份.json')).toEqual({ status: 'cancelled' });
    api.dispose();
  });

  it('calendar entry opens system confirmation without claiming it is saved', async () => {
    const { bridge, requests } = host();
    const api = createAndroidPlatform(bridge);
    const event = { title: '提交申请', startMillis: 1_791_347_400_000, description: '原文要求' };
    expect(await api.openCalendar(event)).toEqual({ status: 'opened', saved: false });
    expect(requests.find(value => value.action === 'calendar')?.payload).toEqual(event);
    api.dispose();
  });

  it('schedules only when requested, preserves denial and cancels by stable notice id', async () => {
    const { bridge, requests } = host(request => {
      if (request.action === 'scheduleReminder') return { status: 'permission-denied', approximate: true };
      if (request.action === 'cancelReminder') return { status: 'cancelled' };
      return undefined;
    });
    const api = createAndroidPlatform(bridge);
    await api.ready;
    expect(requests.map(value => value.action)).toEqual(['capabilities']);
    expect(await api.scheduleReminder({ id: 'notice-id', title: '办理申请', triggerMillis: Date.now() + 60_000 }))
      .toEqual({ status: 'permission-denied', approximate: true });
    await api.cancelReminder('notice-id');
    expect(requests.find(value => value.action === 'cancelReminder')?.payload).toEqual({ id: 'notice-id' });
    api.dispose();
  });

  it('a notification tap exposes its notice id as navigation, without changing records', async () => {
    const { bridge } = host(request => request.action === 'consumeOpenedNotice' ? { id: 'notice-id' } : undefined);
    const api = createAndroidPlatform(bridge);
    const listener = vi.fn();
    api.onOpenNotice(listener);
    window.dispatchEvent(new Event('campus-native-open-notice'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await api.getOpenedNotice()).toBe('notice-id');
    api.dispose();
  });

  it('without a calendar app, exports ICS through the native file picker', async () => {
    const { bridge, requests } = host(request => {
      if (request.action === 'capabilities') return { calendar: false, fileSave: true, shareText: false };
      if (request.action === 'saveBegin') return { token: 'calendar-file' };
      if (request.action === 'saveFinish') return { status: 'cancelled' };
      return {};
    });
    const api = createAndroidPlatform(bridge);
    expect(await api.openCalendar({ title: '提交申请', startMillis: 1_791_347_400_000 })).toEqual({ status: 'cancelled', saved: false });
    expect(requests.some(value => value.action === 'calendar')).toBe(false);
    expect(requests.some(value => value.action === 'saveFinish')).toBe(true);
    api.dispose();
  });

  it('calendar export escapes content, folds UTF-8 lines and preserves all-day dates', async () => {
    const text = await calendarFile({ title: '校园任务'.repeat(30) + ';逗号,换行\n',
      startMillis: new Date(2026, 9, 7).getTime(), allDay: true }).text();
    expect(text).toContain('DTSTART;VALUE=DATE:20261007');
    expect(text).toContain('DTEND;VALUE=DATE:20261008');
    expect(text).toContain('\\;逗号\\,换行\\n');
    for (const line of text.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
