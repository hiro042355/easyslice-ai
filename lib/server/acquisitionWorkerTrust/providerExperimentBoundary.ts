import { validateAcquisitionRequest, type ValidatedAcquisitionRequest } from "../acquisitionWorker/contracts";
import {
  ACQUISITION_DEFAULT_TIMEOUT_MS,
  ACQUISITION_MAX_BYTES,
  ACQUISITION_OUTPUT_PROFILE,
  ACQUISITION_REQUEST_VERSION,
} from "../acquisitionWorker/types";
import { validateAcquisitionSafeTelemetry } from "../acquisitionWorker/telemetry";
import { isProductionOwner } from "../productionIdentity/productionOwnerAuthority";
import type { UserId } from "../productionIdentity/types";
import { AcquisitionWorkerTrustFailure, type AcquisitionWorkerInvocationResult } from "./client";

export const CONTROL_WORKER_URL =
  "https://nexcut-prod-acquisition-worker-experiment-control-bfqspeoqrq-an.a.run.app" as const;
export const TREATMENT_WORKER_URL =
  "https://nexcut-prod-acquisition-worker-bfqspeoqrq-an.a.run.app" as const;
export const PROVIDER_EXPERIMENT_SOURCE_URL = "https://www.youtube.com/watch?v=tn_dPMapzjM" as const;
export const CONTROL_UUID_CONFIG_NAME = "NEXCUT_PROVIDER_EXPERIMENT_CONTROL_UUID" as const;
export const TREATMENT_UUID_CONFIG_NAME = "NEXCUT_PROVIDER_EXPERIMENT_TREATMENT_UUID" as const;

type AuthenticationResult =
  | Readonly<{ ok: true; userId: string }>
  | Readonly<{ ok: false; response: Response }>;

type Condition = "CONTROL" | "TREATMENT";
type ObservationAuthority = "AUTHORITATIVE_WORKER_RESULT" | "NON_AUTHORITATIVE_TRANSPORT_OUTCOME";
type ConditionObservation = Readonly<{
  authority: ObservationAuthority;
  body: Readonly<Record<string, unknown>>;
}>;

export type ProviderExperimentBoundaryDependencies = Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  authenticate(request: Request): Promise<AuthenticationResult>;
  invokeAt(workerUrl: string, request: ValidatedAcquisitionRequest, signal?: AbortSignal): Promise<AcquisitionWorkerInvocationResult>;
}>;

const headers = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
});

const json = (status: number, body: Readonly<Record<string, unknown>>): Response =>
  new Response(JSON.stringify(body), { status, headers });

const frozenRequest = (acquisitionId: string | undefined): ValidatedAcquisitionRequest =>
  validateAcquisitionRequest({
    requestVersion: ACQUISITION_REQUEST_VERSION,
    acquisitionId,
    source: "youtube",
    sourceUrl: PROVIDER_EXPERIMENT_SOURCE_URL,
    requestedOutputProfile: ACQUISITION_OUTPUT_PROFILE,
    maxBytes: ACQUISITION_MAX_BYTES,
    timeoutMs: ACQUISITION_DEFAULT_TIMEOUT_MS,
  });

const project = (
  condition: Condition,
  invocation: AcquisitionWorkerInvocationResult,
): ConditionObservation => {
  const result = invocation.result;
  if (result.status === "failed") {
    return Object.freeze({
      authority: "AUTHORITATIVE_WORKER_RESULT",
      body: Object.freeze({
        condition,
        observationAuthority: "AUTHORITATIVE_WORKER_RESULT",
        status: "failed",
        errorCode: result.errorCode,
        retryable: result.retryable,
        ...(invocation.diagnostic ? { diagnostic: validateAcquisitionSafeTelemetry(invocation.diagnostic) } : {}),
      }),
    });
  }
  return Object.freeze({
    authority: "AUTHORITATIVE_WORKER_RESULT",
    body: Object.freeze({ condition, observationAuthority: "AUTHORITATIVE_WORKER_RESULT", status: "succeeded" }),
  });
};

const safeFailure = (condition: Condition, error: unknown): ConditionObservation =>
  Object.freeze({
    authority: "NON_AUTHORITATIVE_TRANSPORT_OUTCOME",
    body: Object.freeze({
      condition,
      observationAuthority: "NON_AUTHORITATIVE_TRANSPORT_OUTCOME",
      status: "failed",
      errorCode: error instanceof AcquisitionWorkerTrustFailure ? error.code : "worker-unavailable",
      retryable: false,
    }),
  });

export const createProviderExperimentBoundary = (dependencies: ProviderExperimentBoundaryDependencies) =>
  async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json(405, { status: "rejected", errorCode: "method-not-allowed" });
    const authentication = await dependencies.authenticate(request);
    if (!authentication.ok) return authentication.response;
    const environment = dependencies.environment;
    if (!isProductionOwner(authentication.userId as UserId, environment.NEXCUT_PRODUCTION_OWNER_UID)) {
      return json(403, { status: "rejected", errorCode: "owner-authorization-required" });
    }
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return json(403, { status: "rejected", errorCode: "invalid-origin" });
    }
    if (environment.VERCEL_ENV !== "production") {
      return json(404, { status: "disabled", errorCode: "experiment-boundary-disabled" });
    }

    let controlRequest: ValidatedAcquisitionRequest;
    let treatmentRequest: ValidatedAcquisitionRequest;
    try {
      controlRequest = frozenRequest(environment[CONTROL_UUID_CONFIG_NAME]);
      treatmentRequest = frozenRequest(environment[TREATMENT_UUID_CONFIG_NAME]);
      if (controlRequest.acquisitionId === treatmentRequest.acquisitionId) throw new TypeError("duplicate-experiment-uuid");
    } catch {
      return json(400, { status: "rejected", errorCode: "invalid-experiment-configuration" });
    }

    let control: ConditionObservation;
    try {
      control = project("CONTROL", await dependencies.invokeAt(CONTROL_WORKER_URL, controlRequest, request.signal));
    } catch (error) {
      control = safeFailure("CONTROL", error);
    }

    let treatment: ConditionObservation;
    try {
      treatment = project("TREATMENT", await dependencies.invokeAt(TREATMENT_WORKER_URL, treatmentRequest, request.signal));
    } catch (error) {
      treatment = safeFailure("TREATMENT", error);
    }

    const comparisonCompleteness = control.authority === "AUTHORITATIVE_WORKER_RESULT"
      && treatment.authority === "AUTHORITATIVE_WORKER_RESULT" ? "COMPLETE" : "INCOMPLETE";
    return json(200, { responseVersion: "1.0", comparisonCompleteness, control: control.body, treatment: treatment.body });
  };
