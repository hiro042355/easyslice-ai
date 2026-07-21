import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FILES = ["materializerUtils.ts", "referenceProfiles.ts", "referenceVocalMaterializer.ts", "referenceMusicMaterializer.ts", "referenceMVMaterializer.ts"] as const;

test("Reference Materializer Runtime keeps its pure five-file production boundary", async () => {
  assert.equal(FILES.length, 5);
  for (const file of FILES) {
    const source = await readFile(`${ROOT}lib/materializers/${file}`, "utf8");
    assert.ok(source.length > 0);
    assert.equal(/@\/lib\/(?:workflows?|providerClients|providerUploads?|providerUploadGate|outputIngestion)|materializerRegistry|app\/|components\//.test(source), false, file);
    assert.equal(/node:|process\.env|fetch\s*\(|XMLHttpRequest|WebSocket|console\.|setTimeout|setInterval|Date\.now|new\s+Date\s*\(\s*\)|Math\.random|randomUUID|readFile|writeFile/.test(source), false, file);
    assert.equal(/\b(?:apiKey|bearerToken|authorizationHeader|credentialValue)\b/i.test(source), false, file);
    assert.equal(/^(?:export\s+)?(?:let|var)\s/m.test(source), false, file);
    assert.equal(/\b(?:register|unregister|reset)\s*\(/.test(source), false, file);
  }
});
