export type ProductionWorkflowRuntimeVersion = "1.0";
export type ProductionWorkflowInterfaceVersion = "1.0";
export type ProductionWorkflowStoreSchemaVersion = "1.0";

export type ProductionWorkflowOperation =
  | "generate-vocal"
  | "generate-music"
  | "generate-mv";

export type ProductionWorkflowRuntimeConsumer =
  | "workflow-start-api"
  | "upload-poll-api"
  | "generation-poll-api"
  | "result-query-api"
  | "cancel-api"
  | "upload-poll-worker"
  | "resume-worker"
  | "generation-poll-worker"
  | "webhook-handler"
  | "reconciliation-worker"
  | "cleanup-worker"
  | "deletion-worker"
  | "operator-repair-tool";

export const PRODUCTION_WORKFLOW_RUNTIME_CONSUMERS = Object.freeze([
  "workflow-start-api",
  "upload-poll-api",
  "generation-poll-api",
  "result-query-api",
  "cancel-api",
  "upload-poll-worker",
  "resume-worker",
  "generation-poll-worker",
  "webhook-handler",
  "reconciliation-worker",
  "cleanup-worker",
  "deletion-worker",
  "operator-repair-tool",
] as const satisfies readonly ProductionWorkflowRuntimeConsumer[]);

export type ProductionWorkflowRuntimeCapability =
  | "durable-persistence"
  | "cross-instance-coordination"
  | "distributed-idempotency"
  | "durable-jobs"
  | "durable-references"
  | "transactional-outbox"
  | "production-authentication"
  | "production-credentials"
  | "provider-job-lookup"
  | "graceful-drain";

export type ProductionWorkflowRuntimeCapabilityStatus =
  | "available"
  | "unavailable"
  | "degraded";

export type ProductionWorkflowRuntimeCapabilityRequirement = "required" | "optional";

export type ProductionWorkflowRuntimeCapabilityDescriptor = Readonly<{
  capability: ProductionWorkflowRuntimeCapability;
  requirement: ProductionWorkflowRuntimeCapabilityRequirement;
  status: ProductionWorkflowRuntimeCapabilityStatus;
  acceptanceGate: string;
}>;

export type ProductionWorkflowRuntimeCapabilities = Readonly<
  Record<ProductionWorkflowRuntimeCapability, ProductionWorkflowRuntimeCapabilityDescriptor>
>;

export const REQUIRED_PRODUCTION_WORKFLOW_CAPABILITIES = Object.freeze([
  "durable-persistence",
  "cross-instance-coordination",
  "distributed-idempotency",
  "durable-jobs",
  "durable-references",
  "production-authentication",
  "graceful-drain",
] as const satisfies readonly ProductionWorkflowRuntimeCapability[]);

export type WorkflowProtectedIdentity = Readonly<{
  identityVersion: "1.0";
  namespace: string;
  protectedValue: string;
}>;

export type WorkflowRecordRevision = Readonly<{
  revisionVersion: "1.0";
  value: number;
}>;

export type WorkflowExpectedRevision = Readonly<{
  expectedRevisionVersion: "1.0";
  value: number;
}>;

export type WorkflowUtcTimestamp = string;

export type ProductionWorkflowClock = Readonly<{
  clockVersion: "1.0";
  nowUtc(): WorkflowUtcTimestamp;
  monotonicMilliseconds(): number;
}>;

export type ProductionWorkflowIdPurpose =
  | "internal-record"
  | "public-result-reference"
  | "claim"
  | "outbox-event"
  | "correlation"
  | "billing";

export type ProductionWorkflowGeneratedId = Readonly<{
  idVersion: "1.0";
  purpose: ProductionWorkflowIdPurpose;
  value: string;
}>;

export type ProductionWorkflowIdGenerator = Readonly<{
  generatorVersion: "1.0";
  mode: "production-entropy" | "reference-deterministic";
  generate(purpose: ProductionWorkflowIdPurpose): ProductionWorkflowGeneratedId;
}>;

export type ProductionWorkflowCoreRuntime = Readonly<{
  interfaceVersion: ProductionWorkflowInterfaceVersion;
  clock: ProductionWorkflowClock;
  ids: ProductionWorkflowIdGenerator;
  consumerDescriptors: readonly ProductionWorkflowConsumerDescriptor[];
}>;

export type ProductionWorkflowConsumerDescriptor = Readonly<{
  consumer: ProductionWorkflowRuntimeConsumer;
  access: "read-only" | "read-write";
  transactionRequired: boolean;
  externalIo: "none" | "outside-transaction";
  claimRequirement: "none" | "claim" | "lease";
}>;
