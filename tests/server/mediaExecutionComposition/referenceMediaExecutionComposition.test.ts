import assert from "node:assert/strict";
import test from "node:test";
import { ReferenceMediaExecutionComposition } from "../../../lib/server/mediaExecutionComposition/referenceMediaExecutionComposition";
import type {
  MediaExecutionCompositionDependencies,
  MediaExecutionCompositionInput,
} from "../../../lib/server/mediaExecutionComposition/types";

const input = (): MediaExecutionCompositionInput => ({
  inputVersion: "1.0",
  workspaceRequest: {
    requestVersion: "1.0", requestIdentity: "request-1",
    workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-1" },
    ownership: {
      projectionVersion: "1.0",
      authenticatedTenantReference: "tenant-1", workspaceTenantReference: "tenant-1",
      authenticatedOwnershipReference: "owner-1", workspaceOwnershipReference: "owner-1",
    },
    retention: { policyVersion: "1.0", classification: "request-scoped", cleanupRequired: true },
  },
  materializationRequest: {
    requestVersion: "1.0", requestIdentity: "request-1", operationIdentity: "operation-1",
    sourceArtifact: { referenceVersion: "1.0", opaqueSourceArtifactReference: "source-1" },
    workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-1" },
    materializedArtifact: { referenceVersion: "1.0", opaqueMaterializedArtifactReference: "input-1" },
    ownership: {
      projectionVersion: "1.0",
      authenticatedTenantReference: "tenant-1", requestTenantReference: "tenant-1",
      sourceTenantReference: "tenant-1", workspaceTenantReference: "tenant-1",
      authenticatedOwnershipReference: "owner-1", sourceOwnershipReference: "owner-1",
      workspaceOwnershipReference: "owner-1", operationOwnershipReference: "owner-1",
    },
    policy: { policyVersion: "1.0", collisionPolicy: "reject-existing" },
  },
  materializationContext: {
    contextVersion: "1.0", executionWorkspaceReference: "workspace-1",
    executionOperationIdentity: "operation-1",
  },
  ffmpegRequest: {
    requestVersion: "1.0", requestIdentity: "request-1", operationIdentity: "operation-1",
    command: { projectionVersion: "1.0", executable: "ffmpeg", argumentTokens: ["-i", "input-1"] },
    timeoutMilliseconds: 1_000,
  },
  packagingRequest: {
    requestVersion: "1.0", requestIdentity: "request-1", operationIdentity: "operation-1",
    outputs: [{ referenceVersion: "1.0", opaqueOutputArtifactReference: "output-1" }],
    archive: { referenceVersion: "1.0", opaqueArchiveReference: "archive-1" },
    namingPolicy: { policyVersion: "1.0", classification: "operation-identity" },
    collisionPolicy: { policyVersion: "1.0", classification: "reject-existing" },
  },
});

const dependencies = (
  overrides: Partial<MediaExecutionCompositionDependencies> = {},
) => {
  const calls: string[] = [];
  const value: MediaExecutionCompositionDependencies = {
    workspace: {
      reserve: async () => {
        calls.push("reserve");
        return {
          decisionVersion: "1.0", classification: "available", reasonCode: "workspace-reserved",
          workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-1" },
          lifecycle: { lifecycleVersion: "1.0", state: "reserved" },
          cleanupClassification: "not-required",
          audit: { auditVersion: "1.0", entries: [] },
        };
      },
      prepare: async () => {
        calls.push("prepare");
        return {
          decisionVersion: "1.0", classification: "available", reasonCode: "workspace-prepared",
          workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-1" },
          lifecycle: { lifecycleVersion: "1.0", state: "prepared" },
          cleanupClassification: "not-required",
          audit: { auditVersion: "1.0", entries: [] },
        };
      },
      lookup: async () => { throw new Error("not used"); },
      cleanup: async () => {
        calls.push("cleanup");
        return {
          decisionVersion: "1.0", classification: "available", reasonCode: "workspace-cleaned",
          workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-1" },
          lifecycle: { lifecycleVersion: "1.0", state: "cleaned" },
          cleanupClassification: "completed",
          audit: { auditVersion: "1.0", entries: [] },
        };
      },
    },
    materialization: { materialize: async () => {
      calls.push("materialize");
      return {
        decisionVersion: "1.0", classification: "materialized",
        reasonCode: "materialization-completed", materializedArtifactAvailable: true,
        materializedArtifact: { referenceVersion: "1.0", opaqueMaterializedArtifactReference: "input-1" },
        retryClassification: "retry-not-required",
        audit: { auditVersion: "1.0", entries: [] },
      };
    } },
    ffmpeg: { execute: async () => {
      calls.push("ffmpeg");
      return {
        decisionVersion: "1.0", classification: "success", reasonCode: "process-completed",
        retryClassification: "retry-not-required", exitClassification: "zero",
        stdoutClassification: "empty", stderrClassification: "empty",
        audit: { auditVersion: "1.0", entries: [] },
      };
    } },
    packaging: { package: async () => {
      calls.push("package");
      return {
        decisionVersion: "1.0", classification: "packaged", reasonCode: "archive-created",
        archiveAvailable: true, archive: { referenceVersion: "1.0", opaqueArchiveReference: "archive-1" },
        archiveBytes: new Uint8Array([1, 2, 3]),
        outputCount: 1, retryClassification: "retry-not-required",
        audit: { auditVersion: "1.0", entries: [] },
      };
    } },
    ...overrides,
  };
  return { calls, value };
};

