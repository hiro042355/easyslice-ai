import { test } from "node:test";
import assert from "node:assert/strict";

import { createDefaultCameraMovement, validateCameraMovement, applyEasing, interpolateCameraTransform, parseCameraMovements } from "../../lib/camera/cameraEngine";
import type { CameraMovement } from "../../lib/camera/cameraTypes";

test("Camera Engine - createDefaultCameraMovement generates valid movement", () => {
  const mv = createDefaultCameraMovement("clip-1", "PAN");
  const validation = validateCameraMovement(mv, 10);
  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);
  assert.equal(mv.movementType, "PAN");
});

test("Camera Engine - validateCameraMovement rejects invalid inputs", () => {
  // Negative startTime
  const invalidTime = {
    ...createDefaultCameraMovement("clip-1"),
    startTime: -5,
  };
  assert.equal(validateCameraMovement(invalidTime).valid, false);

  // endTime < startTime
  const invalidOrder = {
    ...createDefaultCameraMovement("clip-1"),
    startTime: 10,
    endTime: 5,
  };
  assert.equal(validateCameraMovement(invalidOrder).valid, false);

  // NaN zoom
  const invalidZoom = {
    ...createDefaultCameraMovement("clip-1"),
    startZoom: NaN,
  };
  assert.equal(validateCameraMovement(invalidZoom).valid, false);

  // Exceeding clip duration
  const exceedsDuration = {
    ...createDefaultCameraMovement("clip-1"),
    startTime: 0,
    endTime: 15,
  };
  assert.equal(validateCameraMovement(exceedsDuration, 10).valid, false);
});

test("Camera Engine - applyEasing returns correct bounds and progression", () => {
  assert.equal(applyEasing(0, "linear"), 0);
  assert.equal(applyEasing(1, "linear"), 1);
  assert.equal(applyEasing(0.5, "linear"), 0.5);

  assert.equal(applyEasing(0, "ease-in"), 0);
  assert.equal(applyEasing(1, "ease-in"), 1);
  assert.equal(applyEasing(0.5, "ease-in"), 0.25);

  assert.equal(applyEasing(0, "ease-out"), 0);
  assert.equal(applyEasing(1, "ease-out"), 1);
  assert.equal(applyEasing(0.5, "ease-out"), 0.75);
});

test("Camera Engine - interpolateCameraTransform calculates correct transform and clamps bounds", () => {
  const movement: CameraMovement = {
    id: "mv-1",
    clipId: "clip-1",
    movementType: "ZOOM",
    startTime: 0,
    endTime: 10,
    startPosition: { x: 0, y: 0 },
    endPosition: { x: 0.5, y: 0 },
    startZoom: 1.0,
    endZoom: 2.0,
    easing: "linear",
    source: "manual",
    approvalStatus: "APPLIED",
  };

  // At start (t=0)
  const startState = interpolateCameraTransform([movement], 0);
  assert.equal(startState.zoom, 1.0);
  assert.equal(startState.x, 0);

  // Midpoint (t=5)
  const midState = interpolateCameraTransform([movement], 5);
  assert.equal(midState.zoom, 1.5);
  // Max shift at zoom 1.5 is (1 - 1/1.5)/2 = (1 - 0.6667)/2 = 0.1667
  // Raw x at midpoint was 0.25, so it should be clamped to maxShift ~0.1667
  assert.ok(midState.x < 0.25);
  assert.ok(midState.x > 0);

  // Outside range (t=15) returns default
  const defaultState = interpolateCameraTransform([movement], 15);
  assert.equal(defaultState.zoom, 1.0);
  assert.equal(defaultState.x, 0);
  assert.equal(defaultState.y, 0);
});

test("Camera Engine - parseCameraMovements filters out invalid entries safely", () => {
  const rawList = [
    createDefaultCameraMovement("c1", "PAN"),
    { invalid: true },
    createDefaultCameraMovement("c1", "ZOOM"),
  ];

  const parsed = parseCameraMovements(rawList);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].movementType, "PAN");
  assert.equal(parsed[1].movementType, "ZOOM");
});
