import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name: string) => readFile(new URL(`../../docs/${name}`, import.meta.url), "utf8");

test("source artifact ADR fixes issuance scope durability and external identity semantics", async () => {
  const source = await read("SOURCE_ARTIFACT_IDENTITY_ADR_V1.md");
  for (const required of [
    "Source Registration application service",
    "tenant-scoped",
    "process restart",
    "SourceArtifactReference",
    "ExternalSourceIdentityV1",
    "provider plus external ID is not an internal uniqueness constraint",
    "None for V1",
  ]) assert.match(source, new RegExp(required));
});

test("encoding specification fixes boundary and protected identity authority", async () => {
  const source = await read("CREATOR_PUBLICATION_IDENTITY_ENCODING_SPEC_V1.md");
  for (const required of [
    "HMAC-SHA-256",
    "length-prefixed UTF-8",
    "milliseconds-v1",
    "sub-millisecond values are rejected",
    "generated-clip/v1",
    "publication-command/v1",
    "publication-idempotency-key/v1",
    "principal/v1",
    "publication-reconciliation/v1",
    "None for V1",
  ]) assert.match(source, new RegExp(required));
});

test("authority documents prohibit inference and leave no unresolved placeholder", async () => {
  const source = `${await read("SOURCE_ARTIFACT_IDENTITY_ADR_V1.md")}\n${await read("CREATOR_PUBLICATION_IDENTITY_ENCODING_SPEC_V1.md")}`;
  assert.doesNotMatch(source, /\bTBD\b|TODO|to be decided|fuzzy join allowed/i);
  for (const prohibited of ["Random values", "current time", "title", "filename", "raw credentials", "UI state"])
    assert.match(source, new RegExp(prohibited, "i"));
});
