export type GuideRect={x:number;y:number;width:number;height:number};

export function guideLayout(viewport:{width:number;height:number;top?:number;bottom?:number},context:GuideRect,target:GuideRect|null,panelHeight:number){
 const margin=12,panelWidth=Math.min(320,viewport.width-margin*2),gap=18;
 const right=viewport.width-(context.x+context.width),left=context.x;
 const side=viewport.width>=900&&(right>=panelWidth+gap||left>=panelWidth+gap);
 const panelX=side?(right>=panelWidth+gap?Math.min(viewport.width-panelWidth-margin,context.x+context.width+gap):Math.max(margin,context.x-panelWidth-gap)):Math.max(margin,(viewport.width-panelWidth)/2);
 const panelY=side?Math.max(margin,Math.min(viewport.height-panelHeight-margin,context.y)):Math.max(margin,viewport.height-panelHeight-margin);
 const availableBottom=Math.min(viewport.bottom??viewport.height-margin,side?viewport.height-margin:panelY-gap);
 const top=Math.max(6,viewport.top??68);
 function clip(r:GuideRect,padding:number){
  const x=Math.max(6,Math.min(viewport.width-6,r.x-padding)),y=Math.max(top,Math.min(availableBottom,r.y-padding));
  return {x,y,width:Math.max(0,Math.min(viewport.width-6,r.x+r.width+padding)-x),height:Math.max(0,Math.min(availableBottom,r.y+r.height+padding)-y)};
 }
 const focus=clip(context,7),action=target?clip(target,4):null;
 const control=action&&action.width>0&&action.height>0?action:null;
 return {focus,control,panel:{x:panelX,y:panelY,width:panelWidth},availableBottom,side};
}

export type GuideLayout=ReturnType<typeof guideLayout>;

/** Only an intentional target change gets an offset. Live layout remains the base. */
export function guideRectOffset(from:GuideRect,to:GuideRect):GuideRect{
 return {x:from.x-to.x,y:from.y-to.y,width:from.width-to.width,height:from.height-to.height};
}

export function followGuideRect(measured:GuideRect,offset:GuideRect,remaining:number):GuideRect{
 return {x:measured.x+offset.x*remaining,y:measured.y+offset.y*remaining,
  width:Math.max(0,measured.width+offset.width*remaining),height:Math.max(0,measured.height+offset.height*remaining)};
}
