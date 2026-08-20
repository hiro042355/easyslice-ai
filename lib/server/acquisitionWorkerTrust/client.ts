const PROJECT_ID = "nexcut-prod-jp-2026" as const;
const PROVIDER = "projects/566365202495/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production" as const;
const INVOKER = "nexcut-prod-acq-invoker@nexcut-prod-jp-2026.iam.gserviceaccount.com" as const;
const WORKER_URL = "https://nexcut-prod-acquisition-worker-bfqspeoqrq-an.a.run.app" as const;
const WRONG_AUDIENCE = "https://invalid-audience.nexcut.invalid";
const REQUEST_TIMEOUT_MS = 15_000;

export const ACQUISITION_WORKER_AUTH_FAILURES = Object.freeze([
  "worker-auth-config-invalid",
  "worker-federation-failed",
  "worker-token-exchange-failed",
  "worker-impersonation-failed",
  "worker-id-token-failed",
  "worker-auth-rejected",
  "worker-unavailable",
  "worker-timeout",
] as const);

export type AcquisitionWorkerAuthFailureCode = (typeof ACQUISITION_WORKER_AUTH_FAILURES)[number];

export type AcquisitionWorkerTrustConfiguration = Readonly<{
  projectId: typeof PROJECT_ID;
  providerResource: typeof PROVIDER;
  invokerServiceAccount: typeof INVOKER;
  workerUrl: typeof WORKER_URL;
}>;

export type AcquisitionWorkerTrustEvidence = Readonly<{
  correctAudience: Readonly<{
    tokenObtained: true;
    httpStatus: 200;
    audienceMatch: true;
    workerReady: true;
    invokerIdentityMatch: true;
  }>;
  wrongAudience: Readonly<{
    tested: true;
    httpStatus: number;
    rejected: true;
  }>;
  unauthenticated: Readonly<{
    tested: true;
    httpStatus: number;
    rejected: true;
  }>;
}>;

export type AcquisitionControlStoreProofEvidence = Readonly<{
  workerIdentityMatch: boolean; controlCreate: boolean; concurrentClaim: boolean; controlRead: boolean;
  sameFingerprintReplay: boolean; differentFingerprintRejected: boolean; casUpdate: boolean;
  staleCasRejected: boolean; heartbeat: boolean; staleTakeover: boolean; oldOwnerFenced: boolean;
  leaseAbort: boolean; mediaPrefixDenied: boolean; listingCallCount: 0; cleanup: boolean;
  testControlResidue: number;
}>;

type SafeLog = Readonly<{
  event: "acquisition-worker-trust";
  trustStage: "correct-audience" | "wrong-audience" | "unauthenticated";
  httpStatus: number;
  audienceMatch: boolean;
  elapsedBucket: number;
}>;

export type AcquisitionWorkerTrustDependencies = Readonly<{
  getIdToken(audience: string): Promise<string>;
  fetch(input: string, init?: RequestInit): Promise<Response>;
  log(entry: SafeLog): void;
  now(): number;
}>;

export class AcquisitionWorkerTrustFailure extends Error {
  constructor(readonly code: AcquisitionWorkerAuthFailureCode) {
    super(code);
    this.name = "AcquisitionWorkerTrustFailure";
  }
}

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new AcquisitionWorkerTrustFailure("worker-auth-config-invalid");
  return value;
};

export const readAcquisitionWorkerTrustConfiguration = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AcquisitionWorkerTrustConfiguration => {
  const projectId = required("GCP_PROJECT_ID", environment.GCP_PROJECT_ID);
  const providerResource = required("GCP_WIF_PROVIDER_RESOURCE", environment.GCP_WIF_PROVIDER_RESOURCE);
  const invokerServiceAccount = required("GCP_ACQUISITION_WIF_SERVICE_ACCOUNT", environment.GCP_ACQUISITION_WIF_SERVICE_ACCOUNT);
  const workerUrl = required("ACQUISITION_WORKER_URL", environment.ACQUISITION_WORKER_URL);
  if (projectId !== PROJECT_ID || providerResource !== PROVIDER || invokerServiceAccount !== INVOKER || workerUrl !== WORKER_URL) {
    throw new AcquisitionWorkerTrustFailure("worker-auth-config-invalid");
  }
  return Object.freeze({ projectId, providerResource, invokerServiceAccount, workerUrl });
};

const rejected = (status: number): boolean => [401, 403, 404].includes(status);
const elapsedBucket = (startedAt: number, now: number): number => Math.ceil(Math.max(0, now - startedAt) / 100) * 100;

const fetchWorker = async (
  configuration: AcquisitionWorkerTrustConfiguration,
  dependencies: AcquisitionWorkerTrustDependencies,
  token?: string,
): Promise<Response> => {
  try {
    return await dependencies.fetch(`${configuration.workerUrl}/readyz`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new AcquisitionWorkerTrustFailure("worker-timeout");
    }
    throw new AcquisitionWorkerTrustFailure("worker-unavailable");
  }
};

