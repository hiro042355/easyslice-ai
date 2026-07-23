import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ReferenceFilesystemInputMaterializationAdapter,
  type FilesystemMaterializationCapability,
  type InputMaterializationDependencies,
} from "../../../lib/server/inputMaterialization/referenceFilesystemInputMaterializationAdapter";
import type {
  InputMaterializationContext,
  InputMaterializationRequest,
} from "../../../lib/server/inputMaterialization/types";

const context = (): InputMaterializationContext => ({
  contextVersion: "1.0",
  executionWorkspaceReference: "workspace-001",
  executionOperationIdentity: "operation-001",
});
const request = (): InputMaterializationRequest => ({
  requestVersion: "1.0",
  requestIdentity: "request-001",
  operationIdentity: "operation-001",
  sourceArtifact: { referenceVersion: "1.0", opaqueSourceArtifactReference: "source-001" },
  workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: "workspace-001" },
  materializedArtifact: { referenceVersion: "1.0", opaqueMaterializedArtifactReference: "clip_input_01" },
  ownership: {
    projectionVersion: "1.0",
    authenticatedTenantReference: "tenant-001",
    requestTenantReference: "tenant-001",
    sourceTenantReference: "tenant-001",
    workspaceTenantReference: "tenant-001",
    authenticatedOwnershipReference: "owner-001",
    sourceOwnershipReference: "owner-001",
    workspaceOwnershipReference: "owner-001",
    operationOwnershipReference: "owner-001",
  },
  policy: { policyVersion: "1.0", collisionPolicy: "reject-existing" },
});

const setup = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "input-materialization-"));
  const source = path.join(root, "source.bin");
  const workspace = path.join(root, "workspace");
  await writeFile(source, "fixture-content");
  await mkdir(workspace);
  const calls = { source: 0, workspace: 0, inspect: 0, copy: 0 };
  const dependencies: InputMaterializationDependencies = {
    sourceLocator: { locateSource: async () => { calls.source += 1; return { location: source }; } },
    workspaceLocator: { locateWorkspace: async () => { calls.workspace += 1; return { location: workspace }; } },
  };
  return { root, source, workspace, calls, dependencies };
};

