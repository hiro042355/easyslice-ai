import type {
  ProductionWorkflowOperation,
  WorkflowProtectedIdentity,
  WorkflowUtcTimestamp,
} from "./types";

export type ProductionProviderBindingDescriptor = Readonly<{
  descriptorVersion: "1.0";
  bindingId: string;
  bindingVersion: string;
  operation: ProductionWorkflowOperation;
  providerId: string;
  providerApiVersion: string;
  materializerBindingId: string;
  clientBindingId: string;
  normalizerBindingId: string;
  ingestionPolicyBindingId: string;
  availability: "available" | "unavailable" | "degraded";
  regionClass: string;
  capabilityClass: string;
}>;

export type ProviderBindingRegistry = Readonly<{
  registryVersion: "1.0";
  get(operation: ProductionWorkflowOperation, bindingId: string, bindingVersion: string): ProductionProviderBindingDescriptor | undefined;
  list(): readonly ProductionProviderBindingDescriptor[];
}>;

export type CredentialResolutionRequest = Readonly<{
  requestVersion: "1.0";
  credentialHandle: WorkflowProtectedIdentity;
  providerId: string;
  scope: string;
  tenantIdentity: WorkflowProtectedIdentity;
  region: string;
  operation: ProductionWorkflowOperation;
  bindingId: string;
  baselineTime: WorkflowUtcTimestamp;
}>;

export type ShortLivedCredentialExecutionContext = Readonly<{
  contextVersion: "1.0";
  executionHandle: WorkflowProtectedIdentity;
  expiresAt: WorkflowUtcTimestamp;
}>;

export type CredentialResolutionResult =
  | Readonly<{ status: "resolved"; context: ShortLivedCredentialExecutionContext }>
  | Readonly<{ status: "expired" | "revoked" | "unauthorized" | "scope-mismatch" | "region-mismatch" | "unavailable" }>;

export type CredentialResolver = Readonly<{
  resolverVersion: "1.0";
  resolve(request: CredentialResolutionRequest): Promise<CredentialResolutionResult>;
}>;

export type ProviderSafeFailure = Readonly<{
  failureVersion: "1.0";
  code: "invalid" | "rejected" | "timeout" | "unavailable" | "unknown-outcome";
  retryClass: "never" | "safe" | "lookup-required";
}>;

export type ProviderExecutionRequest = Readonly<{
  requestVersion: "1.0";
  binding: ProductionProviderBindingDescriptor;
  restrictedRequestReference: WorkflowProtectedIdentity;
  credential: ShortLivedCredentialExecutionContext;
  correlationIdentity: WorkflowProtectedIdentity;
}>;

export type ProviderExecutionResult =
  | Readonly<{ status: "accepted"; protectedJobReference: WorkflowProtectedIdentity }>
  | Readonly<{ status: "completed"; protectedOutputReferences: readonly WorkflowProtectedIdentity[] }>
  | Readonly<{ status: "failed"; failure: ProviderSafeFailure }>;

export type ProductionProviderClient = Readonly<{
  clientVersion: "1.0";
  submit(request: ProviderExecutionRequest): Promise<ProviderExecutionResult>;
  cancel(request: Readonly<{ jobReference: WorkflowProtectedIdentity; credential: ShortLivedCredentialExecutionContext }>): Promise<Readonly<{ status: "requested" | "confirmed" | "unsupported" }> | Readonly<{ status: "failed"; failure: ProviderSafeFailure }>>;
}>;

export type ProviderClientFactory = Readonly<{
  factoryVersion: "1.0";
  create(binding: ProductionProviderBindingDescriptor): ProductionProviderClient | undefined;
}>;

export type ProviderJobLookupResult =
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "completed"; protectedOutputReferences: readonly WorkflowProtectedIdentity[] }>
  | Readonly<{ status: "failed" | "cancelled" | "expired" }>
  | Readonly<{ status: "not-found" | "unknown"; failure: ProviderSafeFailure }>;

export type ProviderJobLookup = Readonly<{
  lookupVersion: "1.0";
  lookup(jobReference: WorkflowProtectedIdentity, credential: ShortLivedCredentialExecutionContext): Promise<ProviderJobLookupResult>;
}>;

export type ProviderJobLookupRegistry = Readonly<{
  registryVersion: "1.0";
  get(binding: ProductionProviderBindingDescriptor): ProviderJobLookup | undefined;
}>;

export type ProviderPollClientRegistry = ProviderJobLookupRegistry;

export type ProviderWebhookSafeEvent = Readonly<{
  eventVersion: "1.0";
  eventIdentity: WorkflowProtectedIdentity;
  protectedJobReference: WorkflowProtectedIdentity;
  receivedAt: WorkflowUtcTimestamp;
  eventClass: "pending" | "completed" | "failed" | "cancelled" | "unknown";
}>;

export type ProviderWebhookAdapter = Readonly<{
  adapterVersion: "1.0";
  validateAndProject(input: Readonly<{ bindingId: string; signatureProof: WorkflowProtectedIdentity; payloadHandle: WorkflowProtectedIdentity }>): Promise<Readonly<{ status: "validated"; event: ProviderWebhookSafeEvent }> | Readonly<{ status: "invalid" | "replayed" | "unsupported" | "unavailable" }>>;
}>;

export type ProviderWebhookRegistry = Readonly<{
  registryVersion: "1.0";
  get(bindingId: string, bindingVersion: string): ProviderWebhookAdapter | undefined;
}>;

export type ProductionWorkflowProviderRuntime = Readonly<{
  runtimeVersion: "1.0";
  bindings: ProviderBindingRegistry;
  credentials: CredentialResolver;
  clients: ProviderClientFactory;
  jobLookup: ProviderJobLookupRegistry;
  pollClients: ProviderPollClientRegistry;
  webhooks: ProviderWebhookRegistry;
}>;
