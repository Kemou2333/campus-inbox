/** Layout-only fallback for old cached plain answers. Never summarize or drop facts. */
export function readableQuestionAnswer(text:string):string {
 const value=text.trim();
 if(value.length<80||/\n\s*\n|(^|\n)\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s)|\*\*/.test(value))return value;
 return value.replace(/([。！？；])(?=\S)/g,'$1\n\n');
}
