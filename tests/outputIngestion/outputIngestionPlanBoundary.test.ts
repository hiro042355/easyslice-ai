import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const planPath = new URL("../../lib/outputIngestion/outputIngestionPlan.ts", import.meta.url);
const utilsPath = new URL("../../lib/outputIngestion/outputIngestionUtils.ts", import.meta.url);

test("output ingestion plan remains a pure contract-only boundary", async () => {
  const [plan, utils] = await Promise.all([readFile(planPath, "utf8"), readFile(utilsPath, "utf8")]);
  const source = `${plan}\n${utils}`;
  assert.match(plan, /import type \{[\s\S]*\} from "\.\/types";/);
  assert.doesNotMatch(source, /(?:workflow|operationPipelines|providerClients\/reference|materializers\/reference|referenceOutputIngestion|referenceAsset|postgres|react|next\/|node:fs|node:http|node:https)/i);
  assert.doesNotMatch(source, /\bfetch\s*\(|\b(?:setTimeout|setInterval|Date\.now|Math\.random|randomUUID|process\.env)\b|import\s*\(/);
  assert.doesNotMatch(source, /\b(?:class|new Map\(\)|createOutputIngestionExecutor|executeOutputIngestion)\b/);
  assert.match(plan, /export function buildOutputIngestionPlan/);
  assert.equal((plan.match(/export function/g) ?? []).length, 1);
});
