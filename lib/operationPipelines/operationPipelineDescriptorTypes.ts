export type OperationPipelineDescriptorOperation =
  | "generate-vocal"
  | "generate-music"
  | "generate-mv";

export type OperationPipelineDescriptor = Readonly<{
  descriptorVersion: "1.0";
  bindingId: string;
  operation: OperationPipelineDescriptorOperation;
  adapterId: string;
  adapterVersion: string;
  materializerId: string;
  materializerVersion: string;
  providerClientId: string;
  providerClientVersion: string;
  providerId: string;
  providerApiVersion: string;
  normalizerId: string;
  normalizerVersion: string;
  outputIngestionId: string;
  outputIngestionVersion: string;
  bindingVersion: "1.0";
  availability: "available" | "disabled" | "retired";
}>;

export type OperationPipelineDescriptorRegistry = Readonly<{
  getDescriptor(operation: string): OperationPipelineDescriptor | undefined;
  listDescriptors(): readonly OperationPipelineDescriptor[];
  isAvailable(operation: string, bindingId: string): boolean;
}>;
