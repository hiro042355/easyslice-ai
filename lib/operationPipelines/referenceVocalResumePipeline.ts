import { referenceVocalMaterializer } from "@/lib/materializers/referenceVocalMaterializer";
import { referenceVocalMaterializationProfile } from "@/lib/materializers/referenceProfiles";
import { normalizeReferenceVocalResponse } from "@/lib/providers/referenceVocalAdapter";
import type { RestrictedAdapterRequestResolver } from "./referenceOperationResumeTypes";
import { createBoundOperationPipeline } from "./referenceOutputIngestionBindings";
import { bridgeVocalRequest, bridgeVocalResponse } from "./referenceTransportBridges";

export const REFERENCE_VOCAL_RESUME_PIPELINE_ID = "reference-vocal-resume-pipeline-v1";

export const createReferenceVocalResumePipeline = (
  resolver: RestrictedAdapterRequestResolver,
  config?: Parameters<typeof createBoundOperationPipeline>[1],
) => createBoundOperationPipeline({
  bindingVersion: "1.0", operation: "generate-vocal", adapterId: "reference-vocal-v1", adapterVersion: "1.0.0",
  materializerId: referenceVocalMaterializer.materializerId, materializerVersion: "reference-v1",
  providerClientId: "reference-provider-client-v1", providerClientVersion: "1.0.0", providerId: "reference-provider",
  providerApiVersion: "reference-api-v1", normalizerId: "reference-vocal-v1", normalizerVersion: "1.0.0",
  outputIngestionId: "reference-output-ingestion-v1",
  restoreAdapterRequest: (reference, input) => resolver.resolve(reference, "generate-vocal", input.context, input.authorization),
  materialize: (request, resolution, baselineTime) => referenceVocalMaterializer.materialize({
    contractVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1",
    operation: "generate-vocal", adapterRequest: request as never, resolvedAssets: resolution,
    profile: referenceVocalMaterializationProfile, context: { contextVersion: "1.0", baselineTime },
  }),
  bridgeToClientBody: bridgeVocalRequest as never, bridgeResponse: bridgeVocalResponse, normalize: normalizeReferenceVocalResponse,
}, config);
