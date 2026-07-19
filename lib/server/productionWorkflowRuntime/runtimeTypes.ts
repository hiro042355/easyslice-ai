import type {
  ProductionWorkflowCoreRuntime,
  ProductionWorkflowRuntimeCapabilities,
  ProductionWorkflowRuntimeVersion,
} from "./types";
import type { WorkflowTransactionManager } from "./transactionTypes";
import type { ProductionWorkflowStoreBundle } from "./storeTypes";
import type { ProductionWorkflowProviderRuntime } from "./providerTypes";
import type { ProductionWorkflowSecurityRuntime } from "./securityTypes";
import type { ProductionWorkflowObservabilityRuntime } from "./observabilityTypes";
import type { ProductionWorkflowLifecycleRuntime } from "./lifecycleTypes";

export type ProductionWorkflowRuntime = Readonly<{
  runtimeVersion: ProductionWorkflowRuntimeVersion;
  capabilities: ProductionWorkflowRuntimeCapabilities;
  core: ProductionWorkflowCoreRuntime & Readonly<{ transactionManager: WorkflowTransactionManager }>;
  stores: ProductionWorkflowStoreBundle;
  providers: ProductionWorkflowProviderRuntime;
  security: ProductionWorkflowSecurityRuntime;
  observability: ProductionWorkflowObservabilityRuntime;
  lifecycle: ProductionWorkflowLifecycleRuntime;
}>;

export type ProductionWorkflowRuntimeValidationIssue =
  | "not-an-object"
  | "runtime-version-invalid"
  | "bundle-missing"
  | "bundle-version-invalid"
  | "duplicate-store-reference"
  | "required-capability-unavailable"
  | "transaction-manager-invalid"
  | "lifecycle-invalid"
  | "provider-runtime-invalid"
  | "store-bundle-invalid";

export type ProductionWorkflowRuntimeValidationResult =
  | Readonly<{ status: "valid"; runtime: ProductionWorkflowRuntime }>
  | Readonly<{ status: "invalid"; issues: readonly ProductionWorkflowRuntimeValidationIssue[] }>;
