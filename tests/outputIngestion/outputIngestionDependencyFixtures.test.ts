import assert from "node:assert/strict";
import test from "node:test";
import type { OutputContentHandle, OutputIngestionPlan } from "../../lib/outputIngestion/types";
import { ReferenceOutputFetcher } from "../../lib/outputIngestion/referenceOutputFetcher";
import { ReferenceContentInspector } from "../../lib/outputIngestion/referenceContentInspector";
import { ReferenceScanner, ReferenceSanitizer } from "../../lib/outputIngestion/referenceScanner";
import { ReferenceAssetStore } from "../../lib/outputIngestion/referenceAssetStore";
import { ReferenceRegistry } from "../../lib/outputIngestion/referenceRegistry";

const handle = (contentRef: string) => ({ handleVersion: "1.0", contentRef } as OutputContentHandle);
const policy = { policyVersion: "1.0", externalFetchAllowed: true, maximumDownloadBytes: 200_000, requireHttps: true, redirectPolicy: "none", retentionClass: "project", sensitivityClass: "standard", scanRequired: true, metadataStrippingRequired: true, deletionPending: false } satisfies OutputIngestionPlan["policy"];

test("fetcher provides deterministic success and normalized failures", async () => {
  const fetcher = new ReferenceOutputFetcher();
  const access = (reference: string) => ({ mode: "provider-reference", reference } as Parameters<typeof fetcher.fetch>[0]["access"]);
  const success = await fetcher.fetch({ access: access("ref-vocal"), maximumBytes: 100_000, requireHttps: true, redirectPolicy: "none" });
  assert.equal(success.status, "fetched");
  assert.deepEqual(success, await fetcher.fetch({ access: access("ref-vocal"), maximumBytes: 100_000, requireHttps: true, redirectPolicy: "none" }));
  for (const [reference, category, retryable] of [["ref-expired", "reference-expired", false], ["ref-timeout", "fetch-timeout", true], ["missing", "fetch-failed", true]] as const) {
    const result = await fetcher.fetch({ access: access(reference), maximumBytes: 100_000, requireHttps: true, redirectPolicy: "none" });
    assert.deepEqual(result, { status: "failed", error: { category, retryable } });
  }
  const tooLarge = await fetcher.fetch({ access: access("ref-vocal"), maximumBytes: 1, requireHttps: true, redirectPolicy: "none" });
  assert.equal(tooLarge.status, "failed");
});

test("inspector, scanner and sanitizer expose isolated deterministic fixtures", async () => {
  const inspector = new ReferenceContentInspector();
  const inspected = await inspector.inspect(handle("content-video"));
  assert.equal(inspected.status, "inspected");
  assert.equal((await inspector.inspect(handle("unknown"))).status, "failed");
  const scanner = new ReferenceScanner();
  assert.deepEqual(await Promise.all(["clean", "pending", "blocked", "quarantine"].map((value) => scanner.scan(handle(value)))), [{ status: "passed" }, { status: "pending" }, { status: "blocked" }, { status: "quarantined" }]);
  const original = handle("content-vocal");
  const sanitized = await new ReferenceSanitizer().sanitize(original);
  assert.equal(sanitized.status, "unchanged");
  if (sanitized.status === "unchanged") assert.notEqual(sanitized.content, original);
});

test("asset store and registry implement isolated in-memory capability behavior", async () => {
  const store = new ReferenceAssetStore();
  const written = await store.write({ content: handle("content-vocal"), checksum: "1".repeat(64), sizeBytes: 48_000, mimeType: "audio/wav", policy });
  assert.equal(written.status, "written");
  assert.equal((await store.write({ content: handle("storage-failure"), checksum: "x", sizeBytes: 1, mimeType: "audio/wav", policy })).status, "failed");
  assert.deepEqual(await store.schedule("cleanup-required", handle("content-vocal")), { status: "scheduled" });

  const registry = new ReferenceRegistry();
  const created = await registry.create({ slotIndex: 0, kind: "audio", mimeType: "audio/wav", sizeBytes: 48_000, checksum: "1".repeat(64), metadata: { durationSeconds: 10, codec: "pcm" }, availability: "available", locatorRef: "locator", policy });
  assert.equal(created.status, "created");
  const found = await registry.find({ checksum: "1".repeat(64), sizeBytes: 48_000, mimeType: "audio/wav", policy });
  assert.ok(found);
  if (created.status === "created") created.record.mimeType = "changed";
  assert.equal((await registry.find({ checksum: "1".repeat(64), sizeBytes: 48_000, mimeType: "audio/wav", policy }))?.mimeType, "audio/wav");
  assert.equal((await registry.create({ slotIndex: 1, kind: "audio", mimeType: "audio/wav", sizeBytes: 1, checksum: "x", metadata: {}, availability: "available", locatorRef: "registry-failure", policy })).status, "failed");
});
