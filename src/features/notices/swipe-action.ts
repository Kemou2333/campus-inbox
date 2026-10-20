/** A deliberate horizontal gesture; short taps and mostly vertical scrolling never commit. */
export function noticeSwipeAction(dx:number,dy:number,width:number):'complete'|'delete'|null{
 if(Math.abs(dx)<Math.max(92,Math.min(140,width*.3))||Math.abs(dx)<Math.abs(dy)*1.6)return null;
 return dx>0?'complete':'delete';
}
