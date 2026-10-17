import {useEffect,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Stack,TextField,Typography} from '@mui/material';
import type {Notice} from '../../domain/types';
import type {CampusController} from '../../app/useCampus';
import {textField} from '../../domain/corrections';
import {applyFieldCorrection} from './field-correction';

export interface CorrectionSelection {noticeID:string;path?:string}
export function CorrectionDialog({notice,path,app,onClose}:{notice:Notice|null;path?:string;app:CampusController;onClose:()=>void}){
 const [snapshot,setSnapshot]=useState<Notice|null>(null),[content,setContent]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(!notice||!path)return;setSnapshot(structuredClone(notice));const field=textField(notice,path);setContent(notice.corrections?.values.find(item=>item.path===path)?.value??field?.value??'');setError('');},[notice?.id,path]);
 const field=snapshot&&path?textField(snapshot,path):undefined;
 const invalid=!!field&&(content.length>field.max||!field.allowEmpty&&!content.trim());
 function save(){if(!snapshot||!path)return;try{
  applyFieldCorrection(snapshot,snapshot,path,content);
  const result=app.update(snapshot.id,current=>applyFieldCorrection(current,snapshot,path,content));
  if(!result){setError('未保存，请重新打开这处修改。');return;}
  app.tell('已修正',()=>app.act(snapshot.id,current=>{if(JSON.stringify(current)!==JSON.stringify(result.after))throw new Error('通知已有新修改，无法撤销。');return {...result.before,updatedAt:new Date().toISOString()};},'已撤销'));onClose();
 }catch(e){setError(e instanceof Error?e.message:'修正未保存');}}
 return <Dialog open={!!notice&&!!path} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>{field?.label?`修改${field.label}`:'修改内容'}</DialogTitle><DialogContent><Stack spacing={1.5} sx={{pt:.5}}>
  {!!error&&<Alert severity="error">{error}</Alert>}
  {field?.choices?<TextField select label="适用范围" value={content} onChange={e=>setContent(e.target.value)}>{field.choices.map(choice=><MenuItem key={choice.value} value={choice.value}>{choice.label}</MenuItem>)}</TextField>:<TextField autoFocus label="内容" value={content} multiline minRows={2} maxRows={10} onChange={e=>setContent(e.target.value)} helperText={field?`${content.length}/${field.max}`:undefined} error={invalid}/>}
  {field&&<Box component="details" sx={{color:'text.secondary',fontSize:14}}><Box component="summary" sx={{cursor:'pointer'}}>AI 初稿</Box><Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:14,mt:.75}}>{field.value||'空'}</Typography>{content!==field.value&&<Button size="small" onClick={()=>setContent(field.value)}>恢复这处</Button>}</Box>}
 </Stack></DialogContent><DialogActions><Button onClick={onClose}>取消</Button><Button variant="contained" disabled={!field||invalid} onClick={save}>保存</Button></DialogActions></Dialog>;
}
