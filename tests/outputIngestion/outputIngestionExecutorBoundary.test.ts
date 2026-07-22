import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("executor owns one-attempt orchestration and requires explicit capabilities", async () => {
  const source = await readFile(new URL("../../lib/outputIngestion/referenceOutputIngestion.ts", import.meta.url), "utf8");
  assert.match(source, /ReferenceOutputIngestionDependencies/);
  assert.match(source, /constructor\(dependencies:ReferenceOutputIngestionDependencies\)/);
  assert.doesNotMatch(source, /referenceOutputFetcher|referenceContentInspector|referenceScanner|referenceAssetStore|referenceRegistry/);
  assert.doesNotMatch(source, /(?:workflow|operationPipelines|providerClients|materializers|postgres|node:fs|node:http|node:https|globalThis\.fetch|window\.fetch|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval|for\s*\([^)]*retry|while\s*\()/i);
  assert.doesNotMatch(source, /constructor\([^)]*=new |new Reference|executeReferenceOutputIngestion/);
});
