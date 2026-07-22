import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files=["referencePersistenceAssetStoreV2.ts","referencePersistenceRegistryV2.ts","referencePersistenceJournalV2.ts","referencePersistenceProvenanceV2.ts","referencePersistenceCleanupV2.ts"];
test("persistence V2 fixtures are explicit deterministic in-memory capabilities",async()=>{const source=(await Promise.all(files.map(file=>readFile(new URL(`../../lib/outputIngestion/${file}`,import.meta.url),"utf8")))).join("\n");for(const name of ["AssetStoreWriterV2","ImportedAssetRegistryV2","IngestionJournalV2","ProvenanceStoreV2","CleanupSchedulerV2"])assert.match(source,new RegExp(name));assert.doesNotMatch(source,/(?:referenceOutputIngestion|operationPipelines|workflows|providerClients|postgres|sql|node:fs|node:http|node:https|globalThis\.fetch|window\.fetch|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval|queue|worker|poll)/i);assert.doesNotMatch(source,/export const .*?=new ReferencePersistence/);});
