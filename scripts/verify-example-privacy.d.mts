export interface ExamplePrivacyFinding {path:string;category:string}
export function canonicalExample(value:unknown):unknown;
export function publicExampleHash(value:unknown):string;
export function auditPublicExampleText(value:string,path:string,approvedPseudonyms?:string[]):ExamplePrivacyFinding[];
export function auditPublicExamples(backup:unknown,provenance:unknown):ExamplePrivacyFinding[];
export function auditModelTests(dataset:unknown):ExamplePrivacyFinding[];
