import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createOperationPipelineDescriptorRegistry } from "../../lib/operationPipelines/operationPipelineRegistry";

const expected = {
  "generate-vocal": ["reference-vocal-resume-pipeline-v1", "reference-vocal-materializer-v1"],
  "generate-music": ["reference-music-resume-pipeline-v1", "reference-music-materializer-v1"],
  "generate-mv": ["reference-mv-resume-pipeline-v1", "reference-mv-materializer-v1"],
} as const;

test("publishes exactly three immutable operation descriptors", () => {
  const registry = createOperationPipelineDescriptorRegistry();
  const listed = registry.listDescriptors();
  assert.equal(listed.length, 3);
  assert.deepEqual(listed.map((descriptor) => descriptor.operation), Object.keys(expected));
  assert.equal(Object.isFrozen(listed), true);
  for (const descriptor of listed) {
    const [bindingId, materializerId] = expected[descriptor.operation];
    assert.equal(descriptor.bindingId, bindingId);
    assert.equal(descriptor.materializerId, materializerId);
    assert.equal(descriptor.availability, "available");
    assert.equal(Object.isFrozen(descriptor), true);
  }
});

test("requires exact available operation and binding metadata", () => {
  const registry = createOperationPipelineDescriptorRegistry();
  const descriptor = registry.getDescriptor("generate-vocal");
  assert.equal(descriptor?.bindingId, "reference-vocal-resume-pipeline-v1");
  assert.notEqual(descriptor, registry.getDescriptor("generate-vocal"));
  assert.equal(registry.getDescriptor("unsupported"), undefined);
  assert.equal(registry.isAvailable("generate-music", "reference-music-resume-pipeline-v1"), true);
  assert.equal(registry.isAvailable("generate-music", "reference-vocal-resume-pipeline-v1"), false);
  assert.equal(registry.isAvailable("unsupported", "reference-music-resume-pipeline-v1"), false);
});

test("descriptor registry source contains metadata only", async () => {
  const source = await readFile(new URL("../../lib/operationPipelines/operationPipelineRegistry.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /credential|secret|endpoint|https?:|persistence|idempotency/i);
  assert.doesNotMatch(source, /createReference(?:Vocal|Music|MV)ResumePipeline|createReferenceProviderClient|ProviderClient<|new Map|resolver/i);
  assert.doesNotMatch(source, /\bexecute\s*\(/);
});

test("returned metadata cannot mutate registry state", () => {
  const registry = createOperationPipelineDescriptorRegistry();
  const listed = registry.listDescriptors();
  assert.throws(() => ((listed[0] as { bindingId: string }).bindingId = "changed"), TypeError);
  assert.equal(registry.getDescriptor("generate-vocal")?.bindingId, "reference-vocal-resume-pipeline-v1");
});
