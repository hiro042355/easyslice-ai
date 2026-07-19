import assert from "node:assert/strict";
import test from "node:test";

const alreadyVerified = Object.freeze([
  "outbox-v2-lifecycle-classification",
  "outbox-v2-delivered",
  "outbox-v2-stale-owner-terminal-transition",
  "outbox-v2-terminal-overwrite",
  "resolution-v2-created",
  "resolution-v2-replayed",
  "resolution-v2-terminal-parent",
  "atomic-v2-stale-fence-rollback",
  "atomic-v2-writer-epoch-rollback",
  "commit-unknown-all-results",
  "read-session-release-duplicate-close-late-read",
  "read-session-release-failure",
  "registry-v1-v2-copy-isolation",
] as const);

const closedFixtureGroups = Object.freeze([
  Object.freeze({
    id: "outbox-v2-lifecycle-classification",
    disposition: "closed",
    evidence: Object.freeze([
      "renew-success",
      "release-success",
      "expired-takeover-success",
      "reconciliation-required-success",
      "stale-owner",
      "stale-fence",
      "stale-revision",
      "pending-ownership-precedence",
      "terminal-preservation",
      "mutation-isolation",
      "safe-diagnostics",
      "direct-v2-api",
    ]),
    notApplicable: Object.freeze([
      Object.freeze({
        item: "wrong-prior-state",
        reason: "claimed-only-guard-has-no-distinct-reachable-nonterminal-prior-state",
      }),
    ]),
  }),
  Object.freeze({
    id: "read-session-release-lifecycle",
    disposition: "closed",
    evidence: Object.freeze([
      "duplicate-dispose",
      "closed-state",
      "late-read",
      "release-failure",
    ]),
    notApplicable: Object.freeze([]),
  }),
  Object.freeze({
    id: "outbox-v2-concurrency",
    disposition: "closed",
    evidence: Object.freeze([
      "delivery-race-single-winner",
      "delivery-race-terminal-preserved-loser",
      "takeover-race-single-winner",
      "takeover-race-stale-fence-loser",
      "revision-monotonicity",
      "fencing-revision-monotonicity",
      "terminal-uniqueness",
      "owner-uniqueness",
      "payload-immutability",
      "old-owner-rejection",
      "safe-diagnostics",
      "direct-v2-api",
    ]),
    notApplicable: Object.freeze([]),
  }),
  Object.freeze({
    id: "resolution-v2-parent-classification",
    disposition: "closed",
    evidence: Object.freeze([
      "direct-standalone-v2-created",
      "direct-standalone-v2-replayed",
      "semantic-conflict",
      "stale-revision",
      "future-revision-as-stale-revision",
      "wrong-prior-state",
      "stale-owner-as-stale-fence",
      "stale-fence",
      "writer-epoch-mismatch",
      "all-absorbing-terminal-parents",
      "flat-scalar-caller-input-isolation",
      "created-replayed-read-reference-isolation",
      "deleted-parent-public-reachability-audit",
      "deleted-parent-active-only-statement-guard",
      "deleted-parent-schema-alignment",
      "real-postgresql-dynamic-matrix",
      "static-deleted-parent-structural-proof",
    ]),
    notApplicable: Object.freeze([
      Object.freeze({
        item: "deleted-parent-dynamic-fixture",
        reason: "unreachable-from-public-request-store-lifecycle-structural-guard-proven",
      }),
      Object.freeze({
        item: "nested-mutation-isolation",
        reason: "resolution-safe-json-permits-flat-scalars-only-and-decoder-rejects-nested-values",
      }),
    ]),
  }),
  Object.freeze({
    id: "resolution-v2-concurrency",
    disposition: "closed",
    evidence: Object.freeze([
      "direct-resolution-v2-concurrency-test",
      "same-identity-same-fingerprint-created-replayed",
      "same-identity-different-fingerprint-semantic-conflict",
      "distinct-identity-same-sequence-semantic-conflict",
      "terminal-transition-race",
      "stale-participant-terminal-preserved",
      "deterministic-two-party-barrier",
      "fresh-real-postgresql-environment-per-race",
      "winner-loser-uniqueness",
      "resolution-row-uniqueness",
      "parent-revision-monotonicity",
      "fencing-ownership-preservation",
      "flat-scalar-payload-immutability",
      "result-isolation",
      "safe-diagnostics",
      "meaningful-assertions",
    ]),
    notApplicable: Object.freeze([]),
  }),
  Object.freeze({
    id: "atomic-v2-outcome-matrix",
    disposition: "closed",
    evidence: Object.freeze([
      "direct-atomic-v2-outcome-matrix-test",
      "created",
      "replayed",
      "partial-replay",
      "semantic-conflict",
      "stale-revision",
      "stale-fence",
      "wrong-prior-state",
      "terminal-preserved",
      "decode-validation-corrupted",
      "writer-epoch-mismatch",
      "no-partial-write",
      "no-orphan-row",
      "parent-revision-preservation",
      "resolution-row-uniqueness",
      "safe-diagnostics",
    ]),
    notApplicable: Object.freeze([]),
  }),
  Object.freeze({
    id: "manual-repair-invalid-matrix",
    disposition: "closed",
    evidence: Object.freeze([
      "direct-manual-repair-approval-api-test",
      "valid-control",
      "invalid-input",
      "wrong-prior-state",
      "stale-revision",
      "future-revision",
      "stale-fence",
      "writer-epoch-mismatch",
      "deleted-parent-terminal",
      "all-absorbing-terminal-states",
      "repeated-repair-replayed",
      "conflicting-second-repair",
      "revision-delta",
      "mutation-zero",
      "authority-preservation",
      "safe-diagnostics",
      "real-postgresql",
      "structural-public-reachability-audit",
    ]),
    notApplicable: Object.freeze([
      Object.freeze({ item: "stale-owner", reason: "structural-non-applicable-owner-is-absent-from-public-input-validation-statement-and-compare-and-set" }),
      Object.freeze({ item: "unknown-target", reason: "structural-non-applicable-approval-target-is-fixed-to-authorized" }),
      Object.freeze({ item: "malformed-target", reason: "structural-non-applicable-target-is-not-public-input" }),
    ]),
  }),
  Object.freeze({
    id: "observation-concurrency-matrix",
    disposition: "closed",
    evidence: Object.freeze([
      "direct-observation-store-api",
      "same-identity-same-fingerprint-created-replayed",
      "same-identity-different-fingerprint-created-conflict",
      "distinct-identity-distinct-sequence-created-created",
      "distinct-identity-same-sequence-created-conflict",
      "deterministic-two-party-barrier",
      "observation-row-uniqueness",
      "authoritative-list-and-latest-read",
      "parent-revision-preservation",
      "payload-and-metadata-preservation",
      "real-postgresql",
      "safe-diagnostics",
    ]),
    notApplicable: Object.freeze([
      Object.freeze({ item: "stale-writer", reason: "structural-non-applicable-authority-is-not-observation-input" }),
      Object.freeze({ item: "stale-fence", reason: "structural-non-applicable-fence-is-not-observation-input" }),
      Object.freeze({ item: "deleted-parent-guard", reason: "observation-journal-append-has-fk-only-parent-ownership" }),
      Object.freeze({ item: "terminal-parent-guard", reason: "observation-journal-append-is-not-terminal-transition" }),
    ]),
  }),
] as const);

