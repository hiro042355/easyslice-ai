import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_MEDIA_BYTES,
  validateMediaAdmissionFile,
  admitDurableMedia,
} from "../../lib/client/durableMediaAdmission";

test("validateMediaAdmissionFile accepts valid MP4 files below limit", () => {
  const file = new File([new Uint8Array(1024)], "sample.mp4", { type: "video/mp4" });
  assert.doesNotThrow(() => validateMediaAdmissionFile(file));
});

test("validateMediaAdmissionFile accepts valid MP4 file exactly at the 2GB limit", () => {
  const file = {
    name: "exact-limit.mp4",
    type: "video/mp4",
    size: MAX_MEDIA_BYTES,
  } as unknown as File;
  assert.doesNotThrow(() => validateMediaAdmissionFile(file));
});

test("validateMediaAdmissionFile rejects files exceeding the 2GB limit", () => {
  const file = {
    name: "too-large.mp4",
    type: "video/mp4",
    size: MAX_MEDIA_BYTES + 1,
  } as unknown as File;
  assert.throws(
    () => validateMediaAdmissionFile(file),
    /Media file exceeds maximum allowed size of 2GB/
  );
});

test("validateMediaAdmissionFile rejects empty or zero-byte files", () => {
  const file = {
    name: "empty.mp4",
    type: "video/mp4",
    size: 0,
  } as unknown as File;
  assert.throws(
    () => validateMediaAdmissionFile(file),
    /Only a non-empty MP4 can be admitted: invalid file size/
  );
});

test("validateMediaAdmissionFile rejects negative or NaN file sizes", () => {
  for (const invalidSize of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    const file = {
      name: "invalid-size.mp4",
      type: "video/mp4",
      size: invalidSize,
    } as unknown as File;
    assert.throws(
      () => validateMediaAdmissionFile(file),
      /Only a non-empty MP4 can be admitted: invalid file size/
    );
  }
});

test("validateMediaAdmissionFile rejects non-MP4 MIME types", () => {
  for (const badMime of ["video/webm", "video/quicktime", "application/octet-stream", "text/plain", ""]) {
    const file = {
      name: "wrong-format.mov",
      type: badMime,
      size: 1024,
    } as unknown as File;
    assert.throws(
      () => validateMediaAdmissionFile(file),
      /Only a non-empty MP4 can be admitted: invalid MIME type/
    );
  }
});

test("admitDurableMedia fails immediately on oversized file without network requests", async () => {
  let networkCalls = 0;
  const mockFetch = async (): Promise<Response> => {
    networkCalls += 1;
    return new Response(null, { status: 200 });
  };
  const oversizedFile = {
    name: "oversized.mp4",
    type: "video/mp4",
    size: MAX_MEDIA_BYTES + 1024,
  } as unknown as File;

  await assert.rejects(
    () => admitDurableMedia(oversizedFile, mockFetch),
    /Media file exceeds maximum allowed size of 2GB/
  );
  assert.equal(networkCalls, 0);
});
