import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packagePathSegments = (packageName) => packageName.split("/");

const findInstalledPackage = async (nodeModulesRoot, requestingPackage, packageName) => {
  let searchFrom = requestingPackage ?? path.dirname(nodeModulesRoot);
  while (true) {
    const candidate = path.join(searchFrom, "node_modules", ...packagePathSegments(packageName));
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch (error) {
      if (!(error instanceof Error) || !Reflect.has(error, "code") || error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(searchFrom);
    if (parent === searchFrom) break;
    searchFrom = parent;
  }

  const rootCandidate = path.join(nodeModulesRoot, ...packagePathSegments(packageName));
  try {
    if ((await stat(rootCandidate)).isDirectory()) return rootCandidate;
  } catch (error) {
    if (!(error instanceof Error) || !Reflect.has(error, "code") || error.code !== "ENOENT") throw error;
  }
  return undefined;
};

export const copyRuntimeDependencyClosure = async ({ nodeModulesRoot, targetRoot, packageNames }) => {
  const sourceRoot = path.resolve(nodeModulesRoot);
  const destinationRoot = path.resolve(targetRoot);
  await rm(destinationRoot, { recursive: true, force: true });
  await mkdir(destinationRoot, { recursive: true });

  const pending = packageNames.map((packageName) => ({ packageName, requestingPackage: undefined }));
  const copied = new Set();

  while (pending.length > 0) {
    const request = pending.pop();
    const packageDirectory = await findInstalledPackage(sourceRoot, request.requestingPackage, request.packageName);
    if (!packageDirectory) {
      if (request.optional) continue;
      throw new Error(`runtime-dependency-missing:${request.packageName}`);
    }

    const relativeDirectory = path.relative(sourceRoot, packageDirectory);
    if (relativeDirectory.startsWith("..") || path.isAbsolute(relativeDirectory)) {
      throw new Error("runtime-dependency-outside-node-modules");
    }
    if (copied.has(relativeDirectory)) continue;

    const manifest = JSON.parse(await readFile(path.join(packageDirectory, "package.json"), "utf8"));
    const destination = path.join(destinationRoot, relativeDirectory);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(packageDirectory, destination, { recursive: true, dereference: true });
    copied.add(relativeDirectory);

    for (const packageName of Object.keys(manifest.dependencies ?? {})) {
      pending.push({ packageName, requestingPackage: packageDirectory, optional: false });
    }
    for (const packageName of Object.keys(manifest.optionalDependencies ?? {})) {
      pending.push({ packageName, requestingPackage: packageDirectory, optional: true });
    }
  }

  return [...copied].sort();
};

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  const [, , nodeModulesRoot, targetRoot, ...packageNames] = process.argv;
  if (!nodeModulesRoot || !targetRoot || packageNames.length === 0) {
    throw new Error("usage: copyRuntimeDependencyClosure <node_modules> <target> <package...>");
  }
  copyRuntimeDependencyClosure({ nodeModulesRoot, targetRoot, packageNames }).catch((error) => {
    console.error(error instanceof Error ? error.message : "runtime-dependency-packaging-failed");
    process.exitCode = 1;
  });
}