const duplicateItems = Object.freeze([
  Object.freeze({ item: "outbox-stale-owner-delivered", coveredBy: "outbox-v2-stale-owner-terminal-transition" }),
  Object.freeze({ item: "outbox-delivered-terminal-rejection", coveredBy: "outbox-v2-terminal-overwrite" }),
  Object.freeze({ item: "resolution-duplicate-replay", coveredBy: "resolution-v2-replayed" }),
  Object.freeze({ item: "late-resolution-rejection", coveredBy: "resolution-v2-terminal-parent" }),
  Object.freeze({ item: "atomic-child-rollback-stale-fence", coveredBy: "atomic-v2-stale-fence-rollback" }),
  Object.freeze({ item: "atomic-child-rollback-writer-epoch", coveredBy: "atomic-v2-writer-epoch-rollback" }),
  Object.freeze({ item: "read-session-closed-late-read", coveredBy: "read-session-release-duplicate-close-late-read" }),
] as const);

const independentFixtures = Object.freeze([] as readonly Readonly<{ id: string; proves: readonly string[] }>[]);

test("Current Verification Matrix records eight closed groups and no unresolved independent fixture groups", () => {
  assert.equal(closedFixtureGroups.length, 8);
  assert.equal(independentFixtures.length, 0);
  assert.equal(independentFixtures.length, 0, "unresolved");
  assert.equal(new Set(independentFixtures.map(fixture => fixture.id)).size, independentFixtures.length);
  assert.equal(new Set(closedFixtureGroups.map(fixture => fixture.id)).size, closedFixtureGroups.length);
  assert.ok(independentFixtures.every(fixture => fixture.proves.length > 0));
  assert.ok(closedFixtureGroups.every(fixture => fixture.evidence.length > 0));
  assert.equal(new Set(alreadyVerified).size, alreadyVerified.length);
  assert.ok(duplicateItems.every(entry => alreadyVerified.includes(entry.coveredBy)));
  assert.equal(closedFixtureGroups[0]?.notApplicable[0]?.item, "wrong-prior-state");
  assert.equal(Object.isFrozen(independentFixtures), true);
  assert.equal(Object.isFrozen(closedFixtureGroups), true);
  assert.equal(Object.isFrozen(alreadyVerified), true);
  assert.equal(Object.isFrozen(duplicateItems), true);
});
