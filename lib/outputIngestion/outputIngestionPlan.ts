import type {
  GeneratedOutputRole,
  OutputIngestionInput,
  OutputIngestionPlan,
  OutputIngestionPlanItem,
  OutputIngestionPlanResult,
  OutputIngestionPolicy,
  ProviderOutputReferenceBundle,
} from "./types";
import {
  deepCopy,
  deepFreeze,
  finitePositive,
  isOpaque,
  isRecord,
  issue,
  normalizeMime,
  positiveInteger,
  sortIssues,
  utcMillis,
} from "./outputIngestionUtils";

const roles: readonly GeneratedOutputRole[] = ["primary", "alternate", "preview", "stem"];
const operations = ["generate-vocal", "generate-music", "generate-mv"] as const;
const retentionClasses = ["ephemeral", "project", "export", "legal-hold"] as const;
const sensitivityClasses = ["standard", "personal", "voice", "child-related", "sensitive"] as const;
const cancellationStages = ["none", "before-fetch", "during-fetch", "before-store", "before-registry"] as const;

function mimeCategory(kind: unknown): "audio" | "video" | "image" | undefined {
  if (kind === "audio" || kind === "voice" || kind === "melody") return "audio";
  if (kind === "video" || kind === "image") return kind;
  return undefined;
}

