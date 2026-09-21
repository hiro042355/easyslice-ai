// Server-only application-lifecycle composition. Create once per Reference application process, never once per request.
import type { ReferenceWorkflowIntegrationRuntime } from "@/lib/workflowEntry/types";
import type { ReferenceWorkflowScenario } from "@/lib/workflows/types";
import type { WorkflowApiOperation } from "@/lib/workflowApi/types";
import { createReferenceWorkflowApiRuntimeProviderFromRuntime } from "./referenceWorkflowApiRuntimeProvider";
import { createReferenceWorkflowApiAuthProjector } from "./referenceWorkflowApiAuthProjector";
import { createReferenceWorkflowApiIdempotencyStore } from "./referenceWorkflowApiIdempotencyStore";
import { createReferenceWorkflowApiReferenceVault } from "./referenceWorkflowApiReferenceVault";
import { createReferenceWorkflowApiDtoMapper } from "./referenceWorkflowApiDtoMapper";
import { createReferenceWorkflowApiErrorMapper } from "./referenceWorkflowApiErrorMapper";
import { createReferenceWorkflowApiService } from "./referenceWorkflowApiService";
export function createReferenceWorkflowApiFoundation(runtime:ReferenceWorkflowIntegrationRuntime,scenarios?:Partial<Record<WorkflowApiOperation,ReferenceWorkflowScenario>>){const runtimeProvider=createReferenceWorkflowApiRuntimeProviderFromRuntime(runtime),referenceVault=createReferenceWorkflowApiReferenceVault(),idempotencyStore=createReferenceWorkflowApiIdempotencyStore(),authProjector=createReferenceWorkflowApiAuthProjector(),dtoMapper=createReferenceWorkflowApiDtoMapper(referenceVault),errorMapper=createReferenceWorkflowApiErrorMapper(),service=createReferenceWorkflowApiService({runtimeProvider,referenceVault,idempotencyStore,authProjector,dtoMapper,errorMapper,scenarios});return Object.freeze({runtimeProvider,referenceVault,idempotencyStore,authProjector,dtoMapper,errorMapper,service})}
