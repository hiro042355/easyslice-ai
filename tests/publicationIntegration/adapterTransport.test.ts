import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADAPTER_PUBLICATION_PATH,
  adapterRequestSignatureMessage,
  buildAdapterPublicationRequest,
  sendTikTokPublication,
  verifyAdapterRequestSignature,
} from "../../lib/publicationIntegration/adapterTransport";

const NOW = 1_700_000_000_000;
const BODY = '{"grant":"g"}';

type FetchCall = { url: string; init: RequestInit };

const fakeFetch = (
  outcome: { status: number; body: string } | Error,
  calls: FetchCall[],
): typeof fetch =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (outcome instanceof Error) throw outcome;
    return new Response(outcome.body, { status: outcome.status });
  }) as unknown as typeof fetch;

describe("adapter publication transport", () => {
  it("pins the cross-repo signature vector", () => {
    const request = buildAdapterPublicationRequest({ grant: "g", keyId: "k-1", secret: "s", now: NOW });
    assert.ok(request);
    assert.equal(adapterRequestSignatureMessage(BODY, NOW).split("\n").length, 5);
    assert.equal(request.headers["x-nexcut-transport-signature"], "2xt1cCaGdhsNYi7hkiopSq2kjRI3BKcwuMuuHO7G0CE");
  });

  it("builds a canonical body and rejects incomplete input", () => {
    const request = buildAdapterPublicationRequest({ grant: "g", keyId: "k-1", secret: "s", now: NOW });
    assert.ok(request);
    assert.equal(request.path, ADAPTER_PUBLICATION_PATH);
    assert.equal(request.body, BODY);
    assert.equal(request.headers["content-type"], "application/json");
    assert.equal(buildAdapterPublicationRequest({ grant: "", keyId: "k-1", secret: "s" }), undefined);
    assert.equal(buildAdapterPublicationRequest({ grant: "g", keyId: "", secret: "s" }), undefined);
  });

  it("verifies its own signed request and detects tampering, staleness and unknown keys", () => {
    const request = buildAdapterPublicationRequest({ grant: "g", keyId: "k-1", secret: "s", now: NOW });
    assert.ok(request);
    assert.equal(
      verifyAdapterRequestSignature({ body: request.body, headers: request.headers, secrets: { "k-1": "s" }, now: NOW }),
      "VERIFIED",
    );
    assert.equal(
      verifyAdapterRequestSignature({
        body: '{"grant":"other"}',
        headers: request.headers,
        secrets: { "k-1": "s" },
        now: NOW,
      }),
      "UNAUTHENTICATED",
    );
    assert.equal(
      verifyAdapterRequestSignature({
        body: request.body,
        headers: request.headers,
        secrets: { "k-1": "s" },
        now: NOW + 120_000,
      }),
      "STALE",
    );
    assert.equal(
      verifyAdapterRequestSignature({ body: request.body, headers: request.headers, secrets: {}, now: NOW }),
      "UNAUTHENTICATED",
    );
  });

  it("returns the adapter result on success", async () => {
    const calls: FetchCall[] = [];
    const outcome = await sendTikTokPublication({
      grant: "g",
      endpoint: "https://adapter.test/",
      keyId: "k-1",
      secret: "s",
      now: NOW,
      fetchImpl: fakeFetch({ status: 200, body: '{"code":"OUTCOME_UNKNOWN","publicationId":"p1"}' }, calls),
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://adapter.test/publications/tiktok");
    assert.equal((calls[0]?.init.headers as Record<string, string>)["x-nexcut-transport-key-id"], "k-1");
    assert.equal(outcome.code, "ADAPTER_RESULT");
    assert.equal(outcome.code === "ADAPTER_RESULT" && outcome.result.code, "OUTCOME_UNKNOWN");
  });

  it("treats a non-2xx answer as a transport failure and does not retry", async () => {
    const calls: FetchCall[] = [];
    const outcome = await sendTikTokPublication({
      grant: "g",
      endpoint: "https://adapter.test",
      keyId: "k-1",
      secret: "s",
      now: NOW,
      fetchImpl: fakeFetch({ status: 503, body: "down" }, calls),
    });
    assert.equal(calls.length, 1);
    assert.equal(outcome.code, "TRANSPORT_FAILURE");
    assert.equal(outcome.code === "TRANSPORT_FAILURE" && outcome.reason, "STATUS");
    assert.equal(outcome.code === "TRANSPORT_FAILURE" && outcome.status, 503);
  });

  it("separates a network failure from a timeout and never retries either", async () => {
    const networkCalls: FetchCall[] = [];
    const network = await sendTikTokPublication({
      grant: "g",
      endpoint: "https://adapter.test",
      keyId: "k-1",
      secret: "s",
      now: NOW,
      fetchImpl: fakeFetch(new TypeError("fetch failed"), networkCalls),
    });
    assert.equal(networkCalls.length, 1);
    assert.equal(network.code === "TRANSPORT_FAILURE" && network.reason, "NETWORK");

    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const timeoutCalls: FetchCall[] = [];
    const timeout = await sendTikTokPublication({
      grant: "g",
      endpoint: "https://adapter.test",
      keyId: "k-1",
      secret: "s",
      now: NOW,
      fetchImpl: fakeFetch(abort, timeoutCalls),
    });
    assert.equal(timeoutCalls.length, 1);
    assert.equal(timeout.code === "TRANSPORT_FAILURE" && timeout.reason, "TIMEOUT");
  });

  it("rejects a malformed or unknown adapter answer instead of guessing", async () => {
    const malformed = await sendTikTokPublication({
      grant: "g",
      endpoint: "https://adapter.test",
      keyId: "k-1",
      secret: "s",
      now: NOW,
      fetchImpl: fakeFetch({ status: 200, body: "not json" }, []),
    });
    assert.equal(malformed.code, "MALFORMED_RESPONSE");

    const unknown = await sendTikTokPublication({
      grant: "g",
      endpoint: "https://adapter.test",
      keyId: "k-1",
      secret: "s",
      now: NOW,
      fetchImpl: fakeFetch({ status: 200, body: '{"code":"MAYBE"}' }, []),
    });
    assert.equal(unknown.code, "MALFORMED_RESPONSE");
  });

  it("never sends an empty grant", async () => {
    const calls: FetchCall[] = [];
    const outcome = await sendTikTokPublication({
      grant: "",
      endpoint: "https://adapter.test",
      keyId: "k-1",
      secret: "s",
      now: NOW,
      fetchImpl: fakeFetch({ status: 200, body: "{}" }, calls),
    });
    assert.equal(calls.length, 0);
    assert.equal(outcome.code, "TRANSPORT_FAILURE");
  });
});
