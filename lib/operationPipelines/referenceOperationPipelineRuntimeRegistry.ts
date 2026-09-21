import type { ProviderOperation } from "@/lib/providerClients/types";
import type { OperationResumePipeline } from "./referenceOperationResumeTypes";

export type ReferenceOperationPipelineRuntimeBinding = Readonly<{
  operation: ProviderOperation;
  bindingId: string;
  pipeline: OperationResumePipeline;
}>;

export type ReferenceOperationPipelineRuntimeRegistry = Readonly<{
  get(operation: ProviderOperation, bindingId: string): OperationResumePipeline | undefined;
  listBindings(): readonly Readonly<{ operation: ProviderOperation; bindingId: string }>[];
}>;

const expectedBindingIds: Readonly<Record<ProviderOperation, string>> = Object.freeze({
  "generate-vocal": "reference-vocal-resume-pipeline-v1",
  "generate-music": "reference-music-resume-pipeline-v1",
  "generate-mv": "reference-mv-resume-pipeline-v1",
});

const key = (operation: ProviderOperation, bindingId: string) => `${operation}:${bindingId}`;

export function createReferenceOperationPipelineRuntimeRegistry(
  bindings: readonly ReferenceOperationPipelineRuntimeBinding[],
): ReferenceOperationPipelineRuntimeRegistry {
  const values = new Map<string, ReferenceOperationPipelineRuntimeBinding>();

  for (const binding of bindings) {
    if (expectedBindingIds[binding.operation] !== binding.bindingId || values.has(key(binding.operation, binding.bindingId))) {
      throw new Error("invalid-reference-operation-pipeline-runtime-binding");
    }
    values.set(key(binding.operation, binding.bindingId), Object.freeze({ ...binding }));
  }

  return Object.freeze({
    get(operation: ProviderOperation, bindingId: string) {
      return values.get(key(operation, bindingId))?.pipeline;
    },
    listBindings() {
      return Object.freeze([...values.values()].map(({ operation, bindingId }) => Object.freeze({ operation, bindingId })));
    },
  });
}
