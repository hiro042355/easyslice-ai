import assert from "node:assert/strict";
import test from "node:test";
import {
  ReferenceMediaExecutionAdapter,
  type MediaExecutionCapabilitySet,
} from "../../../lib/server/mediaExecution/referenceMediaExecutionAdapter";
import type { MediaExecutionInput } from "../../../lib/server/mediaExecution/types";
import type { MediaOperationClassification } from "../../../lib/server/mediaOperation/types";

const input = (
  operation: MediaOperationClassification = "clip-generation",
  packagingRequired = operation === "zip-export",
): MediaExecutionInput => ({
  inputVersion: "1.0",
  request: {
    requestVersion: "1.0", requestIdentity: "request-1", operationIdentity: "operation-1",
    operation, packagingRequired,
    inputArtifacts: [{ referenceVersion: "1.0", opaqueInputArtifactReference: "input-1", ownershipReference: "owner-1" }],
  },
  context: {
    contextVersion: "1.0", authenticatedTenantReference: "tenant-1", executionTenantReference: "tenant-1",
    authenticatedWorkspaceReference: "workspace-1", executionWorkspaceReference: "workspace-1",
    authenticatedOwnershipReference: "owner-1", operationOwnershipReference: "owner-1",
  },
  policy: {
    policyVersion: "1.0",
    allowedOperations: ["clip-generation", "clip-export", "zip-export", "preview-generation"],
    maximumInputArtifacts: 2,
    cancellation: { projectionVersion: "1.0", classification: "active" },
    timeout: { projectionVersion: "1.0", classification: "within-policy" },
  },
});

