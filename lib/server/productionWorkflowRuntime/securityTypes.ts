import type { ProductionWorkflowOperation, WorkflowProtectedIdentity } from "./types";
import type { ProductionAuthSessionStore, ProductionCsrfStore } from "./storeTypes";

export type ProductionWorkflowPrincipal = Readonly<{
  principalVersion: "1.0";
  subjectIdentity: WorkflowProtectedIdentity;
  tenantIdentity: WorkflowProtectedIdentity;
  region: string;
  permissionClasses: readonly string[];
  mfaClass: string;
}>;

export type ProductionAuthenticationAdapter = Readonly<{
  adapterVersion: "1.0";
  authenticate(sessionIdentity: WorkflowProtectedIdentity): Promise<Readonly<{ status: "authenticated"; principal: ProductionWorkflowPrincipal }> | Readonly<{ status: "unauthenticated" | "revoked" | "expired" | "unavailable" }>>;
}>;

export type ProductionAuthorizationRequest = Readonly<{
  requestVersion: "1.0";
  command: "start" | "poll-upload" | "poll-generation" | "result" | "cancel" | "asset-delivery";
  operation: ProductionWorkflowOperation;
  principal: ProductionWorkflowPrincipal;
  resourceIdentity?: WorkflowProtectedIdentity;
}>;

export type ProductionAuthorizationProjector = Readonly<{
  projectorVersion: "1.0";
  authorize(request: ProductionAuthorizationRequest): Promise<Readonly<{ status: "authorized"; authorizationIdentity: WorkflowProtectedIdentity }> | Readonly<{ status: "unauthorized" | "deleted" | "legal-hold" | "billing-denied" | "unavailable" }>>;
}>;

export type ProductionWorkflowSecurityRuntime = Readonly<{
  runtimeVersion: "1.0";
  authentication: ProductionAuthenticationAdapter;
  authorization: ProductionAuthorizationProjector;
  authSessions: ProductionAuthSessionStore;
  csrf: ProductionCsrfStore;
}>;
