import { validateRequest, copy, isPlainObject } from "@/lib/workflowApi/workflowApiUtils";
import type { ReferenceWorkflowStartFixtureBootstrapRequest, ReferenceWorkflowStartFixtureBootstrapResult, ReferenceWorkflowStartFixtureId, ReferenceWorkflowStartFixtureOperation } from "@/lib/workflowApi/referenceWorkflowStartFixtureBootstrapTypes";
import { projectCanonicalWorkflowStartRequest } from "@/lib/workflowFixtures/canonicalWorkflowApiProjector";
import { createCanonicalMusicWorkflowFixture, createCanonicalMVWorkflowFixture, createCanonicalVocalWorkflowFixture } from "@/lib/workflowFixtures/canonicalWorkflowFixtures";

const MESSAGE = "Reference start fixture is unavailable." as const;
const matrix: Readonly<Record<ReferenceWorkflowStartFixtureId, ReferenceWorkflowStartFixtureOperation>> = Object.freeze({ "canonical-vocal-success-v1": "generate-vocal", "canonical-music-success-v1": "generate-music", "canonical-mv-success-v1": "generate-mv" });
const factories = Object.freeze({ "canonical-vocal-success-v1": createCanonicalVocalWorkflowFixture, "canonical-music-success-v1": createCanonicalMusicWorkflowFixture, "canonical-mv-success-v1": createCanonicalMVWorkflowFixture });
const fixtureIds: readonly ReferenceWorkflowStartFixtureId[] = Object.freeze(["canonical-vocal-success-v1", "canonical-music-success-v1", "canonical-mv-success-v1"]);
const isFixtureId = (value: unknown): value is ReferenceWorkflowStartFixtureId => typeof value === "string" && fixtureIds.some(id => id === value);
const fail = (code: Extract<ReferenceWorkflowStartFixtureBootstrapResult, { status: "failed" }>["error"]["code"]): ReferenceWorkflowStartFixtureBootstrapResult => ({ status: "failed", error: { code, message: MESSAGE } });
export function validateReferenceWorkflowStartFixtureBootstrapRequest(value: unknown): value is ReferenceWorkflowStartFixtureBootstrapRequest {
  if (!isPlainObject(value) || Object.keys(value).length !== 3 || !Object.keys(value).every(key => ["contractVersion", "fixtureId", "operation"].includes(key)) || value.contractVersion !== "1.0") return false;
  if (!isFixtureId(value.fixtureId) || typeof value.operation !== "string") return false;
  return matrix[value.fixtureId] === value.operation;
}
export function createReferenceWorkflowStartFixtureBootstrap(value: unknown): ReferenceWorkflowStartFixtureBootstrapResult {
  if (!validateReferenceWorkflowStartFixtureBootstrapRequest(value)) return fail("fixture-bootstrap-invalid-request");
  const fixture = factories[value.fixtureId]();
  if (fixture.status !== "ready" || fixture.operation !== value.operation || fixture.metadata.fixtureId !== value.fixtureId) return fail("fixture-bootstrap-unavailable");
  const projected = projectCanonicalWorkflowStartRequest(fixture);
  if (projected.status !== "projected" || projected.operation !== value.operation) return fail("fixture-bootstrap-projection-failed");
  const validated = validateRequest({ ...projected.request, idempotencyKey: "fixture-bootstrap-validation" });
  if (validated.status !== "valid" || !("operation" in validated.value) || validated.value.operation !== value.operation) return fail("fixture-bootstrap-validation-failed");
  const result: ReferenceWorkflowStartFixtureBootstrapResult = { status: "ready", contractVersion: "1.0", fixtureId: value.fixtureId, operation: value.operation, request: copy(projected.request) };
  const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
  const limit = value.operation === "generate-mv" ? 524288 : 131072;
  return bytes <= limit ? copy(result) : fail("fixture-bootstrap-response-too-large");
}
