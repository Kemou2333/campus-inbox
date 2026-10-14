import {useEffect,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Stack,TextField,Typography} from '@mui/material';
import type {Notice} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {noticeTextFields,restoreAIContent,setCorrections} from '../../domain/corrections';

export interface CorrectionSelection {noticeID:string;path?:string}
export function CorrectionDialog({notice,path,app,onClose}:{notice:Notice|null;path?:string;app:CampusController;onClose:()=>void}){
 const [selected,setSelected]=useState('title'),[values,setValues]=useState<Record<string,string>>({}),[error,setError]=useState(''),[startedAt,setStartedAt]=useState('');
 useEffect(()=>{if(!notice)return;setSelected(noticeTextFields(notice).some(f=>f.path===path)?path!:'title');setValues(Object.fromEntries(notice.corrections?.values.map(v=>[v.path,v.value])??[]));setStartedAt(notice.updatedAt);setError('');},[notice?.id,path]);
 const fields=notice?noticeTextFields(notice):[],field=fields.find(f=>f.path===selected),content=field?values[field.path]??field.value:'';
 function save(){if(!notice)return;try{
  const staged=Object.entries(values).filter(([path,value])=>fields.find(f=>f.path===path)?.value!==value).map(([path,value])=>({path,value}));
  setCorrections(notice,staged);
  const result=app.update(notice.id,current=>{if(current.updatedAt!==startedAt)throw new Error('这条通知已更新，请关闭后重新编辑，避免覆盖其他设备的修改。');return staged.length?setCorrections(current,staged):restoreAIContent(current);});
  if(result){app.tell('已保存人工修正',()=>app.act(notice.id,current=>{if(JSON.stringify(current)!==JSON.stringify(result.after))throw new Error('通知已有新修改，无法撤销旧操作。');return {...result.before,updatedAt:new Date().toISOString()};},'已撤销'));onClose();}
 }catch(e){setError(e instanceof Error?e.message:'修正未保存');}}
 return <Dialog open={!!notice} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>修正整理结果</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:.5}}>
  <Alert severity="info">原文和 AI 初稿会保留。这里只保存你的修正，无需再次调用 AI。</Alert>
  {!!error&&<Alert severity="error">{error}</Alert>}
  <TextField select label="修改位置" value={selected} onChange={e=>setSelected(e.target.value)}>{fields.map(f=><MenuItem key={f.path} value={f.path}>{f.label}</MenuItem>)}</TextField>
  {field?.choices?<TextField select label="适用范围" value={content} onChange={e=>setValues(current=>({...current,[field.path]:e.target.value}))}>{field.choices.map(choice=><MenuItem key={choice.value} value={choice.value}>{choice.label}</MenuItem>)}</TextField>:<TextField label="内容" value={content} multiline minRows={3} maxRows={10} onChange={e=>field&&setValues(current=>({...current,[field.path]:e.target.value}))} helperText={field?`${content.length}/${field.max}`:undefined} error={!!field&&content.length>field.max}/>}
  {field&&<Box sx={{borderLeft:'2px solid',borderColor:'divider',pl:1.5}}><Typography variant="body2" color="text.secondary">AI 初稿</Typography><Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:14,mt:.5}}>{field.value||'空'}</Typography></Box>}
  <Typography variant="body2" color="text.secondary">完成状态、笔记、附件及你设置的提醒时间会保留。</Typography>
 </Stack></DialogContent><DialogActions sx={{flexWrap:'wrap',gap:.5}}>{notice?.corrections?.values.length&&<Button color="warning" onClick={()=>{app.act(notice.id,restoreAIContent,'已恢复 AI 初稿');onClose();}}>恢复初稿</Button>}<Button onClick={onClose}>取消</Button><Button variant="contained" onClick={save}>保存</Button></DialogActions></Dialog>;
}
