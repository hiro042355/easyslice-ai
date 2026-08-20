import type { CreatorStyleConfig } from "../../creatorStyleConfig";
import type { ResponseOwnedBinaryPayload } from "../binary/responseOwnedBinaryPayloadTypes";

export type MultiCutRouteRequestVersion = "1.0";
export type MultiCutRouteResponseProjectionVersion = "1.0";

export type MultiCutRouteClip = Readonly<{
  start: string | number;
  end: string | number;
  title?: string;
}>;

export type MultiCutRouteOutputFormat = "original" | "shorts" | "normal";

export type MultiCutRouteRequest = Readonly<{
  requestVersion: MultiCutRouteRequestVersion;
  jobId: string;
  mediaId: string;
  clips: readonly MultiCutRouteClip[];
  outputFormat?: MultiCutRouteOutputFormat;
  creatorStyleConfig?: Readonly<CreatorStyleConfig> | null;
}>;

export type MultiCutRouteErrorCode =
  | "durable-media-required"
  | "invalid-resource"
  | "resource-not-found"
  | "clips-required"
  | "clip-range-invalid"
  | "source-not-found";

export type MultiCutRouteErrorDetails = Readonly<
  Record<string, string | number | boolean | null>
>;

export type MultiCutRouteBinarySuccessProjection = Readonly<{
  responseProjectionVersion: MultiCutRouteResponseProjectionVersion;
  kind: "binary-success";
  status: 200;
  payload: ResponseOwnedBinaryPayload;
}>;

export type MultiCutRouteJsonErrorProjection = Readonly<{
  responseProjectionVersion: MultiCutRouteResponseProjectionVersion;
  kind: "json-error";
  status: 400 | 404;
  errorCode: MultiCutRouteErrorCode;
  message: string;
  details?: MultiCutRouteErrorDetails;
}>;

export type MultiCutRouteResponseProjection =
  | MultiCutRouteBinarySuccessProjection
  | MultiCutRouteJsonErrorProjection;
