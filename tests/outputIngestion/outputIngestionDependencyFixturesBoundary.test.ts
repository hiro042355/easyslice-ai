import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = ["referenceOutputFetcher.ts", "referenceContentInspector.ts", "referenceScanner.ts", "referenceAssetStore.ts", "referenceRegistry.ts"];

test("dependency fixtures remain deterministic in-memory capability implementations", async () => {
  const source = (await Promise.all(files.map((file) => readFile(new URL(`../../lib/outputIngestion/${file}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /(?:workflow|operationPipelines|referenceOutputIngestion|providerClients|materializers|node:fs|node:http|node:https|globalThis\.fetch|window\.fetch|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval|import\s*\()/i);
  assert.doesNotMatch(source, /(?:postgres|database|filesystem|XMLHttpRequest|WebSocket)/i);
  for (const capability of ["ProviderOutputFetcher", "ContentInspector", "ContentScanner", "AssetStoreWriter", "ImportedAssetRegistry"]) assert.match(source, new RegExp(capability));
});
