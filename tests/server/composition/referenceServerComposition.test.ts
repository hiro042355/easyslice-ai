import assert from "node:assert/strict";
import test from "node:test";
import type {
  ServerCapabilityIdentity,
  ServerCompositionInput,
  ServerDependencySlot,
  ServerHealthCapability,
  ServerWorkflowEntryCapability,
} from "../../../lib/server/composition/types";
import {
  ReferenceServerComposition,
  type ReferenceServerAdditionalCapability,
  type ReferenceServerCapabilityBindings,
} from "../../../lib/server/composition/referenceServerComposition";

const identity = (capabilityId: string): ServerCapabilityIdentity => ({ capabilityId, capabilityVersion: "1.0" });
const slot = (
  role: ServerDependencySlot["role"],
  order: number,
  requirement: ServerDependencySlot["requirement"] = "required",
): ServerDependencySlot => ({
  slotVersion: "1.0",
  slotId: `${role}-slot`,
  declarationOrder: order,
  requirement,
  role,
  dependency: { dependencyId: `${role}-dependency`, dependencyVersion: "1.0" },
  capability: {
    referenceVersion: "1.0",
    identity: identity(`${role}-capability`),
    contractId: `${role}-contract`,
    contractVersion: "1.0",
  },
});

const workflowEntry: ServerWorkflowEntryCapability = {
  descriptorVersion: "1.0",
  identity: identity("workflow-entry-capability"),
  status: "provided",
  supportedRequestClassifications: ["start", "resume"],
  supportedResultClassifications: ["completed", "failed", "recovery-required"],
};
const health: ServerHealthCapability = {
  descriptorVersion: "1.0",
  identity: identity("health-capability"),
  status: "provided",
  supportedHealthClassifications: ["ready", "degraded", "unavailable"],
};
const additional: ReferenceServerAdditionalCapability = {
  role: "audit",
  dependency: { dependencyId: "audit-dependency", dependencyVersion: "1.0" },
  identity: identity("audit-capability"),
  status: "provided",
};

const input = (includeOptional = true): ServerCompositionInput => ({
  inputVersion: "1.0",
  definition: {
    definitionVersion: "1.0",
    identity: { compositionId: "reference-server", compositionVersion: "1.0" },
    dependencies: [slot("health", 1), slot("workflow-entry", 0), ...(includeOptional ? [slot("audit", 2, "optional")] : [])],
  },
  context: {
    contextVersion: "1.0",
    environmentClassification: "test",
    deploymentClassification: "local",
    executionClassification: "service",
    correlationIdentity: "correlation",
  },
  requestedCapabilities: [identity("workflow-entry-capability"), identity("health-capability")],
});

const bindings = (overrides: Partial<ReferenceServerCapabilityBindings> = {}): ReferenceServerCapabilityBindings => ({
  workflowEntry: {
    dependency: { dependencyId: "workflow-entry-dependency", dependencyVersion: "1.0" },
    capability: workflowEntry,
  },
  health: {
    dependency: { dependencyId: "health-dependency", dependencyVersion: "1.0" },
    capability: health,
  },
  additional: [additional],
  ...overrides,
});

test("assembles all ready dependencies in deterministic order", () => {
  const result = new ReferenceServerComposition({ bindings: bindings() }).compose(input());
  assert.equal(result.status, "ready");
  assert.deepEqual(result.resolution.dependencies.map((value) => value.slotId), ["workflow-entry-slot", "health-slot", "audit-slot"]);
  assert.deepEqual(result.audit.entries.map((value) => value.sequence), [0, 1, 2, 3]);
  assert.ok(Object.isFrozen(result));
  assert.ok(result.status === "ready" && Object.isFrozen(result.capabilities));
});

test("projects unavailable when a required dependency is missing", () => {
  const result = new ReferenceServerComposition({ bindings: bindings({ workflowEntry: undefined }) }).compose(input());
  assert.equal(result.status, "unavailable");
  assert.equal(result.resolution.requiredDependencyFailure, true);
  assert.equal(result.resolution.dependencies[0]?.status, "missing");
});

test("omits a missing optional dependency and projects degraded", () => {
  const result = new ReferenceServerComposition({ bindings: bindings({ additional: [] }) }).compose(input());
  assert.equal(result.status, "degraded");
  assert.deepEqual(result.resolution.omittedOptionalSlotIds, ["audit-slot"]);
});

test("classifies incompatible dependencies without exposing an instance", () => {
  const incompatible = { ...workflowEntry, identity: identity("other-capability") };
  const result = new ReferenceServerComposition({
    bindings: bindings({ workflowEntry: { dependency: { dependencyId: "workflow-entry-dependency", dependencyVersion: "1.0" }, capability: incompatible } }),
  }).compose(input(false));
  assert.equal(result.status, "unavailable");
  assert.equal(result.resolution.dependencies[0]?.status, "incompatible");
});

test("rejects duplicate capability bindings", () => {
  const duplicate = { ...additional, identity: workflowEntry.identity };
  const result = new ReferenceServerComposition({ bindings: bindings({ additional: [duplicate] }) }).compose(input());
  assert.equal(result.status, "unavailable");
  assert.equal(result.status === "unavailable" ? result.failures[0]?.errorCode : undefined, "dependency-incompatible");
});

test("copies injected descriptors and returns isolated immutable snapshots", () => {
  const mutableRequests = ["start"] as ("start" | "resume")[];
  const source = bindings({ workflowEntry: { dependency: { dependencyId: "workflow-entry-dependency", dependencyVersion: "1.0" }, capability: { ...workflowEntry, supportedRequestClassifications: mutableRequests } } });
  const runtime = new ReferenceServerComposition({ bindings: source });
  mutableRequests.push("resume");
  const first = runtime.compose(input(false));
  const second = runtime.compose(input(false));
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.ok(first.status === "ready" && !first.capabilities.workflowEntry.supportedRequestClassifications.includes("resume"));
  assert.ok(Object.isFrozen(first));
});
