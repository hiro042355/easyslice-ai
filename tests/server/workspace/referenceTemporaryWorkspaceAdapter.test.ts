import assert from "node:assert/strict";
import test from "node:test";
import { ReferenceTemporaryWorkspaceAdapter } from "../../../lib/server/workspace/referenceTemporaryWorkspaceAdapter";
import type { WorkspacePreparationRequest } from "../../../lib/server/workspace/types";

const request = (reference = "workspace-ref-1"): WorkspacePreparationRequest => ({
  requestVersion: "1.0", requestIdentity: "request-1",
  workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: reference },
  ownership: {
    projectionVersion: "1.0", authenticatedTenantReference: "tenant-1",
    workspaceTenantReference: "tenant-1", authenticatedOwnershipReference: "owner-1",
    workspaceOwnershipReference: "owner-1",
  },
  retention: { policyVersion: "1.0", classification: "request-scoped", cleanupRequired: true },
});
const filesystem = (failCleanup = false) => {
  const calls = { mkdir: [] as string[], rm: [] as string[] };
  return {
    calls,
    value: {
      mkdir: async (location: string) => { calls.mkdir.push(location); },
      rm: async (location: string) => { calls.rm.push(location); if (failCleanup) throw new Error("raw-path-secret"); },
    },
  };
};

test("reserves, prepares, looks up, and cleans a workspace", async () => {
  const fs = filesystem();
  const adapter = new ReferenceTemporaryWorkspaceAdapter({ root: "internal-root", filesystem: fs.value });
  assert.equal((await adapter.reserve(request())).lifecycle.state, "reserved");
  assert.equal((await adapter.prepare(request())).lifecycle.state, "prepared");
  assert.equal((await adapter.lookup(request())).lifecycle.state, "active");
  const cleaned = await adapter.cleanup(request());
  assert.equal(cleaned.lifecycle.state, "cleaned");
  assert.equal(cleaned.cleanupClassification, "completed");
  assert.equal(fs.calls.mkdir.length, 1);
  assert.equal(fs.calls.rm.length, 1);
});

test("rejects dangerous opaque references without filesystem side effects or disclosure", async () => {
  const dangerous = [
    "..", "/", "\\", "C:", "bad\u0000reference", "%2F", "%5C",
    "/tmp/workspace", "C:\\temp\\workspace", "\\\\server\\share",
  ];
  for (const raw of dangerous) {
    const fs = filesystem();
    const adapter = new ReferenceTemporaryWorkspaceAdapter({ root: "internal-root", filesystem: fs.value });
    const actual = await adapter.reserve(request(raw));
    assert.equal(actual.classification, "rejected");
    assert.equal(actual.reasonCode, "workspace-invalid");
    assert.equal(JSON.stringify(actual).includes(raw), false);
    assert.deepEqual(fs.calls, { mkdir: [], rm: [] });
  }
});

test("observes cleanup-required while cleanup is in progress", async () => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const adapter = new ReferenceTemporaryWorkspaceAdapter({
    root: "root",
    filesystem: { mkdir: async () => {}, rm: async () => pending },
  });
  await adapter.reserve(request());
  await adapter.prepare(request());
  const cleanup = adapter.cleanup(request());
  assert.equal((await adapter.lookup(request())).lifecycle.state, "cleanup-required");
  release();
  assert.equal((await cleanup).lifecycle.state, "cleaned");
});

test("rejects invalid lifecycle transitions without excess filesystem effects", async () => {
  const fs = filesystem();
  const adapter = new ReferenceTemporaryWorkspaceAdapter({ root: "root", filesystem: fs.value });
  await adapter.reserve(request());
  await adapter.prepare(request());
  assert.equal((await adapter.prepare(request())).classification, "rejected");
  await adapter.lookup(request());
  await adapter.cleanup(request());
  assert.equal((await adapter.prepare(request())).classification, "rejected");
  assert.equal((await adapter.lookup(request())).lifecycle.state, "cleaned");
  assert.equal((await adapter.cleanup(request())).classification, "rejected");
  assert.equal(fs.calls.mkdir.length, 1);
  assert.equal(fs.calls.rm.length, 1);

  const failedFs = { mkdir: async () => { throw new Error("hidden"); }, rm: async () => {} };
  const failed = new ReferenceTemporaryWorkspaceAdapter({ root: "root", filesystem: failedFs });
  await failed.reserve(request("failed-ref"));
  assert.equal((await failed.prepare(request("failed-ref"))).lifecycle.state, "failed");
  assert.equal((await failed.lookup(request("failed-ref"))).lifecycle.state, "failed");
});

test("rejects duplicates, invalid input, unsupported policy, and ownership mismatch", async () => {
  const fs = filesystem();
  const adapter = new ReferenceTemporaryWorkspaceAdapter({ root: "internal-root", filesystem: fs.value });
  await adapter.reserve(request());
  assert.equal((await adapter.reserve(request())).reasonCode, "workspace-duplicate");
  assert.equal((await adapter.reserve({ ...request("other"), requestIdentity: "" })).reasonCode, "workspace-invalid");
  assert.equal((await adapter.reserve({ ...request("other"), retention: { ...request().retention, classification: "bad" as never } })).reasonCode, "workspace-invalid");
  const mismatch = await adapter.reserve({
    ...request("other"), ownership: { ...request().ownership, workspaceOwnershipReference: "other" },
  });
  assert.equal(mismatch.reasonCode, "workspace-ownership-mismatch");
  assert.equal(JSON.stringify(mismatch).includes("other"), false);
  assert.equal(fs.calls.mkdir.length, 0);
});

test("cleanup failure preserves the main workspace state and is audit-safe", async () => {
  const fs = filesystem(true);
  const adapter = new ReferenceTemporaryWorkspaceAdapter({ root: "secret-root", filesystem: fs.value });
  await adapter.reserve(request());
  await adapter.prepare(request());
  const actual = await adapter.cleanup(request());
  assert.equal(actual.lifecycle.state, "prepared");
  assert.equal(actual.cleanupClassification, "failed");
  assert.equal(actual.audit.entries[0]?.reasonCode, "cleanup-failure");
  assert.equal(JSON.stringify(actual).includes("secret-root"), false);
  assert.equal(JSON.stringify(actual).includes("raw-path-secret"), false);
});

test("decisions are deterministic, deeply frozen, and copy isolated", async () => {
  const firstAdapter = new ReferenceTemporaryWorkspaceAdapter({ root: "root", filesystem: filesystem().value });
  const secondAdapter = new ReferenceTemporaryWorkspaceAdapter({ root: "root", filesystem: filesystem().value });
  const first = await firstAdapter.reserve(request());
  const second = await secondAdapter.reserve(request());
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.audit.entries), true);
});
