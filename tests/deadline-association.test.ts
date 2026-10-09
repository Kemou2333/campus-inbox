import {describe,expect,test} from 'vitest';
import {createNotice,effectiveDeadline,priority,taskDeadline} from '../src/domain/notice';
import type {NoticeAnalysis} from '../src/domain/types';

const due='2026-06-01T15:00:00';
const globalText='报名截止时间：2026年6月1日15:00';
const taskText='报名截止时间之前（2026年6月1日15:00前）';
function record(raw=taskText,deadline:string|null=due){
  const input:NoticeAnalysis={schemaVersion:4,kind:'task',title:'赛事报名',summary:'参赛同学按通知报名。',deadline,deadlineText:globalText,timeline:[],materials:[],warnings:[],reminders:[],tasks:[{text:'加入赛事QQ群',assignee:null,scope:'conditional',condition:'报名参赛的同学',details:[],steps:[],time:null,timeText:raw,location:null,timeSpec:{type:'unknown',year:null,month:null,day:null,hour:null,minute:null,rawText:raw}}]};
  return createNotice(input,'报名截止时间：2026年6月1日15:00；报名截止时间之前加入赛事QQ群。');
}

describe('task phrasing and known global deadline association',()=>{
  test('real low-output phrasing keeps priority despite a null task ISO and unknown task Spec',()=>{
    const n=record(),before=structuredClone(n);
    expect(taskDeadline(n,n.tasks[0])).toBe(due);expect(effectiveDeadline(n)).toBe(due);
    expect(priority(n,Date.parse('2026-06-01T16:00:00')).level).toBe('overdue');
    // CalendarDialog consumes these same due helpers, so its date/time can
    // now prefill without editing the model text or its unknown Spec.
    expect(n).toEqual(before);expect(n.tasks[0].time).toBeNull();expect(n.tasks[0].timeSpec?.type).toBe('unknown');
  });
  test.each(['6月1日15:00前','今天15:00前','明天中午前','2026年6月2日15:00前','2026年6月1日16:00前','2026年6月1日15:00活动开始','2026年6月1日14:00至15:00前','每年2026年6月1日15:00前'])('does not borrow the global deadline for %s',raw=>{
    const n=record(raw);expect(taskDeadline(n,n.tasks[0])).toBeNull();expect(effectiveDeadline(n)).toBeNull();
  });
  test('an event ISO stays an event even when its clock equals the registration deadline',()=>{
    const n=record('2026年6月1日15:00活动开始');n.tasks[0].time=due;
    expect(taskDeadline(n,n.tasks[0])).toBeNull();expect(effectiveDeadline(n)).toBeNull();
  });
  test('a complete task timestamp cannot create an absent global deadline or guess its timezone',()=>{
    const absent=record(taskText,null);expect(taskDeadline(absent,absent.tasks[0])).toBeNull();
    const utc=record(taskText,due+'Z');expect(taskDeadline(utc,utc.tasks[0])).toBeNull();
  });
  test('midnight uses the existing explicit 24:00 conversion for exact deadline association',()=>{
    const n=record('请在2026年6月1日24:00前提交','2026-06-02T00:00:00');n.deadlineText='2026年6月1日24:00截止';
    expect(taskDeadline(n,n.tasks[0])).toBe('2026-06-02T00:00:00');
  });
  test('completing or excluding the associated task stops urgency for undated remaining tasks',()=>{
    const n=record();n.tasks.push({...n.tasks[0],id:'undated-task',timeText:'后续安排等待群内通知',timeSpec:undefined});
    n.tasks[0].completed=true;expect(effectiveDeadline(n)).toBeNull();
    n.tasks[0].completed=false;n.tasks[0].dismissed=true;expect(effectiveDeadline(n)).toBeNull();
  });
  test('personal deadlines and explicit separate task deadlines retain their existing precedence',()=>{
    const n=record('活动开始：2026年6月1日15:00');n.localDeadline='2026-06-03T12:00:00';
    expect(taskDeadline(n,n.tasks[0])).toBe(n.localDeadline);
    n.tasks[0].localDeadline='2026-06-02T12:00:00';expect(taskDeadline(n,n.tasks[0])).toBe(n.tasks[0].localDeadline);
    n.localDeadline=null;n.tasks[0].localDeadline=null;n.tasks[0].time='2026-06-01T14:00:00';n.tasks[0].timeText='2026年6月1日14:00截止';
    expect(taskDeadline(n,n.tasks[0])).toBe(n.tasks[0].time);
  });
});
