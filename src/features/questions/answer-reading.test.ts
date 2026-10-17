import {expect,test} from 'vitest';
import {readableQuestionAnswer} from './answer-reading';
test('old plain cached answers get readable paragraphs without losing any content',()=>{
 const text='请在截止前到通知列出的平台申报，选择老师现有项目并组队，或者自拟题目联系导师并招募队友。未完成校级项目，原则上大二不能申报国家级或市级项目；其余后果原文没有说明。';
 const result=readableQuestionAnswer(text);expect(result).toContain('\n\n');expect(result.replace(/\n/g,'')).toBe(text);
});
test('short answers and existing Markdown sections keep their exact formatting',()=>{
 for(const text of ['原文未说明。','**现在要做**\n- 完成**评教**。\n\n**不做的影响**\n- 原文未说明。'])expect(readableQuestionAnswer(text)).toBe(text);
});
