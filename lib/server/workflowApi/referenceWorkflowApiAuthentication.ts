// Server-only fixture authentication. This is explicitly not a production authentication provider.
import type { WorkflowApiPrincipal } from "@/lib/workflowApi/types";
import { copy } from "@/lib/workflowApi/workflowApiUtils";
const principal:WorkflowApiPrincipal=Object.freeze({principalVersion:"1.0",actorType:"service",subjectRef:"reference-route-service",tenantRef:"reference-tenant",region:"reference-region",permissions:Object.freeze(["workflow:start","workflow:poll-upload","workflow:poll-generation","workflow:result","workflow:cancel"] as const)});
export type ReferenceWorkflowApiAuthentication={authenticate():{status:"authenticated";principal:WorkflowApiPrincipal}};
export const referenceWorkflowApiAuthentication:ReferenceWorkflowApiAuthentication=Object.freeze({authenticate:()=>({status:"authenticated" as const,principal:copy(principal)})});
