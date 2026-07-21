import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

import { getMaterializerDescriptor, getMaterializerDescriptorById, listMaterializers } from "../../lib/materializers/materializerRegistry";
import { referenceMusicMaterializationProfile, referenceMVMaterializationProfile, referenceVocalMaterializationProfile } from "../../lib/materializers/referenceProfiles";
import type { MaterializerDescriptor } from "../../lib/materializers/types";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REGISTRY = `${ROOT}lib/materializers/materializerRegistry.ts`;
const expected = [
  ["reference-vocal-materializer-v1", referenceVocalMaterializationProfile],
  ["reference-music-materializer-v1", referenceMusicMaterializationProfile],
  ["reference-mv-materializer-v1", referenceMVMaterializationProfile],
] as const;

async function importRegistryVariant(mutate: (source: string) => string): Promise<typeof import("../../lib/materializers/materializerRegistry")> {
  let source = mutate(await readFile(REGISTRY, "utf8"));
  for (const dependency of ["materializerUtils", "referenceProfiles"] as const) {
    const url = pathToFileURL(`${ROOT}lib/materializers/${dependency}.ts`).href;
    source = source.replace(`"./${dependency}"`, `"${url}"`);
  }
  source = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const encoded = Buffer.from(source).toString("base64");
  return import(`data:text/javascript;base64,${encoded}#${encoded.length}`);
}

test("Materializer Registry lists exactly three deterministic profile projections", () => {
  const descriptors = listMaterializers();
  assert.equal(descriptors.length, 3);
  assert.deepEqual(descriptors.map((descriptor) => descriptor.materializerId), expected.map(([id]) => id));
  expected.forEach(([materializerId, profile], index) => assert.deepEqual(descriptors[index], {
    materializerId,
    materializerVersion: "reference-v1",
    providerId: profile.providerId,
    providerApiVersion: profile.providerApiVersion,
    operation: profile.operation,
    profileVersion: profile.profileVersion,
    availability: "available",
  }));
});

test("Materializer Registry supports exact ID and provider-operation lookup", () => {
  for (const [materializerId, profile] of expected) {
    assert.deepEqual(getMaterializerDescriptorById(materializerId), listMaterializers().find((descriptor) => descriptor.materializerId === materializerId));
    assert.deepEqual(getMaterializerDescriptor(profile.providerId, profile.operation), getMaterializerDescriptorById(materializerId));
  }
  assert.equal(getMaterializerDescriptorById("unknown-materializer"), undefined);
  assert.equal(getMaterializerDescriptor("unknown-provider", "generate-vocal"), undefined);
  assert.equal(getMaterializerDescriptorById(""), undefined);
  assert.equal(getMaterializerDescriptor("reference-provider\n", "generate-vocal"), undefined);
  assert.equal(getMaterializerDescriptor("REFERENCE-PROVIDER", "generate-vocal"), undefined);
});

test("Materializer Registry results are deeply frozen and mutation-isolated", () => {
  const firstList = listMaterializers();
  const first = getMaterializerDescriptorById("reference-vocal-materializer-v1");
  assert.ok(first);
  assert.equal(Object.isFrozen(firstList), true);
  assert.equal(firstList.every(Object.isFrozen), true);
  assert.equal(Object.isFrozen(first), true);
  assert.notEqual(firstList, listMaterializers());
  assert.notEqual(first, getMaterializerDescriptorById(first.materializerId));
  assert.throws(() => (firstList as MaterializerDescriptor[]).pop(), TypeError);
  assert.throws(() => { (first as { availability: string }).availability = "disabled"; }, TypeError);
  assert.equal(getMaterializerDescriptorById(first.materializerId)?.availability, "available");
});

test("Disabled descriptors remain auditable by ID but are excluded from selection", async () => {
  const registry = await importRegistryVariant((source) => source
    .replace('materializerId: "reference-vocal-materializer-v1",\n    materializerVersion:', 'materializerId: "reference-vocal-materializer-v1",\n    availability: "disabled",\n    materializerVersion:')
    .replace('profile: referenceVocalMaterializationProfile,\n    availability: "available",', "profile: referenceVocalMaterializationProfile,"));
  assert.equal(registry.getMaterializerDescriptorById("reference-vocal-materializer-v1")?.availability, "disabled");
  assert.equal(registry.getMaterializerDescriptor("reference-provider", "generate-vocal"), undefined);
  assert.equal(registry.listMaterializers().length, 3);
});

test("Registry initialization rejects duplicate materializer IDs", async () => {
  await assert.rejects(importRegistryVariant((source) => source.replace("reference-music-materializer-v1", "reference-vocal-materializer-v1")), /duplicate registration/);
});

test("Registry initialization rejects duplicate provider-operation selection keys", async () => {
  await assert.rejects(importRegistryVariant((source) => source.replace("profile: referenceMusicMaterializationProfile", "profile: referenceVocalMaterializationProfile")), /duplicate registration/);
});