export function buildOutputIngestionPlan(input: OutputIngestionInput): OutputIngestionPlanResult {
  const raw: unknown = input;
  const issues = [] as ReturnType<typeof issue>[];
  const reject = (reason: Parameters<typeof issue>[0], classification: Parameters<typeof issue>[1] = "validation") => {
    issues.push(issue(reason, classification));
  };

  if (!isRecord(raw)) return { status: "invalid", issues: [issue("input-shape-invalid", "validation")] };
  if (raw.contractVersion !== "1.0") reject("unsupported-contract-version");
  if (!isOpaque(raw.providerId, 128)) reject("input-shape-invalid");
  if (!isOpaque(raw.providerApiVersion, 128)) reject("provider-api-version-mismatch");
  if (!operations.includes(raw.operation as (typeof operations)[number])) reject("operation-mismatch");

  const generation = raw.generationResult;
  if (!isRecord(generation)) {
    reject("generation-result-invalid");
  } else {
    if (generation.resultSchemaVersion !== "1.0") reject("generation-result-invalid");
    if (!(["completed", "partial"] as const).includes(generation.status as "completed" | "partial")) reject("generation-result-invalid");
    if (generation.providerId !== raw.providerId) reject("provider-mismatch");
    if (!Array.isArray(generation.outputs) || generation.outputs.length === 0) reject("generation-result-invalid");
  }

  const expected = raw.expectedOutput;
  let requiredRoles: GeneratedOutputRole[] = [];
  let optionalRoles: GeneratedOutputRole[] = [];
  if (!isRecord(expected)) {
    reject("input-shape-invalid");
  } else {
    if (expected.contractVersion !== "1.0") reject("unsupported-contract-version");
    if (!Array.isArray(expected.requiredRoles) || !Array.isArray(expected.optionalRoles)) {
      reject("output-role-invalid");
    } else {
      requiredRoles = expected.requiredRoles.filter((value): value is GeneratedOutputRole => roles.includes(value as GeneratedOutputRole));
      optionalRoles = expected.optionalRoles.filter((value): value is GeneratedOutputRole => roles.includes(value as GeneratedOutputRole));
      const combined = [...expected.requiredRoles, ...expected.optionalRoles];
      if (combined.length === 0 || combined.some((role) => !roles.includes(role as GeneratedOutputRole))) reject("output-role-invalid");
      if (new Set(combined).size !== combined.length) reject("output-role-invalid");
    }
    if (!positiveInteger(expected.maximumOutputCount)) reject("input-shape-invalid");
    if (!positiveInteger(expected.maximumSizeBytes)) reject("input-shape-invalid");
    if (typeof expected.requireChecksum !== "boolean" || typeof expected.requireDurationMetadata !== "boolean" || typeof expected.requireDimensions !== "boolean") reject("input-shape-invalid");

    if (!Array.isArray(expected.allowedMimeTypes) || expected.allowedMimeTypes.length === 0) {
      reject("mime-type-mismatch");
    } else {
      const normalized = expected.allowedMimeTypes.map(normalizeMime);
      const category = mimeCategory(expected.kind);
      if (!category || normalized.some((value) => !value || !value.startsWith(`${category}/`)) || new Set(normalized).size !== normalized.length) reject("mime-type-mismatch");
    }
    for (const values of [expected.allowedCodecs, expected.allowedContainers]) {
      if (values !== undefined && (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.trim() === ""))) reject("codec-unsupported");
    }
    if (expected.expectedDuration !== undefined && (!isRecord(expected.expectedDuration) || !finitePositive(expected.expectedDuration.targetSeconds) || typeof expected.expectedDuration.toleranceSeconds !== "number" || !Number.isFinite(expected.expectedDuration.toleranceSeconds) || expected.expectedDuration.toleranceSeconds < 0)) reject("duration-mismatch");
    if (expected.expectedDimensions !== undefined && !validDimensions(expected.expectedDimensions)) reject("dimensions-mismatch");
    if (expected.kind === "image" && (expected.requireDurationMetadata === true || expected.expectedDuration !== undefined)) reject("input-shape-invalid");
    if ((expected.kind === "audio" || expected.kind === "voice" || expected.kind === "melody") && (expected.requireDimensions === true || expected.expectedDimensions !== undefined)) reject("input-shape-invalid");
  }

  const outputs = isRecord(generation) && Array.isArray(generation.outputs) ? generation.outputs : [];
  const expectedRoles = new Set([...requiredRoles, ...optionalRoles]);
  const seenReferences = new Set<string>();
  const seenRoles = new Set<GeneratedOutputRole>();
  for (const output of outputs) {
    if (!isRecord(output) || !roles.includes(output.role as GeneratedOutputRole)) {
      reject("output-role-invalid");
      continue;
    }
    const role = output.role as GeneratedOutputRole;
    if (!expectedRoles.has(role)) reject("output-role-invalid");
    if (seenRoles.has(role)) reject("output-role-invalid");
    seenRoles.add(role);
    if (!isOpaque(output.assetId, 256)) reject("output-reference-invalid");
    else if (seenReferences.has(output.assetId)) reject("duplicate-output-reference");
    else seenReferences.add(output.assetId);
    if (isRecord(expected) && output.kind !== expected.kind) reject("generation-result-invalid");
  }
  if (requiredRoles.some((role) => !seenRoles.has(role))) reject("required-output-missing");
  if (isRecord(expected) && positiveInteger(expected.maximumOutputCount) && outputs.length > expected.maximumOutputCount) reject("output-count-exceeded");

  const policy = raw.policy;
  if (!isRecord(policy)) {
    reject("input-shape-invalid", "policy");
  } else {
    if (policy.policyVersion !== "1.0") reject("unsupported-contract-version", "policy");
    if (!Array.isArray(policy.allowedProviderIds) || policy.allowedProviderIds.some((value) => !isOpaque(value, 128)) || !policy.allowedProviderIds.includes(raw.providerId)) reject("provider-mismatch", "policy");
    if (policy.externalFetchAllowed !== true) reject("output-fetch-failed", "policy");
    if (!positiveInteger(policy.maximumDownloadBytes) || typeof policy.requireHttps !== "boolean" || !(["none", "same-allowlisted-host"] as const).includes(policy.redirectPolicy as "none" | "same-allowlisted-host")) reject("input-shape-invalid", "policy");
    if (!retentionClasses.includes(policy.retentionClass as (typeof retentionClasses)[number]) || !sensitivityClasses.includes(policy.sensitivityClass as (typeof sensitivityClasses)[number])) reject("input-shape-invalid", "policy");
    if (typeof policy.scanRequired !== "boolean" || typeof policy.metadataStrippingRequired !== "boolean" || typeof policy.deletionPending !== "boolean" || policy.deletionPending) reject("input-shape-invalid", "policy");
    if (policy.sourceRegion !== undefined && !isOpaque(policy.sourceRegion, 64)) reject("input-shape-invalid", "policy");
    if (policy.destinationRegion !== undefined && !isOpaque(policy.destinationRegion, 64)) reject("input-shape-invalid", "policy");
    if (policy.sourceRegion && policy.destinationRegion && policy.sourceRegion !== policy.destinationRegion) reject("input-shape-invalid", "policy");
  }

  const context = raw.context;
  if (!isRecord(context) || context.contextVersion !== "1.0" || !isOpaque(context.operationRef, 128) || utcMillis(context.baselineTime) === undefined || !positiveInteger(context.attempt)) reject("input-shape-invalid");
  else if (context.cancellation !== undefined && (!isRecord(context.cancellation) || !cancellationStages.includes(context.cancellation.stage as (typeof cancellationStages)[number]))) reject("input-shape-invalid");
  if (raw.idempotency !== undefined && (!isRecord(raw.idempotency) || !isOpaque(raw.idempotency.ingestionKeyRef, 128))) reject("input-shape-invalid");

  if (issues.length > 0 || !isRecord(expected) || !isRecord(policy) || !isRecord(context)) {
    return { status: "invalid", issues: deepFreeze(sortIssues(issues)) };
  }

  const allowedMimeTypes = (expected.allowedMimeTypes as string[]).map(normalizeMime);
  const allowedCodecs = Array.isArray(expected.allowedCodecs) ? expected.allowedCodecs.map((value) => value.toLowerCase()) : [];
  const allowedContainers = Array.isArray(expected.allowedContainers) ? expected.allowedContainers.map((value) => value.toLowerCase()) : [];
  const items: OutputIngestionPlanItem[] = outputs.map((output, slotIndex) => {
    const record = output as Record<string, unknown>;
    return {
      slotIndex,
      role: record.role as GeneratedOutputRole,
      requirement: requiredRoles.includes(record.role as GeneratedOutputRole) ? "required" : "optional",
      expectedKind: expected.kind as OutputIngestionPlanItem["expectedKind"],
      allowedMimeTypes: deepCopy(allowedMimeTypes),
      allowedCodecs: deepCopy(allowedCodecs),
      allowedContainers: deepCopy(allowedContainers),
      maximumSizeBytes: Math.min(expected.maximumSizeBytes as number, policy.maximumDownloadBytes as number),
      ...(expected.expectedDuration ? { expectedDuration: deepCopy(expected.expectedDuration) as OutputIngestionPlanItem["expectedDuration"] } : {}),
      ...(expected.expectedDimensions ? { expectedDimensions: deepCopy(expected.expectedDimensions) as OutputIngestionPlanItem["expectedDimensions"] } : {}),
      requireChecksum: expected.requireChecksum as boolean,
      requireDurationMetadata: expected.requireDurationMetadata as boolean,
      requireDimensions: expected.requireDimensions as boolean,
    };
  });
  const { allowedProviderIds: _allowedProviderIds, ...projectedPolicy } = policy as unknown as OutputIngestionPolicy;
  const plan: OutputIngestionPlan = {
    planVersion: "1.0",
    executorVersion: "reference-v1",
    providerId: raw.providerId as string,
    providerApiVersion: raw.providerApiVersion as string,
    operation: raw.operation as OutputIngestionPlan["operation"],
    items,
    policy: deepCopy(projectedPolicy),
    context: deepCopy(context) as OutputIngestionPlan["context"],
    ...(raw.idempotency ? { idempotency: deepCopy(raw.idempotency) as OutputIngestionPlan["idempotency"] } : {}),
    warnings: [],
  };
  const references = {
    bundleVersion: "1.0",
    providerId: plan.providerId,
    providerApiVersion: plan.providerApiVersion,
    operation: plan.operation,
    items: outputs.map((output, slotIndex) => ({ slotIndex, role: (output as Record<string, unknown>).role as GeneratedOutputRole, providerOutputReference: (output as Record<string, unknown>).assetId as string })),
  } as unknown as ProviderOutputReferenceBundle;
  return deepFreeze({ status: "planned", plan, references, issues: [] });
}

function validDimensions(value: unknown): boolean {
  if (!isRecord(value)) return false;
  for (const key of ["width", "height", "minimumWidth", "minimumHeight", "maximumWidth", "maximumHeight"]) {
    if (value[key] !== undefined && !positiveInteger(value[key])) return false;
  }
  if (value.aspectTolerance !== undefined && (typeof value.aspectTolerance !== "number" || !Number.isFinite(value.aspectTolerance) || value.aspectTolerance < 0)) return false;
  return value.aspectRatio === undefined || (typeof value.aspectRatio === "string" && /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value.aspectRatio));
}
