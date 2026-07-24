import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import {
  ReferenceZipPackagingAdapter,
  type ZipPackagingDependencies,
} from "../../../lib/server/zipPackaging/referenceZipPackagingAdapter";
import type { PackagingRequest } from "../../../lib/server/zipPackaging/types";

const request = (): PackagingRequest => ({
  requestVersion: "1.0",
  requestIdentity: "request-001",
  operationIdentity: "operation-001",
  outputs: [
    { referenceVersion: "1.0", opaqueOutputArtifactReference: "output-001" },
    { referenceVersion: "1.0", opaqueOutputArtifactReference: "output-002" },
  ],
  archive: { referenceVersion: "1.0", opaqueArchiveReference: "archive-001" },
  namingPolicy: { policyVersion: "1.0", classification: "operation-identity" },
  collisionPolicy: { policyVersion: "1.0", classification: "reject-existing" },
});

const setup = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zip-packaging-"));
  const outputDirectory = path.join(root, "outputs");
  const archiveDirectory = path.join(root, "archives");
  await mkdir(outputDirectory);
  await mkdir(archiveDirectory);
  await writeFile(path.join(outputDirectory, "output-001"), "first-content");
  await writeFile(path.join(outputDirectory, "output-002"), "second-content");
  const archiveLocation = path.join(archiveDirectory, "operation-001.zip");
  const calls = { output: 0, archive: 0 };
  const dependencies: ZipPackagingDependencies = {
    outputLocator: {
      locateOutput: async ({ opaqueReference }) => {
        calls.output += 1;
        return {
          location: path.join(outputDirectory, opaqueReference),
          archiveEntryName: `${opaqueReference}.mp4`,
        };
      },
    },
    archiveLocator: {
      locateArchive: async ({ deterministicArchiveName }) => {
        calls.archive += 1;
        assert.equal(deterministicArchiveName, "operation-001.zip");
        return { location: archiveLocation };
      },
    },
  };
  return { root, outputDirectory, archiveLocation, calls, dependencies };
};

