import type {
  ServerCapabilityIdentity,
  ServerCompositionAudit,
  ServerCompositionAuditEntry,
  ServerCompositionCapabilities,
  ServerCompositionDefinition,
  ServerCompositionFailure,
  ServerCompositionInput,
  ServerCompositionResolution,
  ServerCompositionResult,
  ServerCompositionValidationIssue,
  ServerCompositionValidationResult,
  ServerDependencyIdentity,
  ServerDependencyResolution,
  ServerDependencySlot,
  ServerHealthCapability,
  ServerWorkflowEntryCapability,
} from "./types";

export type ReferenceServerAdditionalCapability = Readonly<{
  role: ServerDependencySlot["role"];
  dependency: ServerDependencyIdentity;
  identity: ServerCapabilityIdentity;
  status: "provided" | "degraded" | "unavailable";
}>;

export type ReferenceServerCapabilityBindings = Readonly<{
  workflowEntry?: Readonly<{
    dependency: ServerDependencyIdentity;
    capability: ServerWorkflowEntryCapability;
  }>;
  health?: Readonly<{
    dependency: ServerDependencyIdentity;
    capability: ServerHealthCapability;
  }>;
  additional: readonly ReferenceServerAdditionalCapability[];
}>;

export type ReferenceServerCompositionDependencies = Readonly<{
  bindings: ReferenceServerCapabilityBindings;
}>;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const sameIdentity = (
  left: ServerDependencyIdentity | ServerCapabilityIdentity,
  right: ServerDependencyIdentity | ServerCapabilityIdentity,
): boolean => {
  if ("dependencyId" in left && "dependencyId" in right) {
    return left.dependencyId === right.dependencyId && left.dependencyVersion === right.dependencyVersion;
  }
  if ("capabilityId" in left && "capabilityId" in right) {
    return left.capabilityId === right.capabilityId && left.capabilityVersion === right.capabilityVersion;
  }
  return false;
};

const issue = (
  issues: ServerCompositionValidationIssue[],
  reasonCode: ServerCompositionValidationIssue["reasonCode"],
  field: ServerCompositionValidationIssue["field"],
): void => {
  issues.push({ reasonCode, field, sequence: issues.length });
};

export const validateServerComposition = (
  input: ServerCompositionInput,
): ServerCompositionValidationResult => {
  const issues: ServerCompositionValidationIssue[] = [];
  const definition = input.definition;
  if (definition.definitionVersion !== "1.0" || definition.identity.compositionId.length === 0 ||
    definition.identity.compositionVersion.length === 0) issue(issues, "invalid-composition", "composition");
  const slotIds = new Set<string>();
  const dependencyIds = new Set<string>();
  const capabilityIds = new Set<string>();
  const orders = new Set<number>();
  for (const slot of definition.dependencies) {
    if (slot.slotVersion !== "1.0" || slot.slotId.length === 0 ||
      slot.dependency.dependencyId.length === 0 || slot.dependency.dependencyVersion.length === 0 ||
      slot.capability.referenceVersion !== "1.0" || slot.capability.identity.capabilityId.length === 0 ||
      slot.capability.identity.capabilityVersion.length === 0 || slot.capability.contractId.length === 0 ||
      slot.capability.contractVersion.length === 0) issue(issues, "invalid-dependency-slot", "dependency-slot");
    if (slotIds.has(slot.slotId)) issue(issues, "duplicate-dependency-slot", "dependency-slot");
    slotIds.add(slot.slotId);
    const dependencyKey = `${slot.dependency.dependencyId.length}:${slot.dependency.dependencyId}:${slot.dependency.dependencyVersion}`;
    if (dependencyIds.has(dependencyKey)) issue(issues, "duplicate-dependency", "dependency");
    dependencyIds.add(dependencyKey);
    const capabilityKey = `${slot.capability.identity.capabilityId.length}:${slot.capability.identity.capabilityId}:${slot.capability.identity.capabilityVersion}`;
    if (capabilityIds.has(capabilityKey)) issue(issues, "duplicate-capability", "capability");
    capabilityIds.add(capabilityKey);
    if (!Number.isSafeInteger(slot.declarationOrder) || slot.declarationOrder < 0 || orders.has(slot.declarationOrder)) {
      issue(issues, "invalid-declaration-order", "declaration-order");
    }
    orders.add(slot.declarationOrder);
  }
  const requiredRoles = definition.dependencies.filter((slot) => slot.requirement === "required").map((slot) => slot.role);
  if (!requiredRoles.includes("workflow-entry") || !requiredRoles.includes("health")) {
    issue(issues, "invalid-composition", "composition");
  }
  if (input.inputVersion !== "1.0" || input.context.contextVersion !== "1.0" ||
    input.context.correlationIdentity.length === 0) issue(issues, "invalid-context", "context");
  return deepFreeze(issues.length === 0 ? { status: "valid" } : { status: "invalid", issues });
};

