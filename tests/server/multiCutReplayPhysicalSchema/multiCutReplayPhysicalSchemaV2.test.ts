import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2,
} from "../../../lib/server/multiCutReplayPhysicalSchema/physicalSchemaV2";

const schema = MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2;
const columns = new Map(schema.table.columns.map((column) => [column.name, column]));

test("physical schema V2 uses an internal primary key and scoped authority", () => {
  assert.equal(schema.physicalSchemaVersion, "2.0");
  assert.equal(schema.table.primaryKeyStrategy, "internal-uuid");
  assert.deepEqual(schema.authoritativeUniqueConstraint.columns, [
    "physical_schema_version",
    "logical_schema_version",
    "identity_version",
    "scope_version",
    "replay_namespace",
    "tenant_identity_version",
    "protected_tenant_identity",
    "operation_identity",
    "key_identity",
  ]);
  assert.equal(schema.authoritativeUniqueConstraint.kind, "unique");
  assert.equal(
    schema.authoritativeUniqueConstraint.columns.includes(
      "request_fingerprint_identity",
    ),
    false,
  );
});

test("logical schema and concurrency evidence have complete physical mappings", () => {
  for (const logicalSource of [
    "logicalSchemaVersion",
    "recordIdentity.identityVersion",
    "recordIdentity.protectedScope.scopeVersion",
    "recordIdentity.protectedScope.replayNamespace",
    "recordIdentity.protectedScope.tenant.identityVersion",
    "recordIdentity.protectedScope.tenant.protectedTenantIdentity",
    "recordIdentity.protectedScope.operationIdentity",
    "recordIdentity.keyIdentity",
    "requestSemantics.requestFingerprintIdentity",
    "revision",
    "reservationEvidence.evidenceVersion",
    "reservationEvidence.reservation.reservationVersion",
    "reservationEvidence.reservation.reservationIdentity",
    "reservationEvidence.expectedRevision.revisionVersion",
    "reservationEvidence.expectedRevision.expectedRevision",
    "reservationEvidence.fencing.fencingVersion",
    "reservationEvidence.fencing.fencingToken",
    "reservationEvidence.lease.leaseVersion",
    "reservationEvidence.lease.leaseIdentity",
    "reservationEvidence.leaseExpiresAt",
    "reservationEvidence.reservationAttempt",
    "resultReference.referenceVersion",
    "resultReference.resultReferenceIdentity",
    "metadata.metadataVersion",
    "metadata completedAt|failedAt|releasedAt",
    "metadata classification",
  ]) {
    assert.ok(
      schema.table.columns.some((column) => column.logicalSource === logicalSource),
      logicalSource,
    );
  }
});

test("all scope and key columns are required, immutable, and have no default", () => {
  for (const name of schema.authoritativeUniqueConstraint.columns) {
    const column = columns.get(name);
    assert.ok(column, name);
    assert.equal(column.nullable, false, name);
    assert.equal(column.mutable, false, name);
    assert.equal(column.default, "none", name);
  }
  assert.equal(columns.get("request_fingerprint_identity")?.nullable, false);
  assert.equal(
    schema.indexes.some(
      (index) =>
        index.columns.length === 1 &&
        index.columns[0] === "key_identity" &&
        index.unique,
    ),
    false,
  );
});

test("fingerprint is separate and never authoritative", () => {
  assert.equal(
    columns.get("request_fingerprint_identity")?.logicalSource,
    "requestSemantics.requestFingerprintIdentity",
  );
  assert.equal(
    schema.indexes.some(
      (index) =>
        index.authoritativeIdentity &&
        index.columns.includes("request_fingerprint_identity"),
    ),
    false,
  );
});

test("indexes cover required operations without creating new authority", () => {
  const operations = schema.indexes.flatMap((index) => index.supportedOperations);
  for (const operation of [
    "resolution",
    "lifecycle",
    "recovery",
    "reconciliation",
    "takeover",
    "lease-expiry",
    "ownership-lookup",
    "state-filtered-lookup",
    "result-linkage-lookup",
  ]) {
    assert.ok(operations.includes(operation), operation);
  }
  assert.equal(
    schema.indexes.filter((index) => index.authoritativeIdentity).length,
    1,
  );
  for (const index of schema.indexes) {
    assert.ok(index.whyRequired.length > 0, index.name);
    assert.ok(index.whyNotAuthoritative.length > 0, index.name);
  }
});

test("constraints separate database and runtime responsibilities", () => {
  assert.ok(schema.constraints.length >= 7);
  assert.ok(schema.responsibilities.database.includes("scope-key-uniqueness"));
  assert.ok(
    schema.responsibilities.runtimeOrStatement.includes(
      "identity-immutability-after-insert",
    ),
  );
  assert.deepEqual(schema.relationships, []);
});

test("schema is declarative and has no executable database dependency", async () => {
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutReplayPhysicalSchema/physicalSchemaV2.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT)\s+/i,
  );
  assert.doesNotMatch(
    source,
    /(?:node:pg|from\s+["']pg["']|Client|Pool|Executor|Adapter|Runtime implementation|migration runner|query\s*\(|execute\s*\()/,
  );
  assert.match(source, /import\s+type/);
});
