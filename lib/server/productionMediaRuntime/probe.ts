import { createHash, timingSafeEqual } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import { runProductionCloudSqlProbe } from "./cloudSqlAdapter";
import { runProductionGcsProbe } from "./gcsAdapter";
import { createProductionMediaWifClient, readProductionMediaWifConfiguration } from "./mediaWifCredential";

const digest = (value: string): Buffer => createHash("sha256").update(value, "utf8").digest();

export const authorizeProductionMediaProbe = (provided: string | null, expected: string | undefined): boolean =>
  process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production" &&
  typeof provided === "string" && typeof expected === "string" && expected.length >= 32 &&
  timingSafeEqual(digest(provided), digest(expected));

export type ProductionMediaProbeDependencies = Readonly<{
  getOidcToken(): Promise<string>;
  runGcs: typeof runProductionGcsProbe;
  runCloudSql: typeof runProductionCloudSqlProbe;
}>;

type ProductionMediaProbeStage = "gcs" | "cloud-sql";

export class ProductionMediaProbeStageError extends Error {
  constructor(
    readonly stage: ProductionMediaProbeStage,
    readonly originalError: unknown,
  ) {
    super(`Production media probe failed at ${stage}`);
    this.name = "ProductionMediaProbeStageError";
  }
}

type GoogleApiErrorShape = Readonly<{
  code?: unknown;
  errors?: ReadonlyArray<Readonly<{ reason?: unknown; message?: unknown }>>;
}>;

export const describeProductionMediaProbeFailure = (error: unknown): Readonly<{
  stage: ProductionMediaProbeStage | "unknown";
  errorClass: "google-api-error" | "runtime-error" | "unknown-error";
  code?: number | string;
  reason?: string;
  permission?: string;
}> => {
  const stage = error instanceof ProductionMediaProbeStageError ? error.stage : "unknown";
  const original = error instanceof ProductionMediaProbeStageError ? error.originalError : error;
  if (!(original instanceof Error)) return Object.freeze({ stage, errorClass: "unknown-error" });

  const googleError = original as Error & GoogleApiErrorShape;
  const code = typeof googleError.code === "number" ||
    (typeof googleError.code === "string" && /^[A-Z0-9_-]{1,32}$/.test(googleError.code))
    ? googleError.code
    : undefined;
  const first = Array.isArray(googleError.errors) ? googleError.errors[0] : undefined;
  const reason = typeof first?.reason === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(first.reason)
    ? first.reason
    : undefined;
  const permissionMatch = typeof first?.message === "string"
    ? first.message.match(/\bstorage\.[a-zA-Z.]+\b/)
    : null;

  return Object.freeze({
    stage,
    errorClass: code !== undefined || reason !== undefined ? "google-api-error" : "runtime-error",
    ...(code === undefined ? {} : { code }),
    ...(reason === undefined ? {} : { reason }),
    ...(permissionMatch === null ? {} : { permission: permissionMatch[0] }),
  });
};

export const runProductionMediaRuntimeProbe = async (
  environment: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: ProductionMediaProbeDependencies = {
    getOidcToken: () => getVercelOidcToken(),
    runGcs: runProductionGcsProbe,
    runCloudSql: runProductionCloudSqlProbe,
  },
): Promise<Readonly<{ status: "ready"; gcs: "pass"; cloudSql: "pass" }>> => {
  const authClient = createProductionMediaWifClient(readProductionMediaWifConfiguration(environment), dependencies.getOidcToken);
  try {
    await dependencies.runGcs(authClient, environment.MEDIA_BUCKET_NAME ?? "");
  } catch (error) {
    throw new ProductionMediaProbeStageError("gcs", error);
  }
  try {
    await dependencies.runCloudSql(authClient, {
      instanceConnectionName: environment.CLOUD_SQL_INSTANCE_CONNECTION_NAME ?? "",
      database: environment.POSTGRES_DATABASE ?? "",
      iamUser: environment.POSTGRES_IAM_USER ?? "",
    });
  } catch (error) {
    throw new ProductionMediaProbeStageError("cloud-sql", error);
  }
  return Object.freeze({ status: "ready", gcs: "pass", cloudSql: "pass" });
};
