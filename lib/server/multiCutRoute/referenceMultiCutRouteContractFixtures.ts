import { copyResponseOwnedBinaryPayload } from "../binary/responseOwnedBinaryPayloadContract";
import type {
  MultiCutRouteRequest,
  MultiCutRouteResponseProjection,
} from "./multiCutRouteContractTypes";

const clip = () =>
  Object.freeze({
    start: "10",
    end: "20",
    title: "Reference clip",
  });

const creatorStyleConfig = () =>
  Object.freeze({
    style: "creator" as const,
    intensity: 3,
    enabled: true,
    zoomStrength: 0.5,
    subtitleAnimation: "normal" as const,
    subtitleScale: 1.1,
    subtitleSpeed: 1.1,
    cutTempo: "medium" as const,
    emphasisLevel: 3,
  });

export const createReferenceMultiCutRouteRequest =
  (): MultiCutRouteRequest =>
    Object.freeze({
      requestVersion: "1.0",
      clips: Object.freeze([clip()]),
      outputFormat: "original",
    });

export const createReferenceMultiCutRouteOptionalRequest =
  (): MultiCutRouteRequest =>
    Object.freeze({
      requestVersion: "1.0",
      clips: Object.freeze([clip()]),
    });

export const createReferenceMultiCutRouteCreatorStyleRequest =
  (): MultiCutRouteRequest =>
    Object.freeze({
      requestVersion: "1.0",
      clips: Object.freeze([clip()]),
      outputFormat: "shorts",
      creatorStyleConfig: creatorStyleConfig(),
    });

export const createReferenceMultiCutRouteBinarySuccessProjection =
  (): MultiCutRouteResponseProjection =>
    Object.freeze({
      responseProjectionVersion: "1.0",
      kind: "binary-success",
      status: 200,
      payload: copyResponseOwnedBinaryPayload({
        schemaVersion: "1.0",
        bytes: Uint8Array.from([80, 75, 3, 4]),
        metadata: {
          metadataVersion: "1.0",
          contentLength: 4,
          mediaType: "application/zip",
          filename: "clips.zip",
        },
      }),
    });

export const createReferenceMultiCutRoute400Projection =
  (): MultiCutRouteResponseProjection =>
    Object.freeze({
      responseProjectionVersion: "1.0",
      kind: "json-error",
      status: 400,
      errorCode: "clips-required",
      message: "At least one clip is required.",
    });

export const createReferenceMultiCutRoute404Projection =
  (): MultiCutRouteResponseProjection =>
    Object.freeze({
      responseProjectionVersion: "1.0",
      kind: "json-error",
      status: 404,
      errorCode: "source-not-found",
      message: "The source media was not found.",
      details: Object.freeze({ success: false }),
    });

export const createInvalidMultiCutRouteRequestVersionCandidate =
  (): unknown => ({
    requestVersion: "2.0",
    clips: [clip()],
  });

export const createMissingMultiCutRouteRequestFieldCandidate =
  (): unknown => ({
    requestVersion: "1.0",
  });

export const createInvalidMultiCutRouteProjectionKindCandidate =
  (): unknown => ({
    responseProjectionVersion: "1.0",
    kind: "stream-success",
    status: 200,
  });
