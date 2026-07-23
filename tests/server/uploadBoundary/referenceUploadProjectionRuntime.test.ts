import assert from "node:assert/strict";
import test from "node:test";
import { ReferenceUploadProjectionRuntime } from "../../../lib/server/uploadBoundary/referenceUploadProjectionRuntime";
import type { OpaqueUploadReference, UploadProjectionInput } from "../../../lib/server/uploadBoundary/types";

const reference = (overrides: Partial<OpaqueUploadReference> = {}): OpaqueUploadReference => ({
  referenceVersion: "1.0", referenceKind: "uploaded-object", opaqueReferenceId: "upload-ref-1",
  sourceClassification: "browser-upload", mediaClassification: "video", tenantReference: "tenant-1",
  workspaceReference: "workspace-1", ownershipReference: "owner-1", lifecycleClassification: "available",
  metadata: { metadataVersion: "1.0", contentLengthClassification: "large", declaredMediaClassification: "video" },
  integrity: { integrityVersion: "1.0", integrityPresent: true, integrityVerified: true, algorithmClassification: "sha256", contentLengthVerified: true, mediaTypeVerified: true },
  ...overrides,
});
const input = (uploads: readonly OpaqueUploadReference[] = [reference()]): UploadProjectionInput => ({
  inputVersion: "1.0", requestIdentity: "request-1", authenticatedTenantReference: "tenant-1",
  requestedWorkspaceReference: "workspace-1", authenticatedOwnershipReference: "owner-1",
  acceptedMediaClassifications: ["video"], uploadReferences: uploads,
});

test("projects a valid available video reference with exactly one capability invocation", async () => {
  let calls = 0;
  const runtime = new ReferenceUploadProjectionRuntime({ resolve: async () => { calls += 1; return { status: "resolved" }; } });
  const actual = await runtime.project(input());
  assert.equal(calls, 1);
  assert.equal(actual.status, "projected");
  if (actual.status === "projected") {
    assert.equal(actual.context.uploads[0]?.opaqueReferenceId, "upload-ref-1");
    assert.equal(Object.isFrozen(actual.context.uploads[0]), true);
  }
});

test("maps lifecycle classifications before dependency invocation", async () => {
  let calls = 0;
  const runtime = new ReferenceUploadProjectionRuntime({ resolve: async () => { calls += 1; return { status: "resolved" }; } });
  const cases = [
    ["pending", "pending", "upload-pending"], ["expired", "rejected", "upload-expired"],
    ["deleted", "rejected", "upload-deleted"], ["quarantined", "rejected", "upload-quarantined"],
    ["unavailable", "unavailable", "upload-unavailable"],
  ] as const;
  for (const [lifecycle, status, reasonCode] of cases) {
    const actual = await runtime.project(input([reference({ lifecycleClassification: lifecycle })]));
    assert.equal(actual.status, status);
    assert.equal(actual.reasonCode, reasonCode);
  }
  assert.equal(calls, 0);
});

test("rejects unsupported media and ownership mismatch without invocation", async () => {
  let calls = 0;
  const runtime = new ReferenceUploadProjectionRuntime({ resolve: async () => { calls += 1; return { status: "resolved" }; } });
  assert.equal((await runtime.project(input([reference({ mediaClassification: "audio", metadata: { ...reference().metadata, declaredMediaClassification: "audio" } })]))).status, "rejected");
  assert.equal((await runtime.project(input([reference({ tenantReference: "tenant-2" })]))).status, "rejected");
  assert.equal((await runtime.project(input([reference({ workspaceReference: "workspace-2" })]))).status, "rejected");
  assert.equal(calls, 0);
});

test("malformed and duplicate references are invalid without invocation", async () => {
  let calls = 0;
  const runtime = new ReferenceUploadProjectionRuntime({ resolve: async () => { calls += 1; return { status: "resolved" }; } });
  const malformed: UploadProjectionInput[] = [
    { ...input(), requestIdentity: "" },
    { ...input(), uploadReferences: [] },
    input([reference({ opaqueReferenceId: "" })]),
    input([reference({ referenceKind: "unsupported" as OpaqueUploadReference["referenceKind"] })]),
    input([reference({ sourceClassification: "unsupported" as OpaqueUploadReference["sourceClassification"] })]),
    input([reference({ mediaClassification: "unsupported" as OpaqueUploadReference["mediaClassification"] })]),
    input([reference({ tenantReference: "" })]),
    input([reference({ workspaceReference: "" })]),
    input([reference({ metadata: { ...reference().metadata, contentLengthClassification: "bad" as OpaqueUploadReference["metadata"]["contentLengthClassification"] } })]),
    input([reference({ integrity: { ...reference().integrity, integrityPresent: false, integrityVerified: true } })]),
    input([reference(), reference()]),
  ];
  for (const value of malformed) assert.equal((await runtime.project(value)).status, "invalid");
  assert.equal(calls, 0);
});

test("normalizes dependency rejected, unavailable, and thrown results safely", async () => {
  assert.equal((await new ReferenceUploadProjectionRuntime({ resolve: async () => ({ status: "rejected", reasonCode: "resolution-rejected" }) }).project(input())).status, "rejected");
  assert.equal((await new ReferenceUploadProjectionRuntime({ resolve: async () => ({ status: "unavailable", reasonCode: "resolution-unavailable" }) }).project(input())).status, "unavailable");
  const secret = "raw-path-C:/secret/provider-locator";
  const thrown = await new ReferenceUploadProjectionRuntime({ resolve: async () => { throw new Error(secret); } }).project(input());
  assert.equal(thrown.status, "unavailable");
  assert.equal(JSON.stringify(thrown).includes(secret), false);
});

test("results are deterministic, deeply frozen, copy isolated, and secret-free", async () => {
  const dependencyResult = { status: "resolved" as const };
  const runtime = new ReferenceUploadProjectionRuntime({ resolve: async () => dependencyResult });
  const first = await runtime.project(input());
  const second = await runtime.project(input());
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(dependencyResult, { status: "resolved" });
  const serialized = JSON.stringify(first).toLowerCase();
  for (const forbidden of ["c:\\", "https://", "signedurl", "bucket", "objectkey", "token", "credential", "checksum", "receipt", "stack"])
    assert.equal(serialized.includes(forbidden.toLowerCase()), false, forbidden);
});
