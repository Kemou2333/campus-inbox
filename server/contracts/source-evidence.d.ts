export interface SourceSegment {index:number;start:number;end:number;text:string}
export function segmentSource(value:string):SourceSegment[];
export function evidencePaths(analysis:unknown):string[];
export function requiredEvidencePaths(analysis:unknown):string[];
export function parseSourceRefs(value:unknown,analysis:unknown,sourceText?:string):Record<string,number[]>|undefined;
export function parseCorrections(value:unknown,analysis:unknown):{updatedAt:string;values:{path:string;value:string}[]}|undefined;
