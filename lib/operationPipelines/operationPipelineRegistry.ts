import type {
  OperationPipelineDescriptor,
  OperationPipelineDescriptorOperation,
  OperationPipelineDescriptorRegistry,
} from "./operationPipelineDescriptorTypes";

const freezeDescriptor = (descriptor: OperationPipelineDescriptor): OperationPipelineDescriptor =>
  Object.freeze({ ...descriptor });

const descriptors: readonly OperationPipelineDescriptor[] = Object.freeze([
  freezeDescriptor({
    descriptorVersion: "1.0", bindingId: "reference-vocal-resume-pipeline-v1", operation: "generate-vocal",
    adapterId: "reference-vocal-v1", adapterVersion: "1.0.0", materializerId: "reference-vocal-materializer-v1",
    materializerVersion: "reference-v1", providerClientId: "reference-provider-client-v1", providerClientVersion: "1.0.0",
    providerId: "reference-provider", providerApiVersion: "reference-api-v1", normalizerId: "reference-vocal-v1",
    normalizerVersion: "1.0.0", outputIngestionId: "reference-output-ingestion-v1", outputIngestionVersion: "reference-v1",
    bindingVersion: "1.0", availability: "available",
  }),
  freezeDescriptor({
    descriptorVersion: "1.0", bindingId: "reference-music-resume-pipeline-v1", operation: "generate-music",
    adapterId: "reference-music-v1", adapterVersion: "1.0.0", materializerId: "reference-music-materializer-v1",
    materializerVersion: "reference-v1", providerClientId: "reference-provider-client-v1", providerClientVersion: "1.0.0",
    providerId: "reference-provider", providerApiVersion: "reference-api-v1", normalizerId: "reference-music-v1",
    normalizerVersion: "1.0.0", outputIngestionId: "reference-output-ingestion-v1", outputIngestionVersion: "reference-v1",
    bindingVersion: "1.0", availability: "available",
  }),
  freezeDescriptor({
    descriptorVersion: "1.0", bindingId: "reference-mv-resume-pipeline-v1", operation: "generate-mv",
    adapterId: "reference-mv-v1", adapterVersion: "1.0.0", materializerId: "reference-mv-materializer-v1",
    materializerVersion: "reference-v1", providerClientId: "reference-provider-client-v1", providerClientVersion: "1.0.0",
    providerId: "reference-provider", providerApiVersion: "reference-api-v1", normalizerId: "reference-mv-v1",
    normalizerVersion: "1.0.0", outputIngestionId: "reference-output-ingestion-v1", outputIngestionVersion: "reference-v1",
    bindingVersion: "1.0", availability: "available",
  }),
]);

const isOperation = (value: string): value is OperationPipelineDescriptorOperation =>
  value === "generate-vocal" || value === "generate-music" || value === "generate-mv";

const copyDescriptor = (descriptor: OperationPipelineDescriptor | undefined): OperationPipelineDescriptor | undefined =>
  descriptor === undefined ? undefined : freezeDescriptor(descriptor);

export function createOperationPipelineDescriptorRegistry(): OperationPipelineDescriptorRegistry {
  return Object.freeze({
    getDescriptor(operation: string) {
      return isOperation(operation)
        ? copyDescriptor(descriptors.find((descriptor) => descriptor.operation === operation))
        : undefined;
    },
    listDescriptors() {
      return Object.freeze(descriptors.map(freezeDescriptor));
    },
    isAvailable(operation: string, bindingId: string) {
      return isOperation(operation) && descriptors.some((descriptor) =>
        descriptor.operation === operation && descriptor.bindingId === bindingId && descriptor.availability === "available");
    },
  });
}

export const operationPipelineDescriptorRegistry = createOperationPipelineDescriptorRegistry();
