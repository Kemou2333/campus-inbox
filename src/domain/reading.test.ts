import {describe, expect, it} from 'vitest';
import {plainReadingText} from './reading';

describe('reading text outside the app', () => {
  it('keeps emphasis readable in calendars and system alerts', () => {
    expect(plainReadingText('通过**智慧学工**提交 __请假申请__；*家长*发送短信。'))
      .toBe('通过智慧学工提交 请假申请；家长发送短信。');
  });
  it('preserves plain identifiers, URLs, timestamps and incomplete emphasis', () => {
    const plain='user_name_id https://example.com/a_b_c 10月7日17:00 **未闭合';
    expect(plainReadingText(plain)).toBe(plain);
  });
});
