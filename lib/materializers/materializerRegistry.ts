import { deepCopy, deepFreeze } from "./materializerUtils";
import {
  referenceMusicMaterializationProfile,
  referenceMVMaterializationProfile,
  referenceVocalMaterializationProfile,
} from "./referenceProfiles";
import type {
  MaterializerDescriptor,
  ProviderMaterializationProfile,
} from "./types";

type MaterializerRegistration = Readonly<{
  materializerId: string;
  materializerVersion: MaterializerDescriptor["materializerVersion"];
  profile: ProviderMaterializationProfile;
  availability: MaterializerDescriptor["availability"];
}>;

const REGISTRATIONS: readonly MaterializerRegistration[] = [
  {
    materializerId: "reference-vocal-materializer-v1",
    materializerVersion: "reference-v1",
    profile: referenceVocalMaterializationProfile,
    availability: "available",
  },
  {
    materializerId: "reference-music-materializer-v1",
    materializerVersion: "reference-v1",
    profile: referenceMusicMaterializationProfile,
    availability: "available",
  },
  {
    materializerId: "reference-mv-materializer-v1",
    materializerVersion: "reference-v1",
    profile: referenceMVMaterializationProfile,
    availability: "available",
  },
];

function buildDescriptor(registration: MaterializerRegistration): MaterializerDescriptor {
  if (registration.materializerVersion !== registration.profile.materializerVersion) {
    throw new Error("Materializer registry identity is incompatible with its profile");
  }
  return {
    materializerId: registration.materializerId,
    materializerVersion: registration.materializerVersion,
    providerId: registration.profile.providerId,
    providerApiVersion: registration.profile.providerApiVersion,
    operation: registration.profile.operation,
    profileVersion: registration.profile.profileVersion,
    availability: registration.availability,
  };
}

function assertUniqueDescriptors(descriptors: readonly MaterializerDescriptor[]): void {
  const materializerIds = new Set<string>();
  const selectionKeys = new Set<string>();
  for (const descriptor of descriptors) {
    const selectionKey = `${descriptor.providerId}\u0000${descriptor.operation}`;
    if (materializerIds.has(descriptor.materializerId) || selectionKeys.has(selectionKey)) {
      throw new Error("Materializer registry contains a duplicate registration");
    }
    materializerIds.add(descriptor.materializerId);
    selectionKeys.add(selectionKey);
  }
}

const DESCRIPTORS: readonly MaterializerDescriptor[] = (() => {
  const descriptors = REGISTRATIONS.map(buildDescriptor);
  assertUniqueDescriptors(descriptors);
  return deepFreeze(descriptors);
})();

const isSafeLookupKey = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  !/[\r\n\u0000]/.test(value);

const copyDescriptor = (
  descriptor: MaterializerDescriptor | undefined,
): MaterializerDescriptor | undefined =>
  descriptor === undefined ? undefined : deepFreeze(deepCopy(descriptor));

export function listMaterializers(): readonly MaterializerDescriptor[] {
  return deepFreeze(deepCopy(DESCRIPTORS));
}

export function getMaterializerDescriptorById(
  materializerId: string,
): MaterializerDescriptor | undefined {
  if (!isSafeLookupKey(materializerId)) return undefined;
  return copyDescriptor(
    DESCRIPTORS.find((descriptor) => descriptor.materializerId === materializerId),
  );
}

export function getMaterializerDescriptor(
  providerId: string,
  operation: MaterializerDescriptor["operation"],
): MaterializerDescriptor | undefined {
  if (!isSafeLookupKey(providerId) || !isSafeLookupKey(operation)) return undefined;
  return copyDescriptor(
    DESCRIPTORS.find(
      (descriptor) =>
        descriptor.providerId === providerId &&
        descriptor.operation === operation &&
        descriptor.availability === "available",
    ),
  );
}