const candidateFor = (
  slot: ServerDependencySlot,
  bindings: ReferenceServerCapabilityBindings,
): Readonly<{
  dependency: ServerDependencyIdentity;
  identity: ServerCapabilityIdentity;
  status: "provided" | "degraded" | "unavailable";
}> | undefined => {
  if (slot.role === "workflow-entry" && bindings.workflowEntry !== undefined) {
    return { dependency: bindings.workflowEntry.dependency, ...bindings.workflowEntry.capability };
  }
  if (slot.role === "health" && bindings.health !== undefined) {
    return { dependency: bindings.health.dependency, ...bindings.health.capability };
  }
  return bindings.additional.find((candidate) => candidate.role === slot.role && sameIdentity(candidate.dependency, slot.dependency));
};

const resolveDependencies = (
  definition: ServerCompositionDefinition,
  bindings: ReferenceServerCapabilityBindings,
): readonly ServerDependencyResolution[] => [...definition.dependencies]
  .sort((left, right) => left.declarationOrder - right.declarationOrder || left.slotId.localeCompare(right.slotId))
  .map((slot) => {
    const candidate = candidateFor(slot, bindings);
    if (candidate === undefined) {
      return {
        status: "missing" as const,
        slotId: slot.slotId,
        declarationOrder: slot.declarationOrder,
        requirement: slot.requirement,
        dependency: { ...slot.dependency },
        reasonCode: "dependency-missing",
      };
    }
    if (!sameIdentity(candidate.dependency, slot.dependency) || !sameIdentity(candidate.identity, slot.capability.identity)) {
      return {
        status: "incompatible" as const,
        slotId: slot.slotId,
        declarationOrder: slot.declarationOrder,
        requirement: slot.requirement,
        dependency: { ...slot.dependency },
        reasonCode: "dependency-incompatible",
      };
    }
    if (candidate.status === "unavailable") {
      return {
        status: "rejected" as const,
        slotId: slot.slotId,
        declarationOrder: slot.declarationOrder,
        requirement: slot.requirement,
        dependency: { ...slot.dependency },
        reasonCode: "capability-unavailable",
      };
    }
    return {
      status: "resolved" as const,
      slotId: slot.slotId,
      declarationOrder: slot.declarationOrder,
      dependency: { ...slot.dependency },
      capability: { ...candidate.identity },
    };
  });

const failureFor = (resolution: ServerDependencyResolution): ServerCompositionFailure => {
  if (resolution.status === "missing") {
    return { classification: "unavailable", errorCode: "required-dependency-missing", safeMessageClassification: "dependency", retryable: false };
  }
  if (resolution.status === "incompatible") {
    return { classification: "conflict", errorCode: "dependency-incompatible", safeMessageClassification: "compatibility", retryable: false };
  }
  return { classification: "unavailable", errorCode: "capability-unavailable", safeMessageClassification: "availability", retryable: true };
};

export class ReferenceServerComposition {
  readonly #bindings: ReferenceServerCapabilityBindings;