test("executes capabilities in deterministic order and owns archive bytes before cleanup", async () => {
  const deps = dependencies();
  const decision = await new ReferenceMediaExecutionComposition(deps.value).execute(input());
  assert.equal(decision.classification, "completed");
  assert.equal(decision.cleanupClassification, "completed");
  assert.deepEqual([...decision.responseArchive!], [1, 2, 3]);
  assert.deepEqual(deps.calls, ["reserve", "prepare", "materialize", "ffmpeg", "package", "cleanup"]);
  assert.deepEqual(decision.audit.entries.map((entry) => entry.sequence), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(Object.isFrozen(decision));
  assert.ok(Object.isFrozen(decision.audit));
  assert.ok(Object.isFrozen(decision.audit.entries));
});

test("normalizes stage failures and always cleans an acquired workspace", async () => {
  const cases = [
    {
      stage: "materialize",
      override: { materialization: { materialize: async () => ({
        decisionVersion: "1.0" as const, classification: "failed" as const,
        reasonCode: "copy-failed" as const, materializedArtifactAvailable: false,
        retryClassification: "retry-external-policy" as const,
        audit: { auditVersion: "1.0" as const, entries: [] },
      }) } },
      expected: "materialization-failed",
    },
    {
      stage: "ffmpeg",
      override: { ffmpeg: { execute: async () => ({
        decisionVersion: "1.0" as const, classification: "failed" as const,
        reasonCode: "process-exit-failure" as const, retryClassification: "retry-external-policy" as const,
        exitClassification: "non-zero" as const, stdoutClassification: "empty" as const,
        stderrClassification: "present" as const, audit: { auditVersion: "1.0" as const, entries: [] },
      }) } },
      expected: "ffmpeg-failed",
    },
    {
      stage: "package",
      override: { packaging: { package: async () => ({
        decisionVersion: "1.0" as const, classification: "failed" as const,
        reasonCode: "archive-build-failed" as const, archiveAvailable: false,
        outputCount: 1, retryClassification: "retry-external-policy" as const,
        audit: { auditVersion: "1.0" as const, entries: [] },
      }) } },
      expected: "packaging-failed",
    },
  ] as const;
  for (const fixture of cases) {
    const deps = dependencies(fixture.override);
    const decision = await new ReferenceMediaExecutionComposition(deps.value).execute(input());
    assert.equal(decision.reasonCode, fixture.expected);
    assert.equal(deps.calls.at(-1), "cleanup", fixture.stage);
    assert.equal(decision.responseArchive, undefined);
  }
});

test("preserves primary success and failure when cleanup fails", async () => {
  const failedCleanup = {
    cleanup: async () => ({
      decisionVersion: "1.0" as const, classification: "available" as const,
      reasonCode: "workspace-prepared" as const,
      workspace: { referenceVersion: "1.0" as const, opaqueWorkspaceReference: "workspace-1" },
      lifecycle: { lifecycleVersion: "1.0" as const, state: "prepared" as const },
      cleanupClassification: "failed" as const,
      audit: { auditVersion: "1.0" as const, entries: [] },
    }),
  };
  const success = dependencies({ workspace: { ...dependencies().value.workspace, ...failedCleanup } });
  const successDecision = await new ReferenceMediaExecutionComposition(success.value).execute(input());
  assert.equal(successDecision.classification, "completed");
  assert.equal(successDecision.cleanupClassification, "failed");

  const timeout = dependencies({
    workspace: { ...dependencies().value.workspace, ...failedCleanup },
    ffmpeg: { execute: async () => ({
      decisionVersion: "1.0", classification: "timeout", reasonCode: "process-timed-out",
      retryClassification: "retry-safe", exitClassification: "not-observed",
      stdoutClassification: "empty", stderrClassification: "empty",
      audit: { auditVersion: "1.0", entries: [] },
    }) },
  });
  const timeoutDecision = await new ReferenceMediaExecutionComposition(timeout.value).execute(input());
  assert.equal(timeoutDecision.classification, "timed-out");
  assert.equal(timeoutDecision.reasonCode, "ffmpeg-failed");
  assert.equal(timeoutDecision.cleanupClassification, "failed");
});

test("projects cancellation, validates dependencies, and isolates response copies", async () => {
  const cancelled = dependencies({
    ffmpeg: { execute: async () => ({
      decisionVersion: "1.0", classification: "cancelled", reasonCode: "process-cancelled",
      retryClassification: "retry-not-allowed", exitClassification: "not-observed",
      stdoutClassification: "empty", stderrClassification: "empty",
      audit: { auditVersion: "1.0", entries: [] },
    }) },
  });
  const cancelledDecision = await new ReferenceMediaExecutionComposition(cancelled.value).execute(input());
  assert.equal(cancelledDecision.classification, "cancelled");
  assert.equal(cancelled.calls.at(-1), "cleanup");

  const missing = await new ReferenceMediaExecutionComposition({}).execute(input());
  assert.equal(missing.classification, "invalid");
  assert.equal(missing.reasonCode, "dependency-missing");

  const first = dependencies();
  const firstDecision = await new ReferenceMediaExecutionComposition(first.value).execute(input());
  firstDecision.responseArchive![0] = 9;
  const second = dependencies();
  const secondDecision = await new ReferenceMediaExecutionComposition(second.value).execute(input());
  assert.deepEqual([...secondDecision.responseArchive!], [1, 2, 3]);
});

test("copies packaging bytes before cleanup and rejects missing bytes as packaging failure", async () => {
  const source = new Uint8Array([4, 5, 6]);
  let snapshotAtCleanup: number[] | undefined;
  const baseline = dependencies();
  const copied = dependencies({
    workspace: {
      ...baseline.value.workspace,
      cleanup: async () => {
        source[0] = 99;
        snapshotAtCleanup = [...source];
        return {
          decisionVersion: "1.0", classification: "available", reasonCode: "workspace-cleaned",
          workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-1" },
          lifecycle: { lifecycleVersion: "1.0", state: "cleaned" },
          cleanupClassification: "completed", audit: { auditVersion: "1.0", entries: [] },
        };
      },
    },
    packaging: { package: async () => ({
      decisionVersion: "1.0",
      classification: "packaged",
      reasonCode: "archive-created",
      archiveAvailable: true,
      archive: { referenceVersion: "1.0", opaqueArchiveReference: "archive-1" },
      archiveBytes: source,
      outputCount: 1,
      retryClassification: "retry-not-required",
      audit: { auditVersion: "1.0", entries: [] },
    }) },
  });
  const decision = await new ReferenceMediaExecutionComposition(copied.value).execute(input());
  assert.deepEqual(snapshotAtCleanup, [99, 5, 6]);
  assert.deepEqual(decision.responseArchive, new Uint8Array([4, 5, 6]));
  assert.notStrictEqual(decision.responseArchive, source);

  const missingBytes = dependencies({
    packaging: { package: async () => ({
      decisionVersion: "1.0",
      classification: "packaged",
      reasonCode: "archive-created",
      archiveAvailable: true,
      archive: { referenceVersion: "1.0", opaqueArchiveReference: "archive-1" },
      outputCount: 1,
      retryClassification: "retry-not-required",
      audit: { auditVersion: "1.0", entries: [] },
    }) },
  });
  const failed = await new ReferenceMediaExecutionComposition(missingBytes.value).execute(input());
  assert.equal(failed.classification, "failed");
  assert.equal(failed.reasonCode, "packaging-failed");
  assert.equal(missingBytes.calls.at(-1), "cleanup");
});

test("stops on missing workspace and safely normalizes cleanup exceptions", async () => {
  const missingWorkspace = dependencies({
    workspace: {
      ...dependencies().value.workspace,
      reserve: async () => ({
        decisionVersion: "1.0",
        classification: "not-found",
        reasonCode: "workspace-not-found",
        lifecycle: { lifecycleVersion: "1.0", state: "failed" },
        cleanupClassification: "not-required",
        audit: { auditVersion: "1.0", entries: [] },
      }),
    },
  });
  const missingDecision = await new ReferenceMediaExecutionComposition(
    missingWorkspace.value,
  ).execute(input());
  assert.equal(missingDecision.classification, "unavailable");
  assert.equal(missingDecision.reasonCode, "workspace-unavailable");
  assert.equal(missingWorkspace.calls.length, 0);

  const cleanupThrows = dependencies({
    workspace: {
      ...dependencies().value.workspace,
      cleanup: async () => { throw new Error("private filesystem failure"); },
    },
  });
  const completed = await new ReferenceMediaExecutionComposition(
    cleanupThrows.value,
  ).execute(input());
  assert.equal(completed.classification, "completed");
  assert.equal(completed.cleanupClassification, "unavailable");
  assert.equal(JSON.stringify(completed).includes("private filesystem failure"), false);
});
