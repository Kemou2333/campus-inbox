export function markdownLiteralURL(value:string):string;
export function safeMarkdownURL(value:string,literal?:string|null):string;
type MarkdownURLNode={type?:string;tagName?:string;value?:string;position?:{start?:{offset?:number};end?:{offset?:number}};children?:readonly MarkdownURLNode[]};
export function literalMarkdownLabel(node:MarkdownURLNode|undefined,text:string):string|null;
