import assert from "node:assert/strict";
import test from "node:test";
import {
  isMultiCutRouteRequest,
  isMultiCutRouteResponseProjection,
} from "../../../lib/server/multiCutRoute/multiCutRouteContract";
import {
  createInvalidMultiCutRouteProjectionKindCandidate,
  createInvalidMultiCutRouteRequestVersionCandidate,
  createMissingMultiCutRouteRequestFieldCandidate,
  createReferenceMultiCutRoute400Projection,
  createReferenceMultiCutRoute404Projection,
  createReferenceMultiCutRouteBinarySuccessProjection,
  createReferenceMultiCutRouteCreatorStyleRequest,
  createReferenceMultiCutRouteOptionalRequest,
  createReferenceMultiCutRouteRequest,
} from "../../../lib/server/multiCutRoute/referenceMultiCutRouteContractFixtures";

test("request fixtures preserve current required and optional public fields", () => {
  const request = createReferenceMultiCutRouteRequest();
  const optional = createReferenceMultiCutRouteOptionalRequest();
  const creator = createReferenceMultiCutRouteCreatorStyleRequest();

  assert.equal(request.requestVersion, "1.0");
  assert.deepEqual(request.clips, [
    { start: "10", end: "20", title: "Reference clip" },
  ]);
  assert.equal(request.outputFormat, "original");
  assert.equal(optional.outputFormat, undefined);
  assert.equal(optional.creatorStyleConfig, undefined);
  assert.equal(creator.outputFormat, "shorts");
  assert.equal(creator.creatorStyleConfig?.style, "creator");
  assert.equal(isMultiCutRouteRequest(request), true);
});

test("response fixtures represent binary success and current JSON failures", () => {
  const success = createReferenceMultiCutRouteBinarySuccessProjection();
  const badRequest = createReferenceMultiCutRoute400Projection();
  const notFound = createReferenceMultiCutRoute404Projection();

  assert.equal(success.responseProjectionVersion, "1.0");
  assert.equal(success.kind, "binary-success");
  if (success.kind === "binary-success") {
    assert.equal(success.status, 200);
    assert.equal(success.payload.metadata.mediaType, "application/zip");
    assert.equal(success.payload.metadata.filename, "clips.zip");
    assert.deepEqual(success.payload.bytes, Uint8Array.from([80, 75, 3, 4]));
  }

  assert.deepEqual(badRequest, {
    responseProjectionVersion: "1.0",
    kind: "json-error",
    status: 400,
    errorCode: "clips-required",
    message: "At least one clip is required.",
  });
  assert.equal(notFound.kind, "json-error");
  assert.equal(notFound.status, 404);
  assert.equal(isMultiCutRouteResponseProjection(success), true);
  assert.equal(isMultiCutRouteResponseProjection(badRequest), true);
  assert.equal(isMultiCutRouteResponseProjection(notFound), true);
});

test("shape guards reject unsupported or incomplete top-level shapes", () => {
  assert.equal(
    isMultiCutRouteRequest(
      createInvalidMultiCutRouteRequestVersionCandidate(),
    ),
    false,
  );
  assert.equal(
    isMultiCutRouteRequest(createMissingMultiCutRouteRequestFieldCandidate()),
    false,
  );
  assert.equal(
    isMultiCutRouteResponseProjection(
      createInvalidMultiCutRouteProjectionKindCandidate(),
    ),
    false,
  );
});

test("fixtures are isolated and freeze their readonly containers", () => {
  const first = createReferenceMultiCutRouteBinarySuccessProjection();
  const second = createReferenceMultiCutRouteBinarySuccessProjection();
  assert.equal(Object.isFrozen(first), true);

  if (first.kind === "binary-success" && second.kind === "binary-success") {
    (first.payload.bytes as Uint8Array)[0] = 0;
    assert.equal(second.payload.bytes[0], 80);
    assert.notEqual(first.payload.bytes, second.payload.bytes);
    assert.equal(Object.isFrozen(first.payload), true);
    assert.equal(Object.isFrozen(first.payload.metadata), true);
  }

  const request = createReferenceMultiCutRouteCreatorStyleRequest();
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.clips), true);
  assert.equal(Object.isFrozen(request.clips[0]), true);
  assert.equal(Object.isFrozen(request.creatorStyleConfig), true);
});