export const createAcquisitionWorkerTrustClient = (
  configuration: AcquisitionWorkerTrustConfiguration,
  dependencies: AcquisitionWorkerTrustDependencies,
) => Object.freeze({
  async proveControlStore(): Promise<AcquisitionControlStoreProofEvidence> {
    const token = await dependencies.getIdToken(configuration.workerUrl);
    if (!token) throw new AcquisitionWorkerTrustFailure("worker-id-token-failed");
    let response: Response;
    try {
      response = await dependencies.fetch(`${configuration.workerUrl}/internal/control-store-proof`, {
        method: "POST", headers: { authorization: `Bearer ${token}` }, cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new AcquisitionWorkerTrustFailure("worker-unavailable");
    }
    if (response.status !== 200) throw new AcquisitionWorkerTrustFailure("worker-auth-rejected");
    const body = await response.json().catch(() => null) as { success?: unknown; evidence?: unknown } | null;
    const evidence = body?.evidence;
    const keys = ["workerIdentityMatch", "controlCreate", "concurrentClaim", "controlRead", "sameFingerprintReplay",
      "differentFingerprintRejected", "casUpdate", "staleCasRejected", "heartbeat", "staleTakeover",
      "oldOwnerFenced", "leaseAbort", "mediaPrefixDenied", "listingCallCount", "cleanup", "testControlResidue"] as const;
    if (body?.success !== true || !evidence || typeof evidence !== "object" || Array.isArray(evidence)
      || Object.keys(evidence).length !== keys.length || Object.keys(evidence).some((key) => !keys.includes(key as typeof keys[number]))) {
      throw new AcquisitionWorkerTrustFailure("worker-unavailable");
    }
    const value = evidence as Record<string, unknown>;
    if (keys.slice(0, 13).some((key) => typeof value[key] !== "boolean") || value.listingCallCount !== 0
      || typeof value.cleanup !== "boolean" || !Number.isSafeInteger(value.testControlResidue) || (value.testControlResidue as number) < 0) {
      throw new AcquisitionWorkerTrustFailure("worker-unavailable");
    }
    return Object.freeze({ ...value }) as AcquisitionControlStoreProofEvidence;
  },
  async verify(): Promise<AcquisitionWorkerTrustEvidence> {
    const correctStarted = dependencies.now();
    const correctToken = await dependencies.getIdToken(configuration.workerUrl);
    if (!correctToken) throw new AcquisitionWorkerTrustFailure("worker-id-token-failed");
    const correct = await fetchWorker(configuration, dependencies, correctToken);
    if (correct.status !== 200) throw new AcquisitionWorkerTrustFailure("worker-auth-rejected");
    const readiness = await correct.json().catch(() => null) as { ready?: unknown } | null;
    if (readiness?.ready !== true) throw new AcquisitionWorkerTrustFailure("worker-unavailable");
    dependencies.log({
      event: "acquisition-worker-trust",
      trustStage: "correct-audience",
      httpStatus: 200,
      audienceMatch: true,
      elapsedBucket: elapsedBucket(correctStarted, dependencies.now()),
    });

    const wrongStarted = dependencies.now();
    const wrongToken = await dependencies.getIdToken(WRONG_AUDIENCE);
    if (!wrongToken) throw new AcquisitionWorkerTrustFailure("worker-id-token-failed");
    const wrong = await fetchWorker(configuration, dependencies, wrongToken);
    if (!rejected(wrong.status)) throw new AcquisitionWorkerTrustFailure("worker-auth-rejected");
    dependencies.log({
      event: "acquisition-worker-trust",
      trustStage: "wrong-audience",
      httpStatus: wrong.status,
      audienceMatch: false,
      elapsedBucket: elapsedBucket(wrongStarted, dependencies.now()),
    });

    const unauthenticatedStarted = dependencies.now();
    const unauthenticated = await fetchWorker(configuration, dependencies);
    if (!rejected(unauthenticated.status)) throw new AcquisitionWorkerTrustFailure("worker-auth-rejected");
    dependencies.log({
      event: "acquisition-worker-trust",
      trustStage: "unauthenticated",
      httpStatus: unauthenticated.status,
      audienceMatch: false,
      elapsedBucket: elapsedBucket(unauthenticatedStarted, dependencies.now()),
    });

    return Object.freeze({
      correctAudience: Object.freeze({ tokenObtained: true, httpStatus: 200, audienceMatch: true, workerReady: true, invokerIdentityMatch: true }),
      wrongAudience: Object.freeze({ tested: true, httpStatus: wrong.status, rejected: true }),
      unauthenticated: Object.freeze({ tested: true, httpStatus: unauthenticated.status, rejected: true }),
    });
  },
});
