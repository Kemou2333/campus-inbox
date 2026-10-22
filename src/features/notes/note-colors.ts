import type {NoteColor} from '../../domain/types';

export const noteColorOptions:[NoteColor,string][]=[['plain','默认'],['sand','暖杏'],['rose','柔粉'],['mint','薄荷'],['sky','晴蓝'],['lavender','淡紫']];
interface NoteAppearance {paper:string;border:string;ink:string;accent:string}
const colors:Record<NoteColor,{light:NoteAppearance;dark:NoteAppearance}>={
 plain:{light:{paper:'#F6F8F8',border:'#DCE3E3',ink:'#334749',accent:'#5E787B'},dark:{paper:'#222C38',border:'#3B4859',ink:'#E3EAF1',accent:'#A9BDC9'}},
 sand:{light:{paper:'#FFF7E8',border:'#EEDBB5',ink:'#634D2D',accent:'#A67A36'},dark:{paper:'#372F25',border:'#69563B',ink:'#F1DFBF',accent:'#DDBB7A'}},
 rose:{light:{paper:'#FFF1F4',border:'#EDD0D9',ink:'#794558',accent:'#B66A83'},dark:{paper:'#382A33',border:'#694657',ink:'#F3D7E0',accent:'#DDA6BA'}},
 mint:{light:{paper:'#EDF8F1',border:'#CDE4D6',ink:'#365F49',accent:'#5C9471'},dark:{paper:'#24372F',border:'#436450',ink:'#D6ECDD',accent:'#A0CCAD'}},
 sky:{light:{paper:'#EFF6FF',border:'#CDDEF2',ink:'#385C83',accent:'#638FBE'},dark:{paper:'#263548',border:'#465F7E',ink:'#D8E7FA',accent:'#A8C7EB'}},
 lavender:{light:{paper:'#F5F1FD',border:'#DDD2EE',ink:'#62507F',accent:'#9479B8'},dark:{paper:'#312D42',border:'#61557E',ink:'#E7DFF7',accent:'#C3AEE3'}},
};
/** Only named colors reach UI styles; arbitrary stored CSS is never used. */
export function noteAppearance(color:NoteColor|undefined,dark=false):NoteAppearance{
 const palette=colors[color??'plain']??colors.plain;return dark?palette.dark:palette.light;
}
