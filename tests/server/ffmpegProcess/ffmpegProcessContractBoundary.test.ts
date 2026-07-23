import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../../lib/server/ffmpegProcess/types.ts", import.meta.url),
  "utf8",
);

test("FFmpeg Process contract is type-only and implementation-neutral", () => {
  assert.doesNotMatch(source, /^export\s+(?:const|function|class|enum)\b/m);
  assert.doesNotMatch(source, /\b(?:child_process|ChildProcess|PID|stdout: string|stderr: string|commandString|executablePath|filesystemPath|environment|exitSignal|exception|stack)\b/i);
  assert.doesNotMatch(source, /\b(?:react|next\/|workspace\/reference|inputMaterialization\/reference|app\/api)\b/i);
  assert.match(source, /export type FFmpegProcessCapability/);
  assert.match(source, /export type FFmpegProcessDecision/);
});
