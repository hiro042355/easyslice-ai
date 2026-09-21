import type { ReferenceWorkflowIntegrationBindingMetadata } from "@/lib/workflowEntry/types";
import type { ReferenceWorkflowOperation } from "@/lib/workflows/types";

const freezeBinding = (
  binding: ReferenceWorkflowIntegrationBindingMetadata,
): ReferenceWorkflowIntegrationBindingMetadata => Object.freeze({ ...binding });

const bindings: Readonly<Record<ReferenceWorkflowOperation, ReferenceWorkflowIntegrationBindingMetadata>> =
  Object.freeze({
    "generate-vocal": freezeBinding({
      bindingVersion: "1.0",
      operation: "generate-vocal",
      materializerId: "reference-vocal-materializer-v1",
      providerClientId: "reference-provider-client-v1",
      outputIngestionProfile: "reference-output-ingestion-v1",
      assetRequirementsProfile: "vocal-generation",
      uploadGateProfile: "reference-vocal-upload-profile",
      credentialClass: "GENERATION_PROVIDER",
      resumePipelineId: "reference-vocal-resume-pipeline-v1",
      availability: "available",
    }),
    "generate-music": freezeBinding({
      bindingVersion: "1.0",
      operation: "generate-music",
      materializerId: "reference-music-materializer-v1",
      providerClientId: "reference-provider-client-v1",
      outputIngestionProfile: "reference-output-ingestion-v1",
      assetRequirementsProfile: "music-generation",
      uploadGateProfile: "reference-music-upload-profile",
      credentialClass: "GENERATION_PROVIDER",
      resumePipelineId: "reference-music-resume-pipeline-v1",
      availability: "available",
    }),
    "generate-mv": freezeBinding({
      bindingVersion: "1.0",
      operation: "generate-mv",
      materializerId: "reference-mv-materializer-v1",
      providerClientId: "reference-provider-client-v1",
      outputIngestionProfile: "reference-output-ingestion-v1",
      assetRequirementsProfile: "mv-generation",
      uploadGateProfile: "reference-mv-upload-profile",
      credentialClass: "GENERATION_PROVIDER",
      resumePipelineId: "reference-mv-resume-pipeline-v1",
      availability: "available",
    }),
  });

export function getReferenceIntegrationBinding(
  operation: string,
): ReferenceWorkflowIntegrationBindingMetadata | undefined {
  if (!(operation in bindings)) return undefined;
  return freezeBinding(bindings[operation as ReferenceWorkflowOperation]);
}
