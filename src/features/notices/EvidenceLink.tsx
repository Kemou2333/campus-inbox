import {IconButton,Tooltip} from '@mui/material';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import type {Notice} from '../../domain/types';
import {evidenceFor} from '../../domain/source-evidence';
import {textField} from '../../domain/corrections';

/** Original links stay small. A blue link means a valid paragraph ID, not verified semantics. */
export function EvidenceLink({notice,path,onOpen}:{notice:Notice;path:string;onOpen:(notice:Notice,path:string)=>void}){
 const evidence=evidenceFor(notice,path),label=textField(notice,path)?.label??'内容';
 if(!evidence.segments.length)return null;
 const hint=evidence.edited?'原 AI 出处；人工修改后请重新核对':'出处由 AI 关联，请核对';
 return <Tooltip title={hint}><IconButton className="evidence-link" size="small" aria-label={`查看出处：${label}`} onClick={()=>onOpen(notice,path)} sx={{display:'inline-flex',verticalAlign:'middle',ml:.25,p:.5,width:32,height:32,minWidth:32,flexShrink:0,color:evidence.edited?'warning.main':'primary.main'}}><LinkOutlined sx={{fontSize:17}}/></IconButton></Tooltip>;
}
