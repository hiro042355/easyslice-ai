export type DurableStoreContractDescriptor = Readonly<{
  descriptorVersion: "1.0";
  id:
    | "durable-workflow-store-contract-suite-v1"
    | "durable-workflow-transaction-contract-v1"
    | "durable-workflow-final-reference-outbox-contract-v1"
    | "durable-workflow-claim-lease-contract-v1";
  mode: "contract-test-only";
  productionReady: false;
  availability: "available";
  contractClass: "suite" | "transaction" | "atomicity" | "claim-lease";
}>;

const descriptors = Object.freeze([
  Object.freeze({ descriptorVersion: "1.0" as const, id: "durable-workflow-store-contract-suite-v1" as const, mode: "contract-test-only" as const, productionReady: false as const, availability: "available" as const, contractClass: "suite" as const }),
  Object.freeze({ descriptorVersion: "1.0" as const, id: "durable-workflow-transaction-contract-v1" as const, mode: "contract-test-only" as const, productionReady: false as const, availability: "available" as const, contractClass: "transaction" as const }),
  Object.freeze({ descriptorVersion: "1.0" as const, id: "durable-workflow-final-reference-outbox-contract-v1" as const, mode: "contract-test-only" as const, productionReady: false as const, availability: "available" as const, contractClass: "atomicity" as const }),
  Object.freeze({ descriptorVersion: "1.0" as const, id: "durable-workflow-claim-lease-contract-v1" as const, mode: "contract-test-only" as const, productionReady: false as const, availability: "available" as const, contractClass: "claim-lease" as const }),
] satisfies readonly DurableStoreContractDescriptor[]);

export function listDurableStoreContractDescriptors(): readonly DurableStoreContractDescriptor[] {
  return descriptors.map((descriptor) => Object.freeze({ ...descriptor }));
}

export function getDurableStoreContractDescriptor(id: string): DurableStoreContractDescriptor | undefined {
  const descriptor = descriptors.find((value) => value.id === id);
  return descriptor === undefined ? undefined : Object.freeze({ ...descriptor });
}
