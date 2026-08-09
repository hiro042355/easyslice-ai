import assert from "node:assert/strict";
import test from "node:test";
import { createCompleteParticipationFailureEvidenceV3 } from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";
import { projectCompleteLifecycleFailureEvidenceV2 } from "../../../lib/server/multiCutReplayLifecycle";

test("complete participation and lifecycle evidence preserve disposition without downgrade", () => {
  for (const disposition of ["safe-to-reuse", "must-rollback-before-reuse", "must-discard", "unknown"] as const) {
    const participation = createCompleteParticipationFailureEvidenceV3({ issue: "timeout", safeReason: "postgresql-timeout", retryable: true, queryConnectionDisposition: disposition, sqlStateClass: "57" });
    assert.ok(participation); const lifecycle = projectCompleteLifecycleFailureEvidenceV2(participation);
    assert.equal(lifecycle.queryConnectionDisposition, disposition); assert.equal(lifecycle.retryable, true); assert.equal(lifecycle.commitUnknown, false); assert.ok(Object.isFrozen(lifecycle));
  }
  assert.equal(createCompleteParticipationFailureEvidenceV3({ issue: "timeout", safeReason: "safe", retryable: true }), undefined);
});
