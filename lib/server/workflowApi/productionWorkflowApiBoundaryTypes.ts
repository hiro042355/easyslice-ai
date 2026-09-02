import type { AuthenticatedContext } from "@/lib/server/productionIdentity/types";
import type {
  WorkflowApiCommand,
  WorkflowApiErrorCode,
  WorkflowApiPermission,
  WorkflowApiPrincipal,
  WorkflowApiRequest,
} from "@/lib/workflowApi/types";

export type ProductionWorkflowPolicyResolution<T> =
  | Readonly<{ status: "resolved"; value: T }>
  | Readonly<{ status: "unresolved" }>;

export type ProductionWorkflowPrincipalPolicy = Readonly<{
  resolveTenant(context: AuthenticatedContext): Promise<ProductionWorkflowPolicyResolution<string>>;
  resolveRegion(context: AuthenticatedContext): Promise<ProductionWorkflowPolicyResolution<string>>;
  resolvePermissions(
    context: AuthenticatedContext,
    command: WorkflowApiCommand,
  ): Promise<ProductionWorkflowPolicyResolution<readonly WorkflowApiPermission[]>>;
}>;

export type ProductionWorkflowPrincipalProjectionResult =
  | Readonly<{ status: "projected"; principal: WorkflowApiPrincipal }>
  | Readonly<{ status: "unauthorized" }>;

export type ProductionWorkflowApiBoundaryFailure = Readonly<{
  status: "rejected";
  statusCode: 400 | 401 | 403 | 413 | 415 | 422 | 500;
  code: Extract<
    WorkflowApiErrorCode,
    "request-invalid" | "request-version-unsupported" | "operation-unsupported" | "unauthenticated" | "unauthorized" | "internal-error"
  >;
}>;

export type ProductionWorkflowApiRequestAcceptance = Readonly<{
  status: "accepted";
  bytes: number;
  idempotencyKey: string;
  request: WorkflowApiRequest;
}>;

export type ProductionWorkflowApiRequestBoundaryResult =
  | ProductionWorkflowApiRequestAcceptance
  | ProductionWorkflowApiBoundaryFailure;
