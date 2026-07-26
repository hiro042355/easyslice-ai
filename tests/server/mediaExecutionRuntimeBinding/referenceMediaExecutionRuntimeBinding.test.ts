import assert from "node:assert/strict";
import test from "node:test";
import { ReferenceMediaExecutionRuntimeBinding } from "../../../lib/server/mediaExecutionRuntimeBinding/referenceMediaExecutionRuntimeBinding";
import type {
  MediaExecutionCompositionDependencies,
  MediaExecutionCompositionInput,
} from "../../../lib/server/mediaExecutionComposition/types";

const input = (): MediaExecutionCompositionInput => ({
  inputVersion: "1.0",
  workspaceRequest: {
    requestVersion: "1.0",
    requestIdentity: "request-1",
    workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-1" },
    ownership: {
      projectionVersion: "1.0",
      authenticatedTenantReference: "tenant-1",
      workspaceTenantReference: "tenant-1",
      authenticatedOwnershipReference: "owner-1",
      workspaceOwnershipReference: "owner-1",
    },
    retention: { policyVersion: "1.0", classification: "request-scoped", cleanupRequired: true },
  },
  materializationRequest: {
    requestVersion: "1.0",
    requestIdentity: "request-1",
    operationIdentity: "operation-1",
    sourceArtifact: { referenceVersion: "1.0", opaqueSourceArtifactReference: "source-1" },
    workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-1" },
    materializedArtifact: {
      referenceVersion: "1.0",
      opaqueMaterializedArtifactReference: "input-1",
    },
    ownership: {
      projectionVersion: "1.0",
      authenticatedTenantReference: "tenant-1",
      requestTenantReference: "tenant-1",
      sourceTenantReference: "tenant-1",
      workspaceTenantReference: "tenant-1",
      authenticatedOwnershipReference: "owner-1",
      sourceOwnershipReference: "owner-1",
      workspaceOwnershipReference: "owner-1",
      operationOwnershipReference: "owner-1",
    },
    policy: { policyVersion: "1.0", collisionPolicy: "reject-existing" },
  },
  materializationContext: {
    contextVersion: "1.0",
    executionWorkspaceReference: "workspace-1",
    executionOperationIdentity: "operation-1",
  },
  ffmpegRequest: {
    requestVersion: "1.0",
    requestIdentity: "request-1",
    operationIdentity: "operation-1",
    command: { projectionVersion: "1.0", executable: "ffmpeg", argumentTokens: ["-i", "input-1"] },
    timeoutMilliseconds: 1_000,
  },
  packagingRequest: {
    requestVersion: "1.0",
    requestIdentity: "request-1",
    operationIdentity: "operation-1",
    outputs: [{ referenceVersion: "1.0", opaqueOutputArtifactReference: "output-1" }],
    archive: { referenceVersion: "1.0", opaqueArchiveReference: "archive-1" },
    namingPolicy: { policyVersion: "1.0", classification: "operation-identity" },
    collisionPolicy: { policyVersion: "1.0", classification: "reject-existing" },
  },
});

const dependencies = (): Readonly<{
  value: MediaExecutionCompositionDependencies;
  calls: string[];
}> => {
  const calls: string[] = [];
  return {
    calls,
    value: {
      workspace: {
        reserve: async () => {
          calls.push("reserve");
          return {
            decisionVersion: "1.0",
            classification: "available",
            reasonCode: "workspace-reserved",
            workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-1" },
            lifecycle: { lifecycleVersion: "1.0", state: "reserved" },
            cleanupClassification: "not-required",
            audit: { auditVersion: "1.0", entries: [] },
          };
        },
        prepare: async () => {
          calls.push("prepare");
          return {
            decisionVersion: "1.0",
            classification: "available",
            reasonCode: "workspace-prepared",
            workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-1" },
            lifecycle: { lifecycleVersion: "1.0", state: "prepared" },
            cleanupClassification: "not-required",
            audit: { auditVersion: "1.0", entries: [] },
          };
        },
        lookup: async () => { throw new Error("unused"); },
        cleanup: async () => {
          calls.push("cleanup");
          return {
            decisionVersion: "1.0",
            classification: "available",
            reasonCode: "workspace-cleaned",
            workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-1" },
            lifecycle: { lifecycleVersion: "1.0", state: "cleaned" },
            cleanupClassification: "completed",
            audit: { auditVersion: "1.0", entries: [] },
          };
        },
      },
      materialization: {
        materialize: async () => {
          calls.push("materialize");
          return {
            decisionVersion: "1.0",
            classification: "materialized",
            reasonCode: "materialization-completed",
            materializedArtifactAvailable: true,
            materializedArtifact: {
              referenceVersion: "1.0",
              opaqueMaterializedArtifactReference: "input-1",
            },
            retryClassification: "retry-not-required",
            audit: { auditVersion: "1.0", entries: [] },
          };
        },
      },
      ffmpeg: {
        execute: async () => {
          calls.push("ffmpeg");
          return {
            decisionVersion: "1.0",
            classification: "success",
            reasonCode: "process-completed",
            retryClassification: "retry-not-required",
            exitClassification: "zero",
            stdoutClassification: "empty",
            stderrClassification: "empty",
            audit: { auditVersion: "1.0", entries: [] },
          };
        },
      },
      packaging: {
        package: async () => {
          calls.push("package");
          return {
            decisionVersion: "1.0",
            classification: "packaged",
            reasonCode: "archive-created",
            archiveAvailable: true,
            archive: { referenceVersion: "1.0", opaqueArchiveReference: "archive-1" },
            archiveBytes: new Uint8Array([1, 2, 3]),
            outputCount: 1,
            retryClassification: "retry-not-required",
            audit: { auditVersion: "1.0", entries: [] },
          };
        },
      },
    },
  };
};

