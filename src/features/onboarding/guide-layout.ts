export type GuideRect={x:number;y:number;width:number;height:number};

export function guideLayout(viewport:{width:number;height:number},context:GuideRect,target:GuideRect|null,panelHeight:number){
 const margin=12,panelWidth=Math.min(320,viewport.width-margin*2),gap=18;
 const right=viewport.width-(context.x+context.width),left=context.x;
 const side=viewport.width>=900&&(right>=panelWidth+gap||left>=panelWidth+gap);
 const panelX=side?(right>=panelWidth+gap?Math.min(viewport.width-panelWidth-margin,context.x+context.width+gap):Math.max(margin,context.x-panelWidth-gap)):Math.max(margin,(viewport.width-panelWidth)/2);
 const panelY=side?Math.max(margin,Math.min(viewport.height-panelHeight-margin,context.y)):Math.max(margin,viewport.height-panelHeight-margin);
 const availableBottom=side?viewport.height-margin:panelY-gap;
 const x=Math.max(6,context.x-7),y=Math.max(68,context.y-7),bottom=Math.max(y,Math.min(availableBottom,context.y+context.height+7));
 const focus={x,y,width:Math.max(0,Math.min(viewport.width-6,context.x+context.width+7)-x),height:Math.max(0,bottom-y)};
 const control=target?{x:Math.max(6,target.x-4),y:Math.max(6,target.y-4),width:Math.min(viewport.width-12,target.width+8),height:target.height+8}:null;
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
