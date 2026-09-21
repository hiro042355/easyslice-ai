import assert from "node:assert/strict";
import test from "node:test";
import { createOperationPipelineDescriptorRegistry } from "../../lib/operationPipelines/operationPipelineRegistry";
import { createReferenceOperationPipelineRuntimeRegistry } from "../../lib/operationPipelines/referenceOperationPipelineRuntimeRegistry";

const operations = ["generate-vocal", "generate-music", "generate-mv"] as const;

test("resolves exactly the three server-composed Reference runtime bindings", async () => {
  const calls: string[] = [];
  const registry = createReferenceOperationPipelineRuntimeRegistry(operations.map((operation) => ({
    operation,
    bindingId: `reference-${operation.replace("generate-", "")}-resume-pipeline-v1`,
    pipeline: { async execute() { calls.push(operation); return { status: "failed", issues: [], audit: { auditVersion: "1.0", status: "failed", operation, reasonCodes: [] } } as never; } },
  })));

  for (const operation of operations) {
    const bindingId = `reference-${operation.replace("generate-", "")}-resume-pipeline-v1`;
    const pipeline = registry.get(operation, bindingId);
    assert.ok(pipeline);
    await pipeline.execute({} as never);
  }
  assert.deepEqual(calls, operations);
  assert.deepEqual(registry.listBindings().map(({ operation }) => operation), operations);
});

test("fails safe for mismatched operation or binding identity", () => {
  const pipeline = { execute: async () => ({}) as never };
  const registry = createReferenceOperationPipelineRuntimeRegistry([
    { operation: "generate-vocal", bindingId: "reference-vocal-resume-pipeline-v1", pipeline },
  ]);
  assert.equal(registry.get("generate-vocal", "reference-music-resume-pipeline-v1"), undefined);
  assert.equal(registry.get("generate-music", "reference-vocal-resume-pipeline-v1"), undefined);
  assert.throws(() => createReferenceOperationPipelineRuntimeRegistry([
    { operation: "generate-vocal", bindingId: "caller-runtime", pipeline },
  ]));
});

test("keeps the metadata descriptor registry non-executable", () => {
  const descriptors = createOperationPipelineDescriptorRegistry();
  assert.equal(typeof descriptors.getDescriptor, "function");
  assert.equal("get" in descriptors, false);
  assert.equal("execute" in descriptors, false);
});