test("binds four capabilities without executing and returns a new instance per call", async () => {
  const fixture = dependencies();
  const binding = new ReferenceMediaExecutionRuntimeBinding();
  const one = binding.createComposition(fixture.value);
  const two = binding.createComposition(fixture.value);
  assert.equal(one.status, "bound");
  assert.equal(two.status, "bound");
  assert.deepEqual(fixture.calls, []);
  if (one.status !== "bound" || two.status !== "bound") return;
  assert.notStrictEqual(one.composition, two.composition);
  assert.ok(Object.isFrozen(one));
  assert.ok(Object.isFrozen(one.audit));
  assert.ok(Object.isFrozen(one.audit.entries));
  assert.deepEqual(one.audit.entries.map((entry) => entry.sequence), [0, 1, 2]);
  assert.deepEqual(one.audit, two.audit);

  const decision = await one.composition.execute(input());
  assert.equal(decision.classification, "completed");
  assert.deepEqual(decision.responseArchive, new Uint8Array([1, 2, 3]));
  assert.deepEqual(fixture.calls, [
    "reserve",
    "prepare",
    "materialize",
    "ffmpeg",
    "package",
    "cleanup",
  ]);
});

test("parallel creation isolates instances and leaves dependencies unchanged", async () => {
  const fixture = dependencies();
  const before = {
    workspace: fixture.value.workspace,
    materialization: fixture.value.materialization,
    ffmpeg: fixture.value.ffmpeg,
    packaging: fixture.value.packaging,
  };
  const binding = new ReferenceMediaExecutionRuntimeBinding();
  const results = await Promise.all(
    Array.from({ length: 4 }, async () => binding.createComposition(fixture.value)),
  );
  assert.ok(results.every((result) => result.status === "bound"));
  const compositions = results
    .filter((result) => result.status === "bound")
    .map((result) => result.composition);
  assert.equal(new Set(compositions).size, 4);
  assert.deepEqual(fixture.calls, []);
  assert.strictEqual(fixture.value.workspace, before.workspace);
  assert.strictEqual(fixture.value.materialization, before.materialization);
  assert.strictEqual(fixture.value.ffmpeg, before.ffmpeg);
  assert.strictEqual(fixture.value.packaging, before.packaging);
});

test("rejects missing dependencies deterministically", () => {
  const value = dependencies().value;
  const cases = [
    [{ ...value, workspace: undefined }, "missing-workspace"],
    [{ ...value, materialization: undefined }, "missing-materialization"],
    [{ ...value, ffmpeg: undefined }, "missing-ffmpeg"],
    [{ ...value, packaging: undefined }, "missing-packaging"],
  ] as const;
  const binding = new ReferenceMediaExecutionRuntimeBinding();
  for (const [candidate, classification] of cases) {
    const result = binding.createComposition(candidate);
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") assert.equal(result.classification, classification);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.audit.entries));
  }
});

test("rejects malformed capabilities and safely normalizes access failures", () => {
  const value = dependencies().value;
  const malformed = new ReferenceMediaExecutionRuntimeBinding().createComposition({
    ...value,
    packaging: {},
  });
  assert.equal(malformed.status, "rejected");
  if (malformed.status === "rejected") assert.equal(malformed.classification, "invalid-dependency");

  const privateMessage = "raw-private-construction-secret";
  const throwing = new Proxy({}, {
    get: () => { throw new Error(privateMessage); },
  });
  const unexpected = new ReferenceMediaExecutionRuntimeBinding().createComposition(throwing);
  assert.equal(unexpected.status, "rejected");
  if (unexpected.status === "rejected") assert.equal(unexpected.classification, "unexpected-failure");
  assert.doesNotMatch(JSON.stringify(unexpected), /raw-private-construction-secret/);
  assert.doesNotMatch(JSON.stringify(unexpected), /workspace|materialization|ffmpeg|packaging/);
});

test("permits duplicate dependency object identity without wrapping capabilities", () => {
  const shared = {
    reserve: async () => { throw new Error("not executed"); },
    prepare: async () => { throw new Error("not executed"); },
    lookup: async () => { throw new Error("not executed"); },
    cleanup: async () => { throw new Error("not executed"); },
    materialize: async () => { throw new Error("not executed"); },
    execute: async () => { throw new Error("not executed"); },
    package: async () => { throw new Error("not executed"); },
  };
  const result = new ReferenceMediaExecutionRuntimeBinding().createComposition({
    workspace: shared,
    materialization: shared,
    ffmpeg: shared,
    packaging: shared,
  });
  assert.equal(result.status, "bound");
});
