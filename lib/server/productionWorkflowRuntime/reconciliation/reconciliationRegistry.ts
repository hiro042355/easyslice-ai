import type { ReconciliationRuntimeDescriptor } from "./types";

export const RECONCILIATION_RUNTIME_DESCRIPTOR: ReconciliationRuntimeDescriptor = Object.freeze({ descriptorVersion: "1.0", id: "workflow-reconciliation-runtime-foundation-v1", serverOnly: true, durable: false, timerImplementation: false, providerImplementation: false, runtimeBundleRegistered: false, productionReady: false });
const descriptors = Object.freeze([RECONCILIATION_RUNTIME_DESCRIPTOR]);
export const listReconciliationRuntimeDescriptors = (): readonly ReconciliationRuntimeDescriptor[] => Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
export const getReconciliationRuntimeDescriptor = (id: string): ReconciliationRuntimeDescriptor | undefined => id === RECONCILIATION_RUNTIME_DESCRIPTOR.id ? Object.freeze({ ...RECONCILIATION_RUNTIME_DESCRIPTOR }) : undefined;