test("creates one deterministic ZIP containing outputs in request order", async () => {
  const fixture = await setup();
  try {
    const actual = await new ReferenceZipPackagingAdapter(fixture.dependencies).package(request());
    assert.equal(actual.classification, "packaged");
    assert.equal(actual.archive?.opaqueArchiveReference, "archive-001");
    assert.ok(actual.archiveBytes instanceof Uint8Array);
    assert.deepEqual(actual.archiveBytes, new Uint8Array(await readFile(fixture.archiveLocation)));
    assert.equal(actual.outputCount, 2);
    assert.deepEqual(fixture.calls, { output: 2, archive: 1 });
    const archive = new AdmZip(await readFile(fixture.archiveLocation));
    assert.deepEqual(archive.getEntries().map((entry) => entry.entryName),
      ["output-001.mp4", "output-002.mp4"]);
    assert.equal(archive.readAsText("output-001.mp4"), "first-content");
    assert.equal(archive.readAsText("output-002.mp4"), "second-content");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("invalid and duplicate outputs reject before dependencies", async () => {
  const cases: PackagingRequest[] = [
    { ...request(), requestIdentity: "" },
    { ...request(), outputs: [] },
    { ...request(), outputs: [request().outputs[0]!, request().outputs[0]!] },
    { ...request(), archive: { referenceVersion: "1.0", opaqueArchiveReference: "../archive" } },
    { ...request(), namingPolicy: { policyVersion: "1.0", classification: "other" as "operation-identity" } },
    { ...request(), collisionPolicy: { policyVersion: "1.0", classification: "replace-existing" as "reject-existing" } },
  ];
  for (const value of cases) {
    const fixture = await setup();
    try {
      const actual = await new ReferenceZipPackagingAdapter(fixture.dependencies).package(value);
      assert.equal(actual.classification, "invalid");
      assert.deepEqual(fixture.calls, { output: 0, archive: 0 });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});

test("rejects archive collision and preserves existing archive", async () => {
  const fixture = await setup();
  try {
    await writeFile(fixture.archiveLocation, "existing-content");
    const actual = await new ReferenceZipPackagingAdapter(fixture.dependencies).package(request());
    assert.equal(actual.classification, "already-exists");
    assert.equal(actual.retryClassification, "retry-requires-policy-change");
    assert.equal(await readFile(fixture.archiveLocation, "utf8"), "existing-content");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("normalizes missing, non-regular, locator, build, and write failures", async () => {
  const fixture = await setup();
  try {
    const missing = await new ReferenceZipPackagingAdapter({
      ...fixture.dependencies,
      filesystem: {
        inspect: async () => ({ exists: false, kind: "other" }),
        read: async () => new Uint8Array(),
        writeExclusive: async () => {},
      },
    }).package(request());
    assert.equal(missing.reasonCode, "output-not-found");

    const directory = await new ReferenceZipPackagingAdapter({
      ...fixture.dependencies,
      filesystem: {
        inspect: async () => ({ exists: true, kind: "directory" }),
        read: async () => new Uint8Array(),
        writeExclusive: async () => {},
      },
    }).package(request());
    assert.equal(directory.reasonCode, "output-not-regular");

    const locator = await new ReferenceZipPackagingAdapter({
      ...fixture.dependencies,
      outputLocator: { locateOutput: () => { throw new Error("raw-locator-secret"); } },
    }).package(request());
    assert.equal(locator.classification, "unavailable");

    const build = await new ReferenceZipPackagingAdapter({
      ...fixture.dependencies,
      archiveBuilder: { build: () => { throw new Error("raw-builder-secret"); } },
    }).package(request());
    assert.equal(build.reasonCode, "archive-build-failed");

    const empty = await new ReferenceZipPackagingAdapter({
      ...fixture.dependencies,
      archiveBuilder: { build: () => new Uint8Array() },
    }).package(request());
    assert.equal(empty.classification, "failed");
    assert.equal(empty.reasonCode, "archive-build-failed");
    assert.equal(empty.archiveBytes, undefined);

    const write = await new ReferenceZipPackagingAdapter({
      ...fixture.dependencies,
      filesystem: {
        inspect: async (location) => ({
          exists: location.includes("outputs"),
          kind: location.includes("outputs") ? "file" : "other",
        }),
        read: async () => new Uint8Array([1]),
        writeExclusive: async () => { throw new Error("raw-write-secret"); },
      },
    }).package(request());
    assert.equal(write.reasonCode, "archive-write-failed");
    for (const actual of [locator, build, empty, write])
      assert.doesNotMatch(JSON.stringify(actual), /raw-(?:locator|builder|write)-secret/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects duplicate or unsafe archive entry names", async () => {
  const fixture = await setup();
  try {
    for (const name of ["same.mp4", "../unsafe"]) {
      const actual = await new ReferenceZipPackagingAdapter({
        ...fixture.dependencies,
        outputLocator: {
          locateOutput: async ({ opaqueReference }) => ({
            location: path.join(fixture.outputDirectory, opaqueReference),
            archiveEntryName: name,
          }),
        },
      }).package(request());
      assert.equal(actual.reasonCode, "naming-invalid");
      assert.equal(actual.archiveAvailable, false);
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("decisions are deeply frozen, isolated, and deterministic", async () => {
  const execute = async () => {
    const fixture = await setup();
    try {
      return await new ReferenceZipPackagingAdapter(fixture.dependencies).package(request());
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  };
  const one = await execute();
  const two = await execute();
  assert.deepEqual(one, two);
  assert.notStrictEqual(one, two);
  assert.notStrictEqual(one.audit, two.audit);
  assert.ok(Object.isFrozen(one));
  assert.ok(Object.isFrozen(one.audit));
  assert.ok(Object.isFrozen(one.audit.entries));
  assert.ok(one.audit.entries.every(Object.isFrozen));
  assert.notStrictEqual(one.archiveBytes, two.archiveBytes);
});

test("returns fresh archive bytes without rereading the written archive", async () => {
  const fixture = await setup();
  const builderSource = new Uint8Array([10, 20, 30]);
  let readCount = 0;
  let written: Uint8Array | undefined;
  try {
    const dependencies: ZipPackagingDependencies = {
      ...fixture.dependencies,
      filesystem: {
        inspect: async (location) => ({
          exists: location.includes("outputs"),
          kind: location.includes("outputs") ? "file" : "other",
        }),
        read: async () => {
          readCount += 1;
          return new Uint8Array([1]);
        },
        writeExclusive: async (_location, content) => {
          written = new Uint8Array(content);
        },
      },
      archiveBuilder: { build: async () => builderSource },
    };
    const first = await new ReferenceZipPackagingAdapter(dependencies).package(request());
    assert.equal(first.classification, "packaged");
    assert.equal(readCount, request().outputs.length);
    assert.deepEqual(first.archiveBytes, new Uint8Array([10, 20, 30]));
    assert.deepEqual(written, new Uint8Array([10, 20, 30]));
    assert.notStrictEqual(first.archiveBytes, builderSource);
    assert.notStrictEqual(first.archiveBytes, written);

    builderSource[0] = 99;
    written![1] = 99;
    assert.deepEqual(first.archiveBytes, new Uint8Array([10, 20, 30]));

    const second = await new ReferenceZipPackagingAdapter(dependencies).package(request());
    assert.notStrictEqual(first.archiveBytes, second.archiveBytes);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
