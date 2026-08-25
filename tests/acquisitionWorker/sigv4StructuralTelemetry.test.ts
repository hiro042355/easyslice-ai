import assert from "node:assert/strict";
import test from "node:test";
import { AwsClient } from "google-auth-library";
import { projectSigv4SubjectToken, SIGV4_FRESHNESS_TOLERANCE_MS } from "../../lib/server/acquisitionWorker/gcsControlStore";

const AUDIENCE = "//iam.googleapis.com/projects/566365202495/locations/global/workloadIdentityPools/nexcut-aws-acq-exp/providers/aws-tokyo-controlled-host";

const subject = async (input: { token?: string; region?: string } = {}): Promise<string> => {
  const client = new AwsClient({
    type: "external_account", audience: AUDIENCE,
    subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
    token_url: "http://127.0.0.1/unused",
    aws_security_credentials_supplier: {
      getAwsRegion: async () => input.region ?? "ap-northeast-1",
      getAwsSecurityCredentials: async () => ({ accessKeyId: "SYNTHETIC", secretAccessKey: "synthetic-only",
        ...(input.token === undefined ? {} : { token: input.token }) }),
    },
  });
  return client.retrieveSubjectToken();
};

const form = (token: string, audience = AUDIENCE): URLSearchParams => new URLSearchParams({
  audience, subject_token: token,
});

const mutate = (token: string, update: (value: { url: string; method: string; headers: Array<{key: string; value: string}> }) => void): string => {
  const value = JSON.parse(decodeURIComponent(token));
  update(value);
  return encodeURIComponent(JSON.stringify(value));
};

test("current google-auth-library token projects only closed expected structural evidence", async () => {
  const value = projectSigv4SubjectToken({ data: form(await subject({ token: "synthetic-session" })) });
  assert.deepEqual(value, {
    sigv4SessionTokenPresent: "YES", sigv4ExpectedRegion: "YES", sigv4ExpectedHost: "YES",
    sigv4AuthorizationPresent: "YES", sigv4AmzDatePresent: "YES",
    sigv4SecurityTokenHeaderPresent: "YES", sigv4SecurityTokenSigned: "YES",
    sigv4TargetResourcePresent: "YES", sigv4TargetResourceMatchesAudience: "YES",
    sigv4TargetResourceSigned: "NO", sigv4GetCallerIdentityRequestValid: "YES",
    sigv4TimestampFreshness: "FRESH", sigv4SubjectTokenRoundTripValid: "YES",
  });
});

test("missing session token and wrong signing region are observed without changing the token", async () => {
  const missing = projectSigv4SubjectToken({ data: form(await subject()) });
  assert.equal(missing.sigv4SessionTokenPresent, "NO");
  assert.equal(missing.sigv4SecurityTokenHeaderPresent, "NO");
  assert.equal(missing.sigv4SecurityTokenSigned, "NO");
  const wrong = projectSigv4SubjectToken({ data: form(await subject({ token: "synthetic", region: "us-east-1" })) });
  assert.equal(wrong.sigv4ExpectedRegion, "NO");
  assert.equal(wrong.sigv4ExpectedHost, "NO");
  assert.equal(wrong.sigv4GetCallerIdentityRequestValid, "NO");
});

test("host, authorization, date, target, audience, and request mutations fail closed", async () => {
  const original = await subject({ token: "synthetic" });
  const wrongHost = mutate(original, (value) => { value.url = value.url.replace("sts.ap-northeast-1", "sts.us-east-1"); });
  assert.equal(projectSigv4SubjectToken({ data: form(wrongHost) }).sigv4ExpectedHost, "NO");
  const missingAuth = mutate(original, (value) => { value.headers = value.headers.filter((h) => h.key.toLowerCase() !== "authorization"); });
  assert.equal(projectSigv4SubjectToken({ data: form(missingAuth) }).sigv4AuthorizationPresent, "NO");
  const missingDate = mutate(original, (value) => { value.headers = value.headers.filter((h) => h.key.toLowerCase() !== "x-amz-date"); });
  assert.equal(projectSigv4SubjectToken({ data: form(missingDate) }).sigv4AmzDatePresent, "NO");
  const missingTarget = mutate(original, (value) => { value.headers = value.headers.filter((h) => h.key.toLowerCase() !== "x-goog-cloud-target-resource"); });
  assert.equal(projectSigv4SubjectToken({ data: form(missingTarget) }).sigv4TargetResourcePresent, "NO");
  assert.equal(projectSigv4SubjectToken({ data: form(original, `${AUDIENCE}-wrong`) }).sigv4TargetResourceMatchesAudience, "NO");
  const malformedRequest = mutate(original, (value) => { value.method = "GET"; });
  assert.equal(projectSigv4SubjectToken({ data: form(malformedRequest) }).sigv4GetCallerIdentityRequestValid, "NO");
});

test("timestamp freshness uses a fixed five-minute tolerance", async () => {
  assert.equal(SIGV4_FRESHNESS_TOLERANCE_MS, 300_000);
  const original = await subject({ token: "synthetic" });
  const setDate = (date: string) => mutate(original, (value) => {
    const header = value.headers.find((item) => item.key.toLowerCase() === "x-amz-date");
    assert.ok(header); header.value = date;
  });
  const now = Date.UTC(2026, 7, 25, 6, 0, 0);
  assert.equal(projectSigv4SubjectToken({ data: form(setDate("20260825T060000Z")) }, now).sigv4TimestampFreshness, "FRESH");
  assert.equal(projectSigv4SubjectToken({ data: form(setDate("20260825T055459Z")) }, now).sigv4TimestampFreshness, "STALE");
  assert.equal(projectSigv4SubjectToken({ data: form(setDate("20260825T060501Z")) }, now).sigv4TimestampFreshness, "FUTURE");
  assert.equal(projectSigv4SubjectToken({ data: form(setDate("invalid")) }, now).sigv4TimestampFreshness, "UNKNOWN");
});

test("round-trip malformed and unavailable evidence preserve closed values without token exposure", async () => {
  const unavailable = projectSigv4SubjectToken({ data: new URLSearchParams() });
  assert.equal(Object.values(unavailable).every((value) => value === "UNKNOWN"), true);
  const malformed = projectSigv4SubjectToken({ data: form("%7Bmalformed") });
  assert.equal(malformed.sigv4SubjectTokenRoundTripValid, "NO");
  assert.equal(Object.values(malformed).filter((value) => value !== "UNKNOWN").length, 1);
  const projected = JSON.stringify(projectSigv4SubjectToken({ data: form(await subject({ token: "never-project-this" })) }));
  assert.doesNotMatch(projected, /never-project|SYNTHETIC|AWS4-HMAC|https?:|amazonaws|iam\.googleapis/);
});
