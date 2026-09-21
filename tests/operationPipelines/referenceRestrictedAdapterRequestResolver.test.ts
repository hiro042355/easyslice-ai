import assert from "node:assert/strict";
import test from "node:test";
import { ReferenceRestrictedAdapterRequestResolver } from "../../lib/operationPipelines/referenceRestrictedAdapterRequestResolver";

const context = { contextVersion: "1.0", baselineTime: "2029-01-01T00:00:00.000Z", attempt: 1, operationRef: "op", materializationIdempotencyKeyRef: "mat", generationIdempotencyKeyRef: "gen", outputIngestionIdempotencyKeyRef: "ing" } as const;
const authorization = { authorizationVersion: "1.0", actorType: "internal-workflow-service", tenantRef: "tenant", region: "region", operation: "generate-music", permission: "execute-operation-resume-pipeline", workflowOwnershipVerified: true, deletionState: "active", legalHold: false } as const;
const record = (overrides: Record<string, unknown> = {}) => ({ recordVersion: "1.0", operation: "generate-music", adapterId: "reference-music-v1", adapterVersion: "1.0.0", requestSchemaVersion: "1.0", fingerprint: "safe", tenantRef: "tenant", region: "region", expiresAt: "2030-01-01T00:00:00.000Z", deletionState: "active", legalHold: false, payloadRef: "record", ...overrides });
const request = { requestSchemaVersion: "1.0" };

test("resolves an authorized restricted request as an isolated copy", async () => {
  const resolver = new ReferenceRestrictedAdapterRequestResolver();
  const source = record({ payloadRef: "resolved" });
  assert.equal(resolver.register(source as never, request as never).status, "registered");
  const result = await resolver.resolve("resolved", "generate-music", context, authorization);
  assert.equal(result.status, "resolved");
  if (result.status === "resolved") assert.notEqual(result.request, request);
});

test("keeps every resolver failure outcome distinct", async () => {
  const cases = [
    ["missing", undefined, {}, {}, "missing"],
    ["expired", { expiresAt: "2028-01-01T00:00:00.000Z" }, {}, {}, "expired"],
    ["deleted", { deletionState: "deleted" }, {}, {}, "deleted"],
    ["unauthorized", {}, {}, { tenantRef: "other" }, "unauthorized"],
    ["operation", { operation: "generate-vocal", adapterId: "reference-vocal-v1" }, {}, {}, "operation-mismatch"],
    ["adapter", { adapterId: "wrong" }, {}, {}, "adapter-mismatch"],
    ["schema", { requestSchemaVersion: "2.0" }, {}, {}, "schema-mismatch"],
    ["failed", {}, { baselineTime: "invalid" }, {}, "failed"],
  ] as const;
  for (const [name, recordOverrides, contextOverrides, authorizationOverrides, expected] of cases) {
    const resolver = new ReferenceRestrictedAdapterRequestResolver();
    if (recordOverrides !== undefined) resolver.register(record({ payloadRef: name, ...recordOverrides }) as never, request as never);
    const result = await resolver.resolve(name, "generate-music", { ...context, ...contextOverrides } as never, { ...authorization, ...authorizationOverrides } as never);
    assert.equal(result.status, expected, name);
  }
});

test("rejects invalid and duplicate registration without caller endpoint authority", () => {
  const resolver = new ReferenceRestrictedAdapterRequestResolver();
  assert.equal(resolver.register(record({ payloadRef: "https://forbidden.example" }) as never, request as never).status, "invalid");
  assert.equal(resolver.register(record({ payloadRef: "duplicate" }) as never, request as never).status, "registered");
  assert.equal(resolver.register(record({ payloadRef: "duplicate" }) as never, request as never).status, "conflict");
});