  constructor(dependencies: ReferenceServerCompositionDependencies) {
    this.#bindings = deepFreeze({
      ...(dependencies.bindings.workflowEntry === undefined ? {} : {
        workflowEntry: {
          dependency: { ...dependencies.bindings.workflowEntry.dependency },
          capability: { ...dependencies.bindings.workflowEntry.capability,
            identity: { ...dependencies.bindings.workflowEntry.capability.identity },
            supportedRequestClassifications: [...dependencies.bindings.workflowEntry.capability.supportedRequestClassifications],
            supportedResultClassifications: [...dependencies.bindings.workflowEntry.capability.supportedResultClassifications] },
        },
      }),
      ...(dependencies.bindings.health === undefined ? {} : {
        health: {
          dependency: { ...dependencies.bindings.health.dependency },
          capability: { ...dependencies.bindings.health.capability,
            identity: { ...dependencies.bindings.health.capability.identity },
            supportedHealthClassifications: [...dependencies.bindings.health.capability.supportedHealthClassifications] },
        },
      }),
      additional: dependencies.bindings.additional.map((candidate) => ({
        ...candidate,
        dependency: { ...candidate.dependency },
        identity: { ...candidate.identity },
      })),
    });
  }

  compose(input: ServerCompositionInput): ServerCompositionResult {
    const entries: ServerCompositionAuditEntry[] = [];
    const addAudit = (stage: ServerCompositionAuditEntry["stage"], outcome: string, reasonCode: string): void => {
      entries.push({ entryVersion: "1.0", sequence: entries.length, stage, outcome, reasonCode });
    };
    const audit = (): ServerCompositionAudit => deepFreeze({
      auditVersion: "1.0",
      composition: { ...input.definition.identity },
      entries: entries.map((entry) => ({ ...entry })),
      reasonCodes: entries.map((entry) => entry.reasonCode),
    });
    const validation = validateServerComposition(input);
    if (validation.status === "invalid") {
      addAudit("validation", "invalid", "composition-validation-failed");
      return deepFreeze({
        resultVersion: "1.0",
        status: "unavailable",
        lifecycle: "unavailable",
        identity: { ...input.definition.identity },
        resolution: {
          resolutionVersion: "1.0",
          composition: { ...input.definition.identity },
          status: "unavailable",
          dependencies: [],
          requiredDependencyFailure: true,
          omittedOptionalSlotIds: [],
        },
        failures: [{ classification: "invalid", errorCode: "invalid-definition", safeMessageClassification: "configuration", retryable: false }],
        audit: audit(),
      });
    }
    addAudit("validation", "valid", "composition-validation-succeeded");
    const duplicateBindings = [this.#bindings.workflowEntry?.capability.identity, this.#bindings.health?.capability.identity,
      ...this.#bindings.additional.map((candidate) => candidate.identity)].filter((identity): identity is ServerCapabilityIdentity => identity !== undefined);
    const keys = duplicateBindings.map((identity) => `${identity.capabilityId.length}:${identity.capabilityId}:${identity.capabilityVersion}`);
    if (new Set(keys).size !== keys.length) {
      addAudit("dependency-resolution", "rejected", "duplicate-capability-binding");
      return deepFreeze({
        resultVersion: "1.0",
        status: "unavailable",
        lifecycle: "unavailable",
        identity: { ...input.definition.identity },
        resolution: { resolutionVersion: "1.0", composition: { ...input.definition.identity }, status: "unavailable", dependencies: [], requiredDependencyFailure: true, omittedOptionalSlotIds: [] },
        failures: [{ classification: "conflict", errorCode: "dependency-incompatible", safeMessageClassification: "compatibility", retryable: false }],
        audit: audit(),
      });
    }
    const dependencies = resolveDependencies(input.definition, this.#bindings);
    const failures = dependencies.filter((resolution) => resolution.status !== "resolved");
    const requiredFailures = failures.filter((resolution) => resolution.requirement === "required");
    const omittedOptionalSlotIds = failures
      .filter((resolution) => resolution.requirement === "optional")
      .map((resolution) => resolution.slotId);
    const resolutionStatus: ServerCompositionResolution["status"] = requiredFailures.length > 0
      ? "unavailable"
      : failures.length > 0
        ? "degraded"
        : "resolved";
    addAudit("dependency-resolution", resolutionStatus, `composition-dependencies-${resolutionStatus}`);
    const resolution = deepFreeze({
      resolutionVersion: "1.0" as const,
      composition: { ...input.definition.identity },
      status: resolutionStatus,
      dependencies,
      requiredDependencyFailure: requiredFailures.length > 0,
      omittedOptionalSlotIds,
    });
    if (requiredFailures.length > 0 || this.#bindings.workflowEntry === undefined || this.#bindings.health === undefined) {
      addAudit("lifecycle-projection", "unavailable", "composition-unavailable");
      return deepFreeze({
        resultVersion: "1.0",
        status: "unavailable",
        lifecycle: "unavailable",
        identity: { ...input.definition.identity },
        resolution,
        failures: requiredFailures.map(failureFor),
        audit: audit(),
      });
    }
    const capabilities: ServerCompositionCapabilities = deepFreeze({
      capabilitiesVersion: "1.0",
      workflowEntry: { ...this.#bindings.workflowEntry.capability,
        identity: { ...this.#bindings.workflowEntry.capability.identity },
        supportedRequestClassifications: [...this.#bindings.workflowEntry.capability.supportedRequestClassifications],
        supportedResultClassifications: [...this.#bindings.workflowEntry.capability.supportedResultClassifications] },
      health: { ...this.#bindings.health.capability,
        identity: { ...this.#bindings.health.capability.identity },
        supportedHealthClassifications: [...this.#bindings.health.capability.supportedHealthClassifications] },
      additional: this.#bindings.additional
        .filter((candidate) => dependencies.some((resolution) => resolution.status === "resolved" && sameIdentity(resolution.capability, candidate.identity)))
        .map((candidate) => ({ role: candidate.role, identity: { ...candidate.identity }, status: candidate.status }))
        .sort((left, right) => left.role.localeCompare(right.role) || left.identity.capabilityId.localeCompare(right.identity.capabilityId)),
    });
    addAudit("capability-projection", "assembled", "composition-capabilities-assembled");
    if (failures.length > 0 || capabilities.workflowEntry.status === "degraded" || capabilities.health.status === "degraded") {
      addAudit("lifecycle-projection", "degraded", "composition-degraded");
      return deepFreeze({
        resultVersion: "1.0",
        status: "degraded",
        lifecycle: "degraded",
        identity: { ...input.definition.identity },
        resolution,
        capabilities,
        failures: failures.map(failureFor),
        audit: audit(),
      });
    }
    addAudit("lifecycle-projection", "ready", "composition-ready");
    return deepFreeze({
      resultVersion: "1.0",
      status: "ready",
      lifecycle: "ready",
      identity: { ...input.definition.identity },
      resolution,
      capabilities,
      audit: audit(),
    });
  }
}
