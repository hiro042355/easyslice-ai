import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { copyRuntimeDependencyClosure } from "../../scripts/copyRuntimeDependencyClosure.mjs";

const writePackage = async (root: string, name: string, dependencies: Record<string, string> = {}) => {
  const directory = path.join(root, "node_modules", ...name.split("/"));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version: "1.0.0", dependencies }));
  await writeFile(path.join(directory, "index.js"), `module.exports = ${JSON.stringify(name)};`);
};

test("runtime packaging copies only the requested production dependency closure", async () => {
  const root = path.join(tmpdir(), `nexcut-runtime-deps-${process.pid}-${Date.now()}`);
  const target = path.join(root, "runtime");
  await writePackage(root, "google-auth-library", { gaxios: "1.0.0" });
  await writePackage(root, "gaxios", { "safe-runtime-leaf": "1.0.0" });
  await writePackage(root, "safe-runtime-leaf");
  await writePackage(root, "unrelated-production-package");

  const copied = await copyRuntimeDependencyClosure({
    nodeModulesRoot: path.join(root, "node_modules"),
    targetRoot: target,
    packageNames: ["google-auth-library"],
  });

  assert.deepEqual(copied, ["gaxios", "google-auth-library", "safe-runtime-leaf"]);
  await assert.doesNotReject(() => readFile(path.join(target, "google-auth-library", "package.json")));
  await assert.rejects(() => readFile(path.join(target, "unrelated-production-package", "package.json")), /ENOENT/);
});

test("Worker runtime image packages the locked ADC dependency without the development tree", async () => {
  const dockerfile = await readFile("worker/acquisition/Dockerfile", "utf8");
  assert.match(dockerfile, /copyRuntimeDependencyClosure\.mjs \/src\/node_modules \/runtime-node-modules google-auth-library/);
  assert.match(dockerfile, /COPY --from=build \/runtime-node-modules \.\/node_modules/);
  assert.doesNotMatch(dockerfile, /COPY --from=build \/src\/node_modules \.\/node_modules/);
  assert.doesNotMatch(dockerfile, /npm (?:install|update).*google-auth-library/);
});
