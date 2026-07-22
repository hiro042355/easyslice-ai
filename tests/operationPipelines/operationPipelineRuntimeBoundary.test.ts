import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Reference Operation Pipeline owns only injected single-attempt execution", async () => {
  const source = await readFile(
    new URL("../../lib/operationPipelines/referenceOperationPipeline.ts", import.meta.url),
    "utf8",
  );
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(imports, ["./operationBindings", "./types"]);
  assert.match(source, /constructor\(dependencies: ReferenceOperationPipelineDependencies\)/);
  assert.doesNotMatch(source, /constructor\([^)]*=|defaultRegistry|globalRegistry|singleton/i);
  assert.doesNotMatch(
    source,
    /(?:workflows?|providerClients?|providers\/reference|materializers\/reference|referenceOutputIngestion|providerUploads?|react|next\/|node:|http|sql|postgres|queue|poll)/i,
  );
  assert.doesNotMatch(
    source,
    /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval|setImmediate)/,
  );
  assert.doesNotMatch(source, /while\s*\(|retryLoop|scheduleRetry|background|worker/i);
});
