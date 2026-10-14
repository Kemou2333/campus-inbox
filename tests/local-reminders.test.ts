import {describe,expect,it} from 'vitest';
import {localReminderID} from '../src/domain/reminders';

describe('local reminder identities',()=>{
 it('keeps legacy notice alarms stable and gives each task a separate identity',()=>{
  expect(localReminderID('notice-a')).toBe('notice-a');
  const ids=[localReminderID('notice-a','task-a'),localReminderID('notice-a','task-b'),localReminderID('notice-b','task-a')];
  expect(new Set(ids).size).toBe(3);expect(ids).not.toContain('notice-a');
 });
 it('keeps the longest allowed saved notice and task IDs within the native alarm limit',()=>{
  const value=localReminderID('n'.repeat(150),'t'.repeat(150));expect(value.length).toBe(308);expect(value.length).toBeLessThanOrEqual(320);
 });
});
