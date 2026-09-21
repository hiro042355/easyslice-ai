import type { WorkflowApiDescriptor,WorkflowApiRegistry } from "./types";
import { copy } from "./workflowApiUtils";
const operations=["generate-vocal","generate-music","generate-mv"] as const;
const records:readonly WorkflowApiDescriptor[]=Object.freeze([
  {routeId:"reference-workflow-start-v1",command:"start",path:"/api/v1/workflows/start",idempotencySupported:true},
  {routeId:"reference-workflow-poll-upload-v1",command:"poll-upload",path:"/api/v1/workflows/poll-upload",idempotencySupported:true},
  {routeId:"reference-workflow-poll-generation-v1",command:"poll-generation",path:"/api/v1/workflows/poll-generation",idempotencySupported:true},
  {routeId:"reference-workflow-result-v1",command:"result",path:"/api/v1/workflows/result",idempotencySupported:true},
  {routeId:"reference-workflow-cancel-v1",command:"cancel",path:"/api/v1/workflows/cancel",idempotencySupported:true},
].map(x=>Object.freeze({descriptorVersion:"1.0",method:"POST",requestVersion:"1.0",responseVersion:"1.0",supportedOperations:operations,authenticationRequired:true,availability:"available",runtimeScope:"single-process-reference",...x} as WorkflowApiDescriptor)));
export function createWorkflowApiRegistry():WorkflowApiRegistry{return Object.freeze({list:()=>copy(records),get:(routeId:string)=>{const value=records.find(x=>x.routeId===routeId);return value?copy(value):undefined}})}
export const workflowApiRegistry=createWorkflowApiRegistry();
