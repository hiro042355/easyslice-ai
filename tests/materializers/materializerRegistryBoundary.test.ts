import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REGISTRY = "lib/materializers/materializerRegistry.ts";


test("Materializer Registry remains descriptor-only and side-effect free", async () => {
  const source = await readFile(`${ROOT}${REGISTRY}`, "utf8");
  const runtimeImports = [...source.matchAll(/import\s+(?!type\b)[\s\S]*?\sfrom\s+["']([^"']+)["'];/g)]
    .map((match) => match[1]);

  assert.deepEqual(runtimeImports, ["./materializerUtils", "./referenceProfiles"]);
  assert.equal(/providerClients|providerUploads?|outputIngestion|workflows?|app\/|components\//.test(source), false);
  assert.equal(/reference(?:Vocal|Music|MV)Materializer/.test(source), false);
  assert.equal(/\b(?:createMaterializer|getMaterializer|materialize|factory)\b/.test(source), false);
  assert.equal(/\b(?:registerMaterializer|unregisterMaterializer|dynamic\s+import)\b|import\s*\(/.test(source), false);
  assert.equal(/node:|process\.env|fetch\s*\(|XMLHttpRequest|WebSocket|readFile|writeFile/.test(source), false);
  assert.equal(/console\.|setTimeout|setInterval|Date\.now|Math\.random|randomUUID/.test(source), false);
  assert.equal(/\b(?:apiKey|bearerToken|authorizationHeader|credentialValue)\b/i.test(source), false);
  assert.equal(/^(?:export\s+)?(?:let|var)\s/m.test(source), false);

  const exportedFunctions = [...source.matchAll(/export\s+function\s+(\w+)/g)].map((match) => match[1]);
  assert.deepEqual(exportedFunctions, [
    "listMaterializers",
    "getMaterializerDescriptorById",
    "getMaterializerDescriptor",
  ]);
});
