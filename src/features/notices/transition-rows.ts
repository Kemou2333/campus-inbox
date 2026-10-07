export interface TransitionRow<T> {record:T;visible:boolean}

/** Keep a disappearing row beside its old neighbours until its exit finishes. */
export function transitionRows<T extends {id:string}>(previous:TransitionRow<T>[],records:T[]):TransitionRow<T>[] {
 const next=records.map(record=>({record,visible:true}));
 const present=new Set(records.map(record=>record.id));
 previous.forEach((row,index)=>{
  if(present.has(row.record.id))return;
  const anchor=previous.slice(index+1).find(candidate=>present.has(candidate.record.id));
  const position=anchor?next.findIndex(candidate=>candidate.record.id===anchor.record.id):-1;
  next.splice(position<0?next.length:position,0,{...row,visible:false});
 });
 return next;
}
