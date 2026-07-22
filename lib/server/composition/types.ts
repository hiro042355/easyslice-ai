export type ServerCompositionVersion = string;

export type ServerCompositionIdentity = Readonly<{
  compositionId: string;
  compositionVersion: ServerCompositionVersion;
}>;

export type ServerCapabilityIdentity = Readonly<{
  capabilityId: string;
  capabilityVersion: string;
}>;

export type ServerDependencyIdentity = Readonly<{
  dependencyId: string;
  dependencyVersion: string;
}>;

export type ServerCapabilityReference = Readonly<{
  referenceVersion: "1.0";
  identity: ServerCapabilityIdentity;
  contractId: string;
  contractVersion: string;
}>;

export type ServerDependencySlot = Readonly<{
  slotVersion: "1.0";
  slotId: string;
  declarationOrder: number;
  requirement: "required" | "optional";
  role: "workflow-entry" | "health" | "audit" | "authorization" | "persistence";
  dependency: ServerDependencyIdentity;
  capability: ServerCapabilityReference;
}>;

export type ServerCompositionDefinition = Readonly<{
  definitionVersion: "1.0";
  identity: ServerCompositionIdentity;
  dependencies: readonly ServerDependencySlot[];
}>;

export type ServerCompositionContext = Readonly<{
  contextVersion: "1.0";
  environmentClassification: "development" | "test" | "staging" | "production";
  deploymentClassification: "local" | "single-region" | "multi-region";
  executionClassification: "interactive" | "service" | "maintenance";
  correlationIdentity: string;
}>;

export type ServerCompositionInput = Readonly<{
  inputVersion: "1.0";
  definition: ServerCompositionDefinition;
  context: ServerCompositionContext;
  requestedCapabilities: readonly ServerCapabilityIdentity[];
}>;

export type ServerCompositionValidationIssue = Readonly<{
  reasonCode:
    | "invalid-composition"
    | "invalid-dependency-slot"
    | "duplicate-dependency-slot"
    | "duplicate-dependency"
    | "duplicate-capability"
    | "invalid-declaration-order"
    | "invalid-context";
  field: "composition" | "dependency-slot" | "dependency" | "capability" | "declaration-order" | "context";
  sequence: number;
}>;

export type ServerCompositionValidationResult =
  | Readonly<{ status: "valid" }>
  | Readonly<{
      status: "invalid";
      issues: readonly ServerCompositionValidationIssue[];
    }>;

export type ServerDependencyResolution =
  | Readonly<{
      status: "resolved";
      slotId: string;
      declarationOrder: number;
      dependency: ServerDependencyIdentity;
      capability: ServerCapabilityIdentity;
    }>
  | Readonly<{
      status: "missing" | "incompatible" | "rejected";
      slotId: string;
      declarationOrder: number;
      requirement: "required" | "optional";
      dependency: ServerDependencyIdentity;
      reasonCode: string;
    }>;

export type ServerCompositionResolution = Readonly<{
  resolutionVersion: "1.0";
  composition: ServerCompositionIdentity;
  status: "resolved" | "degraded" | "unavailable";
  dependencies: readonly ServerDependencyResolution[];
  requiredDependencyFailure: boolean;
  omittedOptionalSlotIds: readonly string[];
}>;

export type ServerCompositionLifecycle = "created" | "ready" | "degraded" | "unavailable" | "disposed";

export type ServerCapabilityProvisionStatus = "provided" | "degraded" | "unavailable";

export type ServerWorkflowEntryCapability = Readonly<{
  descriptorVersion: "1.0";
  identity: ServerCapabilityIdentity;
  status: ServerCapabilityProvisionStatus;
  supportedRequestClassifications: readonly ("start" | "resume" | "reconcile" | "query" | "cancel")[];
  supportedResultClassifications: readonly (
    | "accepted"
    | "completed"
    | "partial"
    | "failed"
    | "cancelled"
    | "recovery-required"
    | "rejected"
  )[];
}>;

export type ServerHealthCapability = Readonly<{
  descriptorVersion: "1.0";
  identity: ServerCapabilityIdentity;
  status: ServerCapabilityProvisionStatus;
  supportedHealthClassifications: readonly ("ready" | "degraded" | "unavailable")[];
}>;

export type ServerCompositionCapabilities = Readonly<{
  capabilitiesVersion: "1.0";
  workflowEntry: ServerWorkflowEntryCapability;
  health: ServerHealthCapability;
  additional: readonly Readonly<{
    role: ServerDependencySlot["role"];
    identity: ServerCapabilityIdentity;
    status: ServerCapabilityProvisionStatus;
  }>[];
}>;

export type ServerCompositionErrorCode =
  | "invalid-definition"
  | "invalid-context"
  | "required-dependency-missing"
  | "dependency-incompatible"
  | "dependency-rejected"
  | "capability-unavailable"
  | "composition-unavailable";

export type ServerCompositionFailure = Readonly<{
  classification: "invalid" | "conflict" | "unavailable" | "policy-rejected";
  errorCode: ServerCompositionErrorCode;
  safeMessageClassification: "configuration" | "dependency" | "compatibility" | "policy" | "availability";
  retryable: boolean;
}>;

export type ServerCompositionAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: "validation" | "dependency-resolution" | "capability-projection" | "lifecycle-projection";
  outcome: string;
  reasonCode: string;
}>;

export type ServerCompositionAudit = Readonly<{
  auditVersion: "1.0";
  composition: ServerCompositionIdentity;
  entries: readonly ServerCompositionAuditEntry[];
  reasonCodes: readonly string[];
}>;

export type ServerCompositionReadyResult = Readonly<{
  resultVersion: "1.0";
  status: "ready";
  lifecycle: "ready";
  identity: ServerCompositionIdentity;
  resolution: ServerCompositionResolution;
  capabilities: ServerCompositionCapabilities;
  audit: ServerCompositionAudit;
}>;

export type ServerCompositionDegradedResult = Readonly<{
  resultVersion: "1.0";
  status: "degraded";
  lifecycle: "degraded";
  identity: ServerCompositionIdentity;
  resolution: ServerCompositionResolution;
  capabilities: ServerCompositionCapabilities;
  failures: readonly ServerCompositionFailure[];
  audit: ServerCompositionAudit;
}>;

export type ServerCompositionUnavailableResult = Readonly<{
  resultVersion: "1.0";
  status: "unavailable";
  lifecycle: "unavailable";
  identity: ServerCompositionIdentity;
  resolution: ServerCompositionResolution;
  failures: readonly ServerCompositionFailure[];
  audit: ServerCompositionAudit;
}>;

export type ServerCompositionResult =
  | ServerCompositionReadyResult
  | ServerCompositionDegradedResult
  | ServerCompositionUnavailableResult;
