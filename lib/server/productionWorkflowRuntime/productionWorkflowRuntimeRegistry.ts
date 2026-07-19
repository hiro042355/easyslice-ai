export type ProductionWorkflowRuntimeRegistryDescriptor = Readonly<{
  descriptorVersion: "1.0";
  id:
    | "production-workflow-runtime-interface-v1"
    | "reference-production-runtime-contract-adapter-v1"
    | "reference-workflow-transaction-manager-v1";
  interfaceVersion: "1.0";
  mode: "interface" | "reference-contract-only";
  durable: boolean;
  crossInstance: boolean;
  productionReady: boolean;
  capabilityClass: "contract" | "reference-subset";
  availability: "available" | "unavailable";
}>;

const descriptors = Object.freeze([
  Object.freeze({
    descriptorVersion: "1.0" as const,
    id: "production-workflow-runtime-interface-v1" as const,
    interfaceVersion: "1.0" as const,
    mode: "interface" as const,
    durable: false,
    crossInstance: false,
    productionReady: false,
    capabilityClass: "contract" as const,
    availability: "available" as const,
  }),
  Object.freeze({
    descriptorVersion: "1.0" as const,
    id: "reference-production-runtime-contract-adapter-v1" as const,
    interfaceVersion: "1.0" as const,
    mode: "reference-contract-only" as const,
    durable: false,
    crossInstance: false,
    productionReady: false,
    capabilityClass: "reference-subset" as const,
    availability: "available" as const,
  }),
  Object.freeze({
    descriptorVersion: "1.0" as const,
    id: "reference-workflow-transaction-manager-v1" as const,
    interfaceVersion: "1.0" as const,
    mode: "reference-contract-only" as const,
    durable: false,
    crossInstance: false,
    productionReady: false,
    capabilityClass: "reference-subset" as const,
    availability: "available" as const,
  }),
] satisfies readonly ProductionWorkflowRuntimeRegistryDescriptor[]);

export function listProductionWorkflowRuntimeDescriptors(): readonly ProductionWorkflowRuntimeRegistryDescriptor[] {
  return descriptors.map((descriptor) => Object.freeze({ ...descriptor }));
}

export function getProductionWorkflowRuntimeDescriptor(
  id: string,
): ProductionWorkflowRuntimeRegistryDescriptor | undefined {
  const descriptor = descriptors.find((entry) => entry.id === id);
  return descriptor === undefined ? undefined : Object.freeze({ ...descriptor });
}
