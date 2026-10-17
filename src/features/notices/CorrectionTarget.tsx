import {createContext,useContext,type KeyboardEvent,type MouseEvent,type ReactNode} from 'react';
import {Box} from '@mui/material';
import {alpha} from '@mui/material/styles';

const CorrectionContext=createContext<{editing:boolean;onEdit:(path:string)=>void}>({editing:false,onEdit:()=>{}});
export const CorrectionProvider=CorrectionContext.Provider;

/** The path belongs to the persisted AI record, never to a shortened reading label. */
export function CorrectionTarget({path,label,children,inline=false}:{path:string;label:string;children:ReactNode;inline?:boolean}){
 const {editing,onEdit}=useContext(CorrectionContext);
 if(!editing)return <>{children}</>;
 const edit=()=>onEdit(path);
 return <Box component={inline?'span':'div'} role="button" tabIndex={0} className="correction-target" data-correction-path={path} aria-label={`修改${label}`} onClick={(event:MouseEvent<HTMLElement>)=>{event.stopPropagation();edit();}} onKeyDown={(event:KeyboardEvent<HTMLElement>)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();edit();}}} sx={{display:inline?'inline-block':'block',minWidth:0,cursor:'pointer',border:'1px dashed',borderColor:'primary.main',borderRadius:1,px:.65,py:.35,mx:-.65,bgcolor:theme=>alpha(theme.palette.primary.main,.045),transition:'background-color 180ms ease','&:hover,&:focus-visible':{bgcolor:theme=>alpha(theme.palette.primary.main,.13),outline:'2px solid',outlineColor:'primary.main',outlineOffset:2},'& a':{pointerEvents:'none'}}}>{children}</Box>;
}
