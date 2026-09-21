import { handleReferenceWorkflowApiRoute } from "@/lib/server/workflowApi/referenceWorkflowApiRouteUtils";
export const runtime="nodejs";
export async function POST(request:Request){return handleReferenceWorkflowApiRoute(request,{routeId:"reference-workflow-start-v1",command:"start"})}
