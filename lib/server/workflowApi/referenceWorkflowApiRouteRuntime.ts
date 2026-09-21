// Reference-only process-local accessor. Durability and cross-process sharing are intentionally out of scope.
import { getReferenceWorkflowApiProcessRuntime } from "./referenceWorkflowApiProcessRuntime";

export const getReferenceWorkflowApiRouteRuntime = () =>
  getReferenceWorkflowApiProcessRuntime().apiFoundation;
