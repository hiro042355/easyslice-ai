import { durableTransactionFailure, durableTransactionSuccess } from "../durableTransaction";
import type { DurableWorkflowTransactionContext, DurableWorkflowTransactionOperationResult } from "../durableTransaction";
import type { ObservationStore, ReconciliationAtomicInput, ReconciliationOutboxStore, ReconciliationRequestStore, ResolutionStore } from "./types";

export type ReconciliationAtomicTransitionResult = Readonly<{status:"committed";requestRevision:string}> | Readonly<{status:"conflict"|"corrupted"|"unavailable"}>;
export function createPostgreSQLReconciliationAtomicTransition(stores:Readonly<{requests:ReconciliationRequestStore;observations:ObservationStore;resolutions:ResolutionStore;outbox:ReconciliationOutboxStore}>){
  return Object.freeze({transitionVersion:"1.0" as const,async commit(context:DurableWorkflowTransactionContext,input:ReconciliationAtomicInput):Promise<DurableWorkflowTransactionOperationResult<ReconciliationAtomicTransitionResult>>{
    const observation=await stores.observations.appendIfAbsent(context,input.observation);if(!["created","replayed"].includes(observation.status))return durableTransactionFailure(observation.status==="unavailable"?"unavailable":"transaction-aborted");
    const request=await stores.requests.transition(context,input.requestIdentity,input.expectedRevision,input.authority,input.nextState,input.resolution?.resolutionClass);if(request.status!=="updated")return durableTransactionFailure(request.status==="unavailable"?"unavailable":"retryable-conflict");
    if(input.resolution){const resolution=await stores.resolutions.appendIfAbsent(context,input.resolution);if(!["created","replayed"].includes(resolution.status))return durableTransactionFailure(resolution.status==="unavailable"?"unavailable":"transaction-aborted");}
    if(input.outbox){const event=await stores.outbox.appendIfAbsent(context,input.outbox);if(!["created","replayed"].includes(event.status))return durableTransactionFailure(event.status==="unavailable"?"unavailable":"transaction-aborted");}
    return durableTransactionSuccess(Object.freeze({status:"committed",requestRevision:request.record.revision}));
  }});
}
