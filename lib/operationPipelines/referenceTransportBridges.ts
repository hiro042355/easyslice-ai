import type { Sensitive } from "@/lib/assets/types";
import type { MaterializedProviderRequest, ReferenceProviderRequestBody, ReferenceSafeResponseDTO } from "@/lib/providerClients/types";
import type { ReferenceMusicMaterializedBody, ReferenceMVMaterializedBody, ReferenceVocalMaterializedBody } from "@/lib/materializers/types";
import type { ReferenceMusicResponse } from "@/lib/providers/referenceMusicAdapter";
import type { ReferenceMVResponse } from "@/lib/providers/referenceMVAdapter";
import type { ReferenceVocalResponse } from "@/lib/providers/referenceVocalAdapter";
import type {
  OperationTransportBridgeResult,
  ReferenceMusicClientBody,
  ReferenceMVClientBody,
  ReferenceTransportSummary,
  ReferenceVocalClientBody,
} from "./referenceOperationResumeTypes";
import { copy, issue, validOpaque } from "./operationPipelineUtils";

const durationClass = (seconds: number): ReferenceTransportSummary["durationClass"] =>
  seconds <= 30 ? "short" : seconds <= 180 ? "medium" : "long";
const summary = (payloadKind: ReferenceTransportSummary["payloadKind"], body: Record<string, unknown>, inputAssetCount: number): ReferenceTransportSummary => ({
  operationPayloadVersion: "1.0", payloadKind, inputAssetCount, outputFormat: String(body.outputFormat),
  durationClass: durationClass(Number(body.durationSeconds)),
  timelineCount: Array.isArray(body.timeline) ? body.timeline.length : 0,
  sceneCount: Array.isArray(body.scenes) ? body.scenes.length : 0,
});
const validRequest = <TBody extends { durationSeconds: number }>(request: MaterializedProviderRequest<TBody>, operation: string) =>
  request && request.operation === operation && request.materialization?.status === "complete" &&
  request.materialization.unresolvedAssetCount === 0 && request.body &&
  Number.isFinite(Number(request.body.durationSeconds)) && Number(request.body.durationSeconds) > 0;
const failedBridge = () => ({ status: "failed" as const, issues: [issue("transport-bridge-failed", "invalid")] });
const markSensitive = <T>(concreteValue: T): Sensitive<T> => concreteValue as Sensitive<T>;

export const bridgeVocalRequest = (request: MaterializedProviderRequest<ReferenceVocalMaterializedBody>): OperationTransportBridgeResult<ReferenceVocalClientBody> => {
  if (!validRequest(request, "generate-vocal")) return failedBridge();
  const materializedRequest = markSensitive(copy(request.body));
  const body: ReferenceVocalClientBody = {
    bodyVersion: "1.0", operation: "generate-vocal", materializedRequest,
    transportSummary: summary("vocal", request.body, request.assetAccessCount),
  };
  return { status: "bridged", body: markSensitive(body) };
};
export const bridgeMusicRequest = (request: MaterializedProviderRequest<ReferenceMusicMaterializedBody>): OperationTransportBridgeResult<ReferenceMusicClientBody> => {
  if (!validRequest(request, "generate-music")) return failedBridge();
  const materializedRequest = markSensitive(copy(request.body));
  const body: ReferenceMusicClientBody = {
    bodyVersion: "1.0", operation: "generate-music", materializedRequest,
    transportSummary: summary("music", request.body, request.assetAccessCount),
  };
  return { status: "bridged", body: markSensitive(body) };
};
export const bridgeMVRequest = (request: MaterializedProviderRequest<ReferenceMVMaterializedBody>): OperationTransportBridgeResult<ReferenceMVClientBody> => {
  if (!validRequest(request, "generate-mv")) return failedBridge();
  const materializedRequest = markSensitive(copy(request.body));
  const body: ReferenceMVClientBody = {
    bodyVersion: "1.0", operation: "generate-mv", materializedRequest,
    transportSummary: summary("mv", request.body, request.assetAccessCount),
  };
  return { status: "bridged", body: markSensitive(body) };
};

export const toReferenceProviderRequestBody = (body: { transportSummary: ReferenceTransportSummary }): ReferenceProviderRequestBody => copy({
  operationPayloadVersion: "1.0", payloadKind: body.transportSummary.payloadKind,
  inputAssetCount: body.transportSummary.inputAssetCount, outputFormat: body.transportSummary.outputFormat,
});
const references = (dto: ReferenceSafeResponseDTO, operation: string) => {
  if (!dto || dto.responseVersion !== "1.0" || dto.operation !== operation || dto.outcome !== "completed" ||
      !Array.isArray(dto.providerOutputReferences) || dto.providerOutputReferences.length === 0 ||
      dto.providerOutputReferences.some((value) => !validOpaque(value, 256)) ||
      new Set(dto.providerOutputReferences).size !== dto.providerOutputReferences.length ||
      dto.safeMetadata?.outputCount !== dto.providerOutputReferences.length) throw new Error("provider-output-reference-invalid");
  return [...dto.providerOutputReferences];
};
export const bridgeVocalResponse = (dto: ReferenceSafeResponseDTO): ReferenceVocalResponse => ({ status: "completed", outputAssetIds: references(dto, "generate-vocal") });
export const bridgeMusicResponse = (dto: ReferenceSafeResponseDTO): ReferenceMusicResponse => ({ status: "completed", outputAssetIds: references(dto, "generate-music") });
export const bridgeMVResponse = (dto: ReferenceSafeResponseDTO): ReferenceMVResponse => ({ status: "completed", outputAssetIds: references(dto, "generate-mv") });
