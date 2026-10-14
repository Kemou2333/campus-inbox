import {IconButton,Tooltip} from '@mui/material';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import type {Notice} from '../../domain/types';
import {evidenceFor} from '../../domain/source-evidence';
import {textField} from '../../domain/corrections';

/** Original links stay small. A blue link means a valid paragraph ID, not verified semantics. */
export function EvidenceLink({notice,path,onOpen}:{notice:Notice;path:string;onOpen:(notice:Notice,path:string)=>void}){
 const evidence=evidenceFor(notice,path),label=textField(notice,path)?.label??'内容';
 const hint=evidence.edited?'人工修改；可对照原文':evidence.inferred?'可能相关：本机文字匹配，请核对':evidence.segments.length?'出处由 AI 关联，请核对':'尚未关联原文，可手动对照';
 return <Tooltip title={hint}><IconButton className="evidence-link" size="small" aria-label={`查看出处：${label}`} onClick={()=>onOpen(notice,path)} sx={{display:'inline-flex',verticalAlign:'middle',ml:.25,p:.5,width:32,height:32,minWidth:32,flexShrink:0,color:evidence.edited?'warning.main':evidence.segments.length?'primary.main':'text.disabled'}}><LinkOutlined sx={{fontSize:17}}/></IconButton></Tooltip>;
}
