import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCameraFfmpegFilter } from "../../lib/server/ffmpegCameraFilter";
import { createDefaultCameraMovement } from "../../lib/camera/cameraEngine";
import type { CameraMovement } from "../../lib/camera/cameraTypes";

test("FFmpeg Camera Filter - returns null for empty or invalid movements", () => {
  assert.equal(buildCameraFfmpegFilter([], 10), null);
  assert.equal(buildCameraFfmpegFilter([{ invalid: true } as unknown as CameraMovement], 10), null);
});

test("FFmpeg Camera Filter - builds valid sanitized zoompan filter for PAN movement", () => {
  const panMv = createDefaultCameraMovement("clip-1", "PAN");
  const filter = buildCameraFfmpegFilter([panMv], 10, 1280, 720);

  assert.ok(filter !== null);
  assert.ok(filter.startsWith("zoompan=z="));
  assert.ok(filter.includes("between(on,0,150)"));
  assert.ok(filter.includes(":s=1280x720:fps=30"));
  // Ensure no unescaped injection strings
  assert.ok(!filter.includes(";"));
  assert.ok(!filter.includes("$"));
});

test("FFmpeg Camera Filter - preserves custom output dimensions (e.g. vertical 9:16 Shorts)", () => {
  const zoomMv = createDefaultCameraMovement("clip-1", "ZOOM");
  const filter = buildCameraFfmpegFilter([zoomMv], 5, 720, 1280);

  assert.ok(filter !== null);
  assert.ok(filter.includes(":s=720x1280:fps=30"));
});

test("FFmpeg Camera Filter - handles multiple movement segments", () => {
  const mv1 = { ...createDefaultCameraMovement("clip-1", "ZOOM"), startTime: 0, endTime: 3 };
  const mv2 = { ...createDefaultCameraMovement("clip-1", "PAN"), startTime: 3, endTime: 8 };

  const filter = buildCameraFfmpegFilter([mv1, mv2], 10);
  assert.ok(filter !== null);
  assert.ok(filter.includes("between(on,0,90)"));
  assert.ok(filter.includes("between(on,90,240)"));
});