test("materializes one regular file with deterministic opaque output", async () => {
  const fixture = await setup();
  try {
    const adapter = new ReferenceFilesystemInputMaterializationAdapter(fixture.dependencies);
    const first = await adapter.materialize(request(), context());
    assert.equal(first.classification, "materialized");
    assert.equal(first.materializedArtifact?.opaqueMaterializedArtifactReference, "clip_input_01");
    assert.equal(await readFile(path.join(fixture.workspace, "clip_input_01"), "utf8"), "fixture-content");
    assert.equal(await readFile(fixture.source, "utf8"), "fixture-content");
    assert.deepEqual(fixture.calls, { source: 1, workspace: 1, inspect: 0, copy: 0 });
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.audit));
    assert.ok(Object.isFrozen(first.audit.entries));
    const second = await adapter.materialize(request(), context());
    assert.equal(second.reasonCode, "duplicate-request");
    assert.deepEqual(fixture.calls, { source: 1, workspace: 1, inspect: 0, copy: 0 });
    assert.doesNotMatch(JSON.stringify(first), new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects dangerous references before invoking dependencies", async () => {
  const dangerous = ["..", ".", "/", "\\", "C:", "\0", "%2F", "%2f", "%5C", "%5c",
    "/tmp/input", "C:\\temp\\input", "\\\\server\\share", ".hidden", "trailing.", " leading", "trailing "];
  for (const value of dangerous) {
    const fixture = await setup();
    try {
      const variants: InputMaterializationRequest[] = [
        { ...request(), sourceArtifact: { referenceVersion: "1.0", opaqueSourceArtifactReference: value } },
        { ...request(), workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: value } },
        { ...request(), materializedArtifact: { referenceVersion: "1.0", opaqueMaterializedArtifactReference: value } },
      ];
      for (const item of variants) {
        const actual = await new ReferenceFilesystemInputMaterializationAdapter(fixture.dependencies)
          .materialize(item, context());
        assert.equal(actual.classification, "invalid");
        assert.deepEqual(fixture.calls, { source: 0, workspace: 0, inspect: 0, copy: 0 });
        if (value.length > 3)
          assert.ok(!JSON.stringify(actual).includes(value));
      }
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});

test("invalid request, policy, collision, and ownership stop before dependencies", async () => {
  const fixture = await setup();
  try {
    const cases: InputMaterializationRequest[] = [
      { ...request(), requestIdentity: "" },
      { ...request(), policy: { policyVersion: "1.0", collisionPolicy: "replace-existing" as "reject-existing" } },
      { ...request(), materializedArtifact: { referenceVersion: "1.0", opaqueMaterializedArtifactReference: "source-001" } },
      { ...request(), ownership: { ...request().ownership, sourceTenantReference: "other" } },
    ];
    for (const item of cases) {
      const actual = await new ReferenceFilesystemInputMaterializationAdapter(fixture.dependencies)
        .materialize(item, context());
      assert.ok(["invalid", "rejected"].includes(actual.classification));
    }
    assert.deepEqual(fixture.calls, { source: 0, workspace: 0, inspect: 0, copy: 0 });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("normalizes locator failures without sensitive leakage", async () => {
  const fixture = await setup();
  const secret = path.join(fixture.root, "secret");
  try {
    const sourceFailure = new ReferenceFilesystemInputMaterializationAdapter({
      ...fixture.dependencies,
      sourceLocator: { locateSource: () => { throw new Error(secret); } },
    });
    const workspaceFailure = new ReferenceFilesystemInputMaterializationAdapter({
      ...fixture.dependencies,
      workspaceLocator: { locateWorkspace: () => { throw new Error(secret); } },
    });
    for (const actual of [
      await sourceFailure.materialize(request(), context()),
      await workspaceFailure.materialize(request(), context()),
    ]) {
      assert.equal(actual.classification, "unavailable");
      assert.equal(actual.retryClassification, "retry-safe");
      assert.doesNotMatch(JSON.stringify(actual), /secret|Error|stack/i);
      assert.doesNotMatch(JSON.stringify(actual), new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("classifies source, workspace, collision, copy, symlink, and containment failures", async () => {
  const fixture = await setup();
  try {
    const entry = (kind: "file" | "directory" | "symbolic-link" | "other", exists = true) => ({ exists, kind });
    const scenarios: readonly [FilesystemMaterializationCapability, string][] = [
      [{ inspect: async (location) => location === fixture.source ? entry("other", false) : entry("directory"), copyExclusive: async () => {} }, "source-not-found"],
      [{ inspect: async (location) => location === fixture.source ? entry("directory") : entry("directory"), copyExclusive: async () => {} }, "source-not-regular"],
      [{ inspect: async (location) => location === fixture.source ? entry("symbolic-link") : entry("directory"), copyExclusive: async () => {} }, "source-not-regular"],
      [{ inspect: async (location) => location === fixture.source ? entry("file") : entry("other", false), copyExclusive: async () => {} }, "workspace-not-found"],
      [{ inspect: async (location) => location === fixture.source ? entry("file") : entry("file"), copyExclusive: async () => {} }, "workspace-not-directory"],
      [{ inspect: async (location) => location === fixture.source ? entry("file") : location === fixture.workspace ? entry("directory") : entry("file"), copyExclusive: async () => {} }, "destination-already-exists"],
      [{ inspect: async (location) => location === fixture.source ? entry("file") : location === fixture.workspace ? entry("directory") : entry("other", false), copyExclusive: async () => { throw new Error("raw-secret"); } }, "copy-failed"],
    ];
    for (const [filesystem, reason] of scenarios) {
      const actual = await new ReferenceFilesystemInputMaterializationAdapter({
        ...fixture.dependencies, filesystem,
      }).materialize(request(), context());
      assert.equal(actual.reasonCode, reason);
      assert.doesNotMatch(JSON.stringify(actual), /raw-secret/);
    }

    const outsideWorkspace = path.join(fixture.root, "workspace-10");
    await mkdir(outsideWorkspace);
    const containment = await new ReferenceFilesystemInputMaterializationAdapter({
      sourceLocator: fixture.dependencies.sourceLocator,
      workspaceLocator: { locateWorkspace: async () => ({ location: path.join(outsideWorkspace, "..", "workspace") }) },
    }).materialize(request(), context());
    assert.equal(containment.classification, "materialized");
    assert.equal(await readFile(path.join(fixture.workspace, "clip_input_01"), "utf8"), "fixture-content");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("copies dependency inputs and returns isolated deterministic decisions", async () => {
  const fixture = await setup();
  try {
    const observed: string[] = [];
    const dependencies: InputMaterializationDependencies = {
      sourceLocator: { locateSource: async (value) => { observed.push(value.opaqueReference); return { location: fixture.source }; } },
      workspaceLocator: { locateWorkspace: async (value) => { observed.push(value.opaqueReference); return { location: fixture.workspace }; } },
    };
    const oneRequest = request();
    const one = await new ReferenceFilesystemInputMaterializationAdapter(dependencies).materialize(oneRequest, context());
    await rm(path.join(fixture.workspace, "clip_input_01"));
    const two = await new ReferenceFilesystemInputMaterializationAdapter(dependencies).materialize(request(), context());
    assert.deepEqual(one, two);
    assert.deepEqual(observed, ["source-001", "workspace-001", "source-001", "workspace-001"]);
    assert.notStrictEqual(one.audit, two.audit);
    assert.notStrictEqual(one.audit.entries, two.audit.entries);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
