import type { CalendarEvent, PlatformAPI, SaveResult } from './index';

function escapeCalendar(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n?|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/** RFC 5545 folds at 75 bytes, without cutting through a UTF-8 character. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  let output = '', part = '', bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      output += `${part}\r\n`;
      part = ' ';
      bytes = 1;
    }
    part += character;
    bytes += size;
  }
  return output + part;
}

function timestamp(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function dateOnly(milliseconds: number): string {
  const date = new Date(milliseconds);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

export function calendarFile(event: CalendarEvent): Blob {
  const start = event.startMillis;
  const end = event.endMillis ?? (event.allDay
    ? new Date(new Date(start).getFullYear(), new Date(start).getMonth(), new Date(start).getDate() + 1).getTime()
    : start + 3_600_000);
  if (!event.title.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('请先确认日历标题和完整时间。');
  }
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campus Inbox//Calendar//ZH',
    'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@campus-inbox`, `DTSTAMP:${timestamp(Date.now())}`,
    event.allDay ? `DTSTART;VALUE=DATE:${dateOnly(start)}` : `DTSTART:${timestamp(start)}`,
    event.allDay ? `DTEND;VALUE=DATE:${dateOnly(end)}` : `DTEND:${timestamp(end)}`,
    `SUMMARY:${escapeCalendar(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeCalendar(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeCalendar(event.location)}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return new Blob([lines.map(foldLine).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
}

export async function downloadFile(blob: Blob, name: string): Promise<SaveResult> {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // A download may start after the click event has returned.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { status: 'downloaded' };
}

export function createBrowserPlatform(): PlatformAPI {
  return {
    kind: 'browser',
    ready: Promise.resolve({ calendar: false, fileSave: true, shareText: false, localReminders: false, theme: null }),
    getSharedText: async () => null,
    onShare: () => () => {},
    onBack: () => () => {},
    getOpenedNotice: async () => null,
    onOpenNotice: () => () => {},
    saveFile: downloadFile,
    async openCalendar(event) {
      await downloadFile(calendarFile(event), '校园通知.ics');
      return { status: 'downloaded', saved: false };
    },
    scheduleReminder: async () => ({ status: 'unsupported', approximate: true }),
    cancelReminder: async () => {},
    dispose() {},
  };
}
