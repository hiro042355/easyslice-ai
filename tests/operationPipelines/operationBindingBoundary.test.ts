import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Operation Binding remains a pure declarative edge foundation", async () => {
  const source = await readFile(
    new URL("../../lib/operationPipelines/operationBindings.ts", import.meta.url),
    "utf8",
  );
  const imports = [...source.matchAll(/import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["'];/g)].map(
    (match) => ({ typeOnly: match[1] !== undefined, target: match[2] }),
  );

  assert.deepEqual(imports, [{ typeOnly: true, target: "./types" }]);
  assert.doesNotMatch(source, /import\s*\(|require\s*\(/);
  assert.doesNotMatch(
    source,
    /(?:workflows?|providerClients?|providers?|materializers?|outputIngestion|providerUploads?|react|next\/|node:|http|sql|postgres|queue)/i,
  );
  assert.doesNotMatch(
    source,
    /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval)/,
  );
  assert.doesNotMatch(source, /\bexecute\s*\(|class\s+|new\s+(?:Reference|Provider|Materializer)/);
});
