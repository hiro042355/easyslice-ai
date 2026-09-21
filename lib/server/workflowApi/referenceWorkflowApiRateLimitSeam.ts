export type WorkflowApiRateLimitDecision={allowed:true}|{allowed:false;retryAfterClass:"short"|"medium"|"long"};
export type WorkflowApiRateLimitSeam={check(input:{routeId:string;command:string;operation?:string}):Promise<WorkflowApiRateLimitDecision>};
export const referenceWorkflowApiRateLimitSeam:WorkflowApiRateLimitSeam=Object.freeze({async check(){return{allowed:true}}});
