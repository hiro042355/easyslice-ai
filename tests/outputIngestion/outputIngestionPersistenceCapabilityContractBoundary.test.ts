import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { AssetStoreWriterV2, CleanupSchedulerV2, ImportedAssetRegistryV2, IngestionJournalV2, OutputIngestionRecoveryRequiredV2, ProvenanceStoreV2 } from "../../lib/outputIngestion/types";

test("persistence recovery capabilities remain type-only and versioned", async () => {
  const source = await readFile(new URL("../../lib/outputIngestion/types.ts", import.meta.url), "utf8");
  for (const name of ["AssetStoreWriterV2", "ImportedAssetRegistryV2", "IngestionJournalV2", "ProvenanceStoreV2", "CleanupSchedulerV2", "OutputIngestionRecoveryRequiredV2"]) assert.match(source, new RegExp(`export type ${name}`));
  assert.doesNotMatch(source, /export (?:function|class|const) (?:AssetStoreWriterV2|ImportedAssetRegistryV2|IngestionJournalV2|ProvenanceStoreV2|CleanupSchedulerV2)/);
  assert.doesNotMatch(source, /(?:referenceOutputIngestion|operationPipelines|workflows|postgres|node:fs|node:http|globalThis\.fetch|window\.fetch|process\.env)/i);
  const compileOnly = <T,>(): T | undefined => undefined;
  assert.equal(compileOnly<AssetStoreWriterV2>(), undefined);
  assert.equal(compileOnly<ImportedAssetRegistryV2>(), undefined);
  assert.equal(compileOnly<IngestionJournalV2>(), undefined);
  assert.equal(compileOnly<ProvenanceStoreV2>(), undefined);
  assert.equal(compileOnly<CleanupSchedulerV2>(), undefined);
  assert.equal(compileOnly<OutputIngestionRecoveryRequiredV2>(), undefined);
});

test("V1 capability names remain present for source compatibility", async () => {
  const source = await readFile(new URL("../../lib/outputIngestion/types.ts", import.meta.url), "utf8");
  for (const name of ["AssetStoreWriter", "ImportedAssetRegistry", "IngestionJournal", "ProvenanceStore", "CleanupScheduler"]) assert.match(source, new RegExp(`export type ${name}=`));
});
