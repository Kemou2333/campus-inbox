import {expect,it} from 'vitest';
import {noticeSwipeAction} from '../src/features/notices/swipe-action';

it('commits deliberate horizontal gestures while preserving taps and vertical scrolling',()=>{
 expect(noticeSwipeAction(15,2,360)).toBeNull();
 expect(noticeSwipeAction(120,100,360)).toBeNull();
 expect(noticeSwipeAction(107,0,360)).toBeNull();
 expect(noticeSwipeAction(108,10,360)).toBe('complete');
 expect(noticeSwipeAction(-108,10,360)).toBe('delete');
 expect(noticeSwipeAction(139,0,760)).toBeNull();
 expect(noticeSwipeAction(-140,0,760)).toBe('delete');
});
