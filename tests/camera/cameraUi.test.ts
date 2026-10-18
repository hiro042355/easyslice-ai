import { test } from "node:test";
import assert from "node:assert/strict";

import { CameraPreview } from "../../components/CameraPreview";
import { CameraEditor } from "../../components/CameraEditor";

test("Camera UI Components - imports and functions exist", () => {
  assert.equal(typeof CameraPreview, "function");
  assert.equal(typeof CameraEditor, "function");
});
