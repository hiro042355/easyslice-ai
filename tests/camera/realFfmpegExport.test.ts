import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { resolvePackagedFfmpeg } from "../../lib/server/packagedFfmpeg";
import { buildCameraFfmpegFilter } from "../../lib/server/ffmpegCameraFilter";
import { createDefaultCameraMovement } from "../../lib/camera/cameraEngine";

const SOURCE_VIDEO = path.join(process.cwd(), "tests/fixtures/test_source.mp4");
const OUTPUT_DIR = path.join(process.cwd(), "tests/fixtures/outputs");

test("Real FFmpeg Export - renders MP4 video with PAN filter", () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputFile = path.join(OUTPUT_DIR, "export_pan.mp4");
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

  const panMv = createDefaultCameraMovement("clip-1", "PAN");
  const filter = buildCameraFfmpegFilter([panMv], 5);
  assert.ok(filter !== null);

  const ffmpeg = resolvePackagedFfmpeg();
  execFileSync(ffmpeg, [
    "-y", "-ss", "0", "-to", "5", "-i", SOURCE_VIDEO,
    "-vf", filter,
    "-c:v", "libx264", "-c:a", "aac",
    outputFile
  ]);

  assert.ok(fs.existsSync(outputFile));
  const stats = fs.statSync(outputFile);
  assert.ok(stats.size > 0, "Exported MP4 must be non-empty");
});

test("Real FFmpeg Export - renders MP4 video with ZOOM filter", () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputFile = path.join(OUTPUT_DIR, "export_zoom.mp4");
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

  const zoomMv = createDefaultCameraMovement("clip-1", "ZOOM");
  const filter = buildCameraFfmpegFilter([zoomMv], 5);
  assert.ok(filter !== null);

  const ffmpeg = resolvePackagedFfmpeg();
  execFileSync(ffmpeg, [
    "-y", "-ss", "0", "-to", "5", "-i", SOURCE_VIDEO,
    "-vf", filter,
    "-c:v", "libx264", "-c:a", "aac",
    outputFile
  ]);

  assert.ok(fs.existsSync(outputFile));
  const stats = fs.statSync(outputFile);
  assert.ok(stats.size > 0, "Exported MP4 must be non-empty");
});

test("Real FFmpeg Export - renders MP4 video with CRANE_SIMULATION filter", () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputFile = path.join(OUTPUT_DIR, "export_crane.mp4");
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

  const craneMv = createDefaultCameraMovement("clip-1", "CRANE_SIMULATION");
  const filter = buildCameraFfmpegFilter([craneMv], 5);
  assert.ok(filter !== null);

  const ffmpeg = resolvePackagedFfmpeg();
  execFileSync(ffmpeg, [
    "-y", "-ss", "0", "-to", "5", "-i", SOURCE_VIDEO,
    "-vf", filter,
    "-c:v", "libx264", "-c:a", "aac",
    outputFile
  ]);

  assert.ok(fs.existsSync(outputFile));
  const stats = fs.statSync(outputFile);
  assert.ok(stats.size > 0, "Exported MP4 must be non-empty");
});
