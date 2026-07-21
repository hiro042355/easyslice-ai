import { deepCopy, deepFreeze, isSafeOpaqueRef } from "./providerClientUtils";
import { createReferenceProviderClient, REFERENCE_PROVIDER_API_VERSION, REFERENCE_PROVIDER_CLIENT_CAPABILITY, REFERENCE_PROVIDER_CLIENT_ID, REFERENCE_PROVIDER_CLIENT_VERSION, REFERENCE_PROVIDER_ID } from "./referenceProviderClient";
import type { ProviderClientDescriptor } from "./types";

export type ReferenceProviderClientDescriptor = ProviderClientDescriptor & {
  readonly contractVersion: "1.0";
  readonly capabilityVersion: "reference-provider-client-capability-v1";
  readonly createClient: typeof createReferenceProviderClient;
};

const snapshot = (descriptor: ReferenceProviderClientDescriptor): ReferenceProviderClientDescriptor => Object.freeze({
  ...descriptor,
  capability: deepFreeze(deepCopy(descriptor.capability)),
});

const DESCRIPTORS: readonly ReferenceProviderClientDescriptor[] = Object.freeze([
  snapshot({
    contractVersion: "1.0",
    capabilityVersion: "reference-provider-client-capability-v1",
    providerId: REFERENCE_PROVIDER_ID,
    clientId: REFERENCE_PROVIDER_CLIENT_ID,
    clientVersion: REFERENCE_PROVIDER_CLIENT_VERSION,
    providerApiVersion: REFERENCE_PROVIDER_API_VERSION,
    capability: REFERENCE_PROVIDER_CLIENT_CAPABILITY,
    endpointConfigRef: "reference-endpoint-config",
    availability: "available",
    createClient: createReferenceProviderClient,
  }),
]);

export const providerClientRegistry: readonly ReferenceProviderClientDescriptor[] = Object.freeze(DESCRIPTORS.map(snapshot));

export function getProviderClientDescriptor(clientId: string): ReferenceProviderClientDescriptor | undefined {
  if (!isSafeOpaqueRef(clientId)) return undefined;
  const found = DESCRIPTORS.find((value) => value.clientId === clientId);
  return found ? snapshot(found) : undefined;
}