const capabilities = (overrides: Partial<MediaExecutionCapabilitySet> = {}) => {
  const calls = { workspace: 0, materialization: 0, process: 0, packaging: 0, cleanup: 0 };
  const value: MediaExecutionCapabilitySet = {
    workspace: { prepareWorkspace: async () => {
      calls.workspace += 1;
      return { status: "completed", workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-ref-1", ownershipReference: "owner-1" } };
    } },
    materialization: { materializeInput: async () => {
      calls.materialization += 1;
      return { status: "completed", artifacts: [{ referenceVersion: "1.0", opaqueInputArtifactReference: "materialized-1", ownershipReference: "owner-1" }] };
    } },
    process: { executeMediaOperation: async () => {
      calls.process += 1;
      return { status: "completed", outputs: [{ referenceVersion: "1.0", opaqueOutputArtifactReference: "output-1", ownershipReference: "owner-1" }], cleanupRequired: true };
    } },
    packaging: { packageArtifacts: async () => {
      calls.packaging += 1;
      return { status: "completed", packageArtifact: { referenceVersion: "1.0", opaquePackageArtifactReference: "package-1", ownershipReference: "owner-1" } };
    } },
    cleanup: { cleanupExecution: async () => { calls.cleanup += 1; return { status: "completed" }; } },
    ...overrides,
  };
  return { calls, value };
};

test("executes all operation classifications in deterministic stage order", async () => {
  for (const operation of ["clip-generation", "clip-export", "zip-export", "preview-generation"] as const) {
    const deps = capabilities();
    const actual = await new ReferenceMediaExecutionAdapter(deps.value).execute(input(operation));
    assert.equal(actual.classification, "completed");
    assert.deepEqual(deps.calls, {
      workspace: 1, materialization: 1, process: 1,
      packaging: operation === "zip-export" ? 1 : 0, cleanup: 1,
    });
    assert.deepEqual(actual.audit.entries.map((entry) => entry.stage),
      operation === "zip-export"
        ? ["workspace-prepare", "input-materialize", "media-process", "package-output", "collect-output", "cleanup"]
        : ["workspace-prepare", "input-materialize", "media-process", "collect-output", "cleanup"]);
  }
});

test("invalid, ownership, policy, cancellation, and timeout stop before capabilities", async () => {
  const cases: MediaExecutionInput[] = [
    { ...input(), request: { ...input().request, requestIdentity: "" } },
    { ...input(), context: { ...input().context, executionTenantReference: "other" } },
    { ...input(), policy: { ...input().policy, allowedOperations: [] } },
    { ...input(), policy: { ...input().policy, cancellation: { projectionVersion: "1.0", classification: "cancelled" } } },
    { ...input(), policy: { ...input().policy, timeout: { projectionVersion: "1.0", classification: "timed-out" } } },
  ];
  const expected = ["invalid", "rejected", "rejected", "cancelled", "timed-out"];
  for (let index = 0; index < cases.length; index += 1) {
    const deps = capabilities();
    const actual = await new ReferenceMediaExecutionAdapter(deps.value).execute(cases[index]!);
    assert.equal(actual.classification, expected[index]);
    assert.deepEqual(Object.values(deps.calls), [0, 0, 0, 0, 0]);
  }
});

test("short-circuits workspace, materialization, process, and packaging failures", async () => {
  const workspace = capabilities({ workspace: { prepareWorkspace: async () => ({ status: "unavailable", reasonCode: "workspace-failure" }) } });
  assert.equal((await new ReferenceMediaExecutionAdapter(workspace.value).execute(input())).classification, "unavailable");
  assert.deepEqual(Object.values(workspace.calls), [0, 0, 0, 0, 0]);

  const materialization = capabilities({ materialization: { materializeInput: async () => ({ status: "rejected", reasonCode: "materialization-failure" }) } });
  assert.equal((await new ReferenceMediaExecutionAdapter(materialization.value).execute(input())).classification, "rejected");
  assert.equal(materialization.calls.process, 0);
  assert.equal(materialization.calls.packaging, 0);

  for (const status of ["failed", "unavailable", "cancelled", "timed-out"] as const) {
    const process = capabilities({ process: { executeMediaOperation: async () => ({ status, reasonCode: "process-failure", cleanupRequired: true }) } });
    assert.equal((await new ReferenceMediaExecutionAdapter(process.value).execute(input())).classification, status);
    assert.equal(process.calls.packaging, 0);
    assert.equal(process.calls.cleanup, 1);
  }
  const packaging = capabilities({ packaging: { packageArtifacts: async () => ({ status: "failed", reasonCode: "packaging-failure" }) } });
  assert.equal((await new ReferenceMediaExecutionAdapter(packaging.value).execute(input("zip-export"))).classification, "failed");
  assert.equal(packaging.calls.cleanup, 1);
});

test("cleanup failure never overwrites the main result", async () => {
  for (const status of ["failed", "unavailable"] as const) {
    const deps = capabilities({ cleanup: { cleanupExecution: async () => ({ status, reasonCode: "cleanup-failure" }) } });
    const actual = await new ReferenceMediaExecutionAdapter(deps.value).execute(input());
    assert.equal(actual.classification, "completed");
    assert.equal(actual.cleanupClassification, status);
    assert.equal(actual.audit.entries.at(-1)?.reasonCode, "cleanup-failure");
  }
});

test("rejects mismatched capability-owned references without identifier disclosure", async () => {
  const deps = capabilities({
    process: { executeMediaOperation: async () => ({
      status: "completed",
      outputs: [{ referenceVersion: "1.0", opaqueOutputArtifactReference: "secret-output", ownershipReference: "other-owner" }],
      cleanupRequired: true,
    }) },
  });
  const actual = await new ReferenceMediaExecutionAdapter(deps.value).execute(input());
  assert.equal(actual.classification, "rejected");
  assert.equal(actual.reasonCode, "ownership-mismatch");
  assert.equal(JSON.stringify(actual).includes("secret-output"), false);
  assert.equal(deps.calls.packaging, 0);
  assert.equal(deps.calls.cleanup, 1);
});

test("normalizes dependency throws and preserves safe retry classifications", async () => {
  const secret = "C:/secret stderr ffmpeg command";
  const deps = capabilities({ process: { executeMediaOperation: async () => { throw new Error(secret); } } });
  const actual = await new ReferenceMediaExecutionAdapter(deps.value).execute(input());
  assert.equal(actual.classification, "unavailable");
  assert.equal(actual.retryClassification, "retry-safe");
  assert.equal(JSON.stringify(actual).includes(secret), false);
  const cancelled = await new ReferenceMediaExecutionAdapter(capabilities().value).execute({
    ...input(), policy: { ...input().policy, cancellation: { projectionVersion: "1.0", classification: "cancelled" } },
  });
  assert.equal(cancelled.retryClassification, "retry-requires-new-request");
});

test("results are deeply frozen, deterministic, copy isolated, and audit-safe", async () => {
  const runtime = new ReferenceMediaExecutionAdapter(capabilities().value);
  const first = await runtime.execute(input());
  const second = await runtime.execute(input());
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.outputArtifacts), true);
  assert.equal(Object.isFrozen(first.audit.entries), true);
  const audit = JSON.stringify(first.audit).toLowerCase();
  for (const forbidden of ["workspace-ref", "output-1", "input-1", "tenant-1", "owner-1", "path", "command", "stderr", "stdout", "stack"])
    assert.equal(audit.includes(forbidden), false, forbidden);
});
