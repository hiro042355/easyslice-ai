import assert from "node:assert/strict";
import test from "node:test";
import {
  isMultiCutSourceArtifactHandoff,
} from "../../../lib/server/source/multiCutSourceArtifactHandoffContract";
import {
  createInvalidMultiCutSourceArtifactHandoffVersionCandidate,
  createMissingMultiCutSourceArtifactHandoffFieldCandidate,
  createReferenceMultiCutSourceArtifactHandoff,
} from "../../../lib/server/source/referenceMultiCutSourceArtifactHandoffFixtures";

test("reference handoff carries the existing source and authority input", () => {
  const handoff = createReferenceMultiCutSourceArtifactHandoff();

  assert.equal(handoff.handoffVersion, "1.0");
  assert.equal(handoff.authorityInput.inputVersion, "1.0");
  assert.equal(
    handoff.authorityInput.sourceArtifact.opaqueSourceArtifactReference,
    "source:multi-cut:reference",
  );
  assert.equal(
    handoff.authorityInput.context.authorizationEvidence.decision,
    "authorized",
  );
  assert.equal(isMultiCutSourceArtifactHandoff(handoff), true);
});

test("shape guard rejects unsupported versions and missing top-level fields", () => {
  assert.equal(
    isMultiCutSourceArtifactHandoff(
      createInvalidMultiCutSourceArtifactHandoffVersionCandidate(),
    ),
    false,
  );
  assert.equal(
    isMultiCutSourceArtifactHandoff(
      createMissingMultiCutSourceArtifactHandoffFieldCandidate(),
    ),
    false,
  );
  assert.equal(isMultiCutSourceArtifactHandoff(undefined), false);
});

test("fixture wrappers and nested contract values are isolated", () => {
  const first = createReferenceMultiCutSourceArtifactHandoff();
  const second = createReferenceMultiCutSourceArtifactHandoff();

  assert.notEqual(first, second);
  assert.notEqual(first.authorityInput, second.authorityInput);
  assert.notEqual(
    first.authorityInput.sourceArtifact,
    second.authorityInput.sourceArtifact,
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.authorityInput), true);
  assert.equal(Object.isFrozen(first.authorityInput.sourceArtifact), true);
  assert.equal(Object.isFrozen(first.authorityInput.context), true);
});
