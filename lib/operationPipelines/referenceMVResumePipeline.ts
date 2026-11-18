import { referenceMVMaterializer } from "@/lib/materializers/referenceMVMaterializer";
import { referenceMVMaterializationProfile } from "@/lib/materializers/referenceProfiles";
import { normalizeReferenceMVResponse } from "@/lib/providers/referenceMVAdapter";
import type { RestrictedAdapterRequestResolver } from "./referenceOperationResumeTypes";
import { createBoundOperationPipeline } from "./referenceOutputIngestionBindings";
import { bridgeMVRequest, bridgeMVResponse } from "./referenceTransportBridges";

export const REFERENCE_MV_RESUME_PIPELINE_ID = "reference-mv-resume-pipeline-v1";

export const createReferenceMVResumePipeline = (
  resolver: RestrictedAdapterRequestResolver,
  config?: Parameters<typeof createBoundOperationPipeline>[1],
) => createBoundOperationPipeline({
  bindingVersion: "1.0", operation: "generate-mv", adapterId: "reference-mv-v1", adapterVersion: "1.0.0",
  materializerId: referenceMVMaterializer.materializerId, materializerVersion: "reference-v1",
  providerClientId: "reference-provider-client-v1", providerClientVersion: "1.0.0", providerId: "reference-provider",
  providerApiVersion: "reference-api-v1", normalizerId: "reference-mv-v1", normalizerVersion: "1.0.0",
  outputIngestionId: "reference-output-ingestion-v1",
  restoreAdapterRequest: async (reference, input) => {
    const result=await resolver.resolve(reference,"generate-mv",input.context,input.authorization);
    if(result.status!=="resolved")return result;
    return "globalDirection" in result.request?{status:"resolved" as const,request:result.request}:{status:"operation-mismatch" as const};
  },
  materialize: (request, resolution, baselineTime) => referenceMVMaterializer.materialize({
    contractVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1",
    operation: "generate-mv", adapterRequest: request, resolvedAssets: resolution,
    profile: referenceMVMaterializationProfile, context: { contextVersion: "1.0", baselineTime },
  }),
  bridgeToClientBody: bridgeMVRequest, bridgeResponse: bridgeMVResponse, normalize: normalizeReferenceMVResponse,
}, config);
