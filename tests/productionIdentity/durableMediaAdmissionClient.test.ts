import assert from "node:assert/strict";
import test from "node:test";
import { admitDurableMedia } from "../../lib/client/durableMediaAdmission";

const JOB = "11111111-1111-4111-8111-111111111111";
const MEDIA = "22222222-2222-4222-8222-222222222222";
const UPLOAD = "https://storage.googleapis.test/upload/session";

test("media bytes go only to the server-issued resumable URL", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const request = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ input: String(input), init });
    if (calls.length === 1) return Response.json({ jobId: JOB, mediaId: MEDIA, uploadUrl: UPLOAD });
    if (calls.length === 2) return new Response(null, { status: 200 });
    return Response.json({ jobId: JOB, mediaId: MEDIA });
  };
  const file = new File([new Uint8Array([0, 1, 2])], "owner.mp4", { type: "video/mp4" });
  assert.deepEqual(await admitDurableMedia(file, request), { jobId: JOB, mediaId: MEDIA });
  assert.deepEqual(calls.map(call => call.input), ["/api/media/admit", UPLOAD, "/api/media/admit"]);
  assert.equal(calls[0]!.init?.body instanceof File, false);
  assert.equal(calls[1]!.init?.body, file);
  assert.equal(calls[2]!.init?.body instanceof File, false);
  assert.doesNotMatch(String(calls[0]!.init?.body), /ownerUid|storageKey|userId/);
});

test("non-JSON platform failures are reported without a JSON parse exception", async () => {
  const request = async (): Promise<Response> => new Response("Request Entity Too Large", {
    status: 413,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
  const file = new File([new Uint8Array([0])], "owner.mp4", { type: "video/mp4" });
  await assert.rejects(admitDurableMedia(file, request), /Media admission failed \(413\)/);
});

test("GCS upload failures expose only safe protocol diagnostics", async () => {
  const sensitiveSession = "https://storage.googleapis.test/upload/session-secret";
  let calls = 0;
  const request = async (): Promise<Response> => {
    calls += 1;
    if (calls === 1) return Response.json({ jobId: JOB, mediaId: MEDIA, uploadUrl: sensitiveSession });
    return new Response(
      `<Error><Code>InvalidArgument</Code><Message>Invalid Content-Length for ${sensitiveSession}</Message></Error>`,
      { status: 400, headers: { "Content-Type": "application/xml; charset=UTF-8" } },
    );
  };
  const file = new File([new Uint8Array([0, 1, 2])], "owner.mp4", { type: "video/mp4" });
  await assert.rejects(admitDurableMedia(file, request), error => {
    assert.match(String(error), /Media upload failed \(400; gcsCode=InvalidArgument; reason=content-length; response=application\/xml; message=Invalid Content-Length for \[redacted-url\]; errors=none\)/);
    assert.doesNotMatch(String(error), /session-secret/);
    return true;
  });
});

test("GCS JSON diagnostics preserve safe nested error fields and redact authority", async () => {
  const sensitiveSession = "https://storage.googleapis.test/upload?upload_id=secret-session-authority";
  let calls = 0;
  const request = async (): Promise<Response> => {
    calls += 1;
    if (calls === 1) return Response.json({ jobId: JOB, mediaId: MEDIA, uploadUrl: sensitiveSession });
    return Response.json({
      error: {
        code: 400,
        message: `Invalid request for ${sensitiveSession}`,
        errors: [{
          domain: "global",
          reason: "invalidArgument",
          message: "Authorization: Bearer sensitive-token-value-12345678901234567890",
        }],
      },
    }, { status: 400 });
  };
  const file = new File([new Uint8Array([0, 1, 2])], "owner.mp4", { type: "video/mp4" });
  await assert.rejects(admitDurableMedia(file, request), error => {
    const diagnostic = String(error);
    assert.match(diagnostic, /gcsCode=400/);
    assert.match(diagnostic, /domain=global,reason=invalidArgument/);
    assert.match(diagnostic, /message=Invalid request for \[redacted-url\]/);
    assert.doesNotMatch(diagnostic, /secret-session|sensitive-token|storage\.googleapis\.test/);
    return true;
  });
});
