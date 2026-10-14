import {plainReadingText} from '../../domain/reading';

/** Labels are a reading aid. They never replace saved reminder content. New AI
 * titles are preferred; legacy labels use complete source headings or a topic. */
export function reminderReadingTitle(reminder:{text:string;title?:string},index:number):string{
 const title=plainReadingText(reminder.title??'').trim();if(title)return title;
 const text=plainReadingText(reminder.text).replace(/https?:\/\/\S+/g,'').trim();
 const first=text.split(/[，,；;。！？\n：:]/)[0]?.replace(/^(?:请)?(?:各位同学|同学们|大家)\s*/,'').trim()??'';
 if(first&&Array.from(first).length<=16&&!/^(?:附件\s*\d+|参考资料)$/.test(first))return first;
 for(const [pattern,label] of [
  [/期中|半期|中期测验/,'期中测验'],[/习题课/,'习题课'],[/成绩构成|计分规则|平时成绩/,'成绩构成'],
  [/二维码|扫码/,'扫码说明'],[/课程链接|官网|课程入口/,'课程入口'],[/学习资源|教学资源|参考资料/,'学习资源'],
  [/线上学习|视频观看|网课/,'线上学习'],[/作业|提交材料/,'提交要求'],
 ] as const){if(pattern.test(text))return label;}
 const second=text.split(/[：:]/)[1]?.trim();if(second&&Array.from(second).length<=16)return second;
 return `说明 ${index+1}`;
}
