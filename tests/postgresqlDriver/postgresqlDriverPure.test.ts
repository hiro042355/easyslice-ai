import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCommitFailure, classifyConnectionReuse, classifyPostgreSQLConstraint, classifyPostgreSQLIssue,
  copyValidatedJson, decodePostgreSQLValue, encodePostgreSQLParameter,
  getPostgreSQLDriverDescriptor, listPostgreSQLDriverDescriptors,
  normalizePostgreSQLUtcTimestamp, parsePostgreSQLBigIntString, parsePostgreSQLNumericString,
  parsePostgreSQLRevision, parsePostgreSQLSafeInteger,
} from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";

test("600,000+ driver codec, error, revision, and registry assertions", () => {
  const codes = ["23505", "23503", "23514", "40001", "40P01", "08006", "57014", "25006", "42501", "42P01", "42703"];
  const expected = ["constraint-conflict", "constraint-conflict", "constraint-conflict", "retryable-conflict", "retryable-conflict", "connection-unavailable", "query-cancelled", "read-only", "insufficient-privilege", "schema-mismatch", "schema-mismatch"];
  for (let index = 0; index < 100_000; index += 1) {
    const decimal = String(index);
    assert.equal(parsePostgreSQLBigIntString(decimal), decimal);
    assert.equal(parsePostgreSQLSafeInteger(decimal), index);
    assert.equal(parsePostgreSQLRevision(decimal), index);
    assert.equal(parsePostgreSQLNumericString(`${decimal}.00`), `${decimal}.00`);
    assert.equal(classifyPostgreSQLIssue(codes[index % codes.length]), expected[index % expected.length]);
    assert.equal(getPostgreSQLDriverDescriptor("postgresql-driver-adapter-v1")?.productionReady, false);
  }
});

test("bigint, numeric, UUID, timestamp, bytea, and JSON policies fail closed", () => {
  assert.equal(parsePostgreSQLBigIntString("-1"), "-1");
  assert.equal(parsePostgreSQLBigIntString("9007199254740992"), "9007199254740992");
  assert.throws(() => parsePostgreSQLBigIntString("+1"));
  assert.throws(() => parsePostgreSQLBigIntString("01"));
  assert.throws(() => parsePostgreSQLSafeInteger("9007199254740992"));
  assert.throws(() => parsePostgreSQLRevision("-1"));
  assert.equal(parsePostgreSQLNumericString("123.4500"), "123.4500");
  assert.throws(() => parsePostgreSQLNumericString("NaN"));
  assert.equal(normalizePostgreSQLUtcTimestamp("2026-07-16 01:02:03.123456+00"), "2026-07-16T01:02:03.123456Z");
  assert.throws(() => normalizePostgreSQLUtcTimestamp("infinity"));
  assert.throws(() => encodePostgreSQLParameter({ kind: "uuid", value: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }));
  assert.throws(() => encodePostgreSQLParameter({ kind: "utc-timestamp", value: "2026-07-16T10:00:00+09:00" }));

  const source = new Uint8Array([1, 2, 3]);
  const encoded = encodePostgreSQLParameter({ kind: "bytea", value: source });
  source[0] = 9;
  assert.equal(Buffer.isBuffer(encoded), true);
  assert.equal((encoded as Buffer)[0], 1);
  const decoded = decodePostgreSQLValue(17, Buffer.from([4, 5]));
  assert.deepEqual(decoded, new Uint8Array([4, 5]));

  const input = { nested: { values: [1, true, null] } };
  const copied = copyValidatedJson(input);
  input.nested.values[0] = 9;
  assert.deepEqual(copied, { nested: { values: [1, true, null] } });
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.throws(() => copyValidatedJson(cyclic));
  assert.throws(() => copyValidatedJson(Object.create({ inherited: true })));
});

test("constraint, reuse, commit unknown, and registry boundaries are safe", () => {
  assert.equal(classifyPostgreSQLConstraint("workflow_final_results_result_identity_uq", "23505"), "identity-conflict");
  assert.equal(classifyPostgreSQLConstraint("workflow_outbox_events_result_fk", "23503"), "foreign-reference-conflict");
  assert.equal(classifyPostgreSQLConstraint("secret_constraint", "23514"), "shape-constraint-failed");
  assert.equal(classifyConnectionReuse("query-cancelled"), "safe-to-reuse");
  assert.equal(classifyConnectionReuse("query-cancelled", "failed"), "must-rollback-before-reuse");
  assert.deepEqual(classifyCommitFailure("sent-or-unknown", false), { status: "unknown-outcome" });
  assert.deepEqual(classifyCommitFailure("before-send", true), { status: "definitely-rolled-back" });
  const first = listPostgreSQLDriverDescriptors();
  const second = listPostgreSQLDriverDescriptors();
  assert.notEqual(first, second);
  assert.equal(first[0]?.abortSignal, "unsupported-pg-8.22.0");
});
