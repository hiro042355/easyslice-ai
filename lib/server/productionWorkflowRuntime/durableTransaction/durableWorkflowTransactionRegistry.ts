import { DURABLE_WORKFLOW_TRANSACTION_DESCRIPTOR } from "./durableWorkflowTransactionManagerV2";
import type { DurableWorkflowDatabaseCapabilityDescriptor, DurableWorkflowTransactionManagerDescriptor } from "./types";

const databaseDescriptor: DurableWorkflowDatabaseCapabilityDescriptor = Object.freeze({
  descriptorVersion: "1.0",
  id: "durable-workflow-database-capability-v1",
  explicit: true,
  methods: Object.freeze(["execute"] as const),
  sqlTextExposed: false,
  rawClientExposed: false,
  productionReady: false,
});

export function getDurableWorkflowTransactionDescriptor(id: string): DurableWorkflowTransactionManagerDescriptor | DurableWorkflowDatabaseCapabilityDescriptor | undefined {
  if (id === DURABLE_WORKFLOW_TRANSACTION_DESCRIPTOR.id) return Object.freeze({ ...DURABLE_WORKFLOW_TRANSACTION_DESCRIPTOR });
  if (id === databaseDescriptor.id) return Object.freeze({ ...databaseDescriptor, methods: Object.freeze([...databaseDescriptor.methods]) as readonly ["execute"] });
  return undefined;
}

export function listDurableWorkflowTransactionDescriptors(): readonly (DurableWorkflowTransactionManagerDescriptor | DurableWorkflowDatabaseCapabilityDescriptor)[] {
  return Object.freeze([
    Object.freeze({ ...DURABLE_WORKFLOW_TRANSACTION_DESCRIPTOR }),
    Object.freeze({ ...databaseDescriptor, methods: Object.freeze([...databaseDescriptor.methods]) as readonly ["execute"] }),
  ]);
}
