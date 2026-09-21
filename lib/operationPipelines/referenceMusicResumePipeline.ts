import { referenceMusicMaterializer } from "@/lib/materializers/referenceMusicMaterializer";
import { referenceMusicMaterializationProfile } from "@/lib/materializers/referenceProfiles";
import { normalizeReferenceMusicResponse } from "@/lib/providers/referenceMusicAdapter";
import type { RestrictedAdapterRequestResolver } from "./referenceOperationResumeTypes";
import { createBoundOperationPipeline } from "./referenceOutputIngestionBindings";
import { bridgeMusicRequest, bridgeMusicResponse } from "./referenceTransportBridges";

export const REFERENCE_MUSIC_RESUME_PIPELINE_ID = "reference-music-resume-pipeline-v1";

export const createReferenceMusicResumePipeline = (
  resolver: RestrictedAdapterRequestResolver,
  config?: Parameters<typeof createBoundOperationPipeline>[1],
) => createBoundOperationPipeline({
  bindingVersion: "1.0", operation: "generate-music", adapterId: "reference-music-v1", adapterVersion: "1.0.0",
  materializerId: referenceMusicMaterializer.materializerId, materializerVersion: "reference-v1",
  providerClientId: "reference-provider-client-v1", providerClientVersion: "1.0.0", providerId: "reference-provider",
  providerApiVersion: "reference-api-v1", normalizerId: "reference-music-v1", normalizerVersion: "1.0.0",
  outputIngestionId: "reference-output-ingestion-v1",
  restoreAdapterRequest: (reference, input) => resolver.resolve(reference, "generate-music", input.context, input.authorization),
  materialize: (request, resolution, baselineTime) => referenceMusicMaterializer.materialize({
    contractVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1",
    operation: "generate-music", adapterRequest: request as never, resolvedAssets: resolution,
    profile: referenceMusicMaterializationProfile, context: { contextVersion: "1.0", baselineTime },
  }),
  bridgeToClientBody: bridgeMusicRequest as never, bridgeResponse: bridgeMusicResponse, normalize: normalizeReferenceMusicResponse,
}, config);
