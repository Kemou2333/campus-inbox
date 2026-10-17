import type {Notice} from '../../domain/types';
import {restoreAIContent,setCorrections,textField} from '../../domain/corrections';
import {parseNotice} from '../../domain/notice';

/** Edit exactly one field while keeping every other correction and the AI/source record. */
export function applyFieldCorrection(current:Notice,snapshot:Notice,path:string,value:string):Notice{
 if(JSON.stringify(parseNotice(current))!==JSON.stringify(parseNotice(snapshot)))throw new Error('通知已更新，请重新打开这处修改。');
 const field=textField(current,path);if(!field)throw new Error('这处内容暂时不能修改。');
 const values=current.corrections?.values.filter(item=>item.path!==path)??[];
 if(value!==field.value)values.push({path,value});
 return values.length?setCorrections(current,values):restoreAIContent(current);
}
