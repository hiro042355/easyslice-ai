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

export const runProductionMediaRuntimeProbe = async (
  environment: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: ProductionMediaProbeDependencies = {
    getOidcToken: () => getVercelOidcToken(),
    runGcs: runProductionGcsProbe,
    runCloudSql: runProductionCloudSqlProbe,
  },
): Promise<Readonly<{ status: "ready"; gcs: "pass"; cloudSql: "pass" }>> => {
  const authClient = createProductionMediaWifClient(readProductionMediaWifConfiguration(environment), dependencies.getOidcToken);
  await dependencies.runGcs(authClient, environment.MEDIA_BUCKET_NAME ?? "");
  await dependencies.runCloudSql(authClient, {
    instanceConnectionName: environment.CLOUD_SQL_INSTANCE_CONNECTION_NAME ?? "",
    database: environment.POSTGRES_DATABASE ?? "",
    iamUser: environment.POSTGRES_IAM_USER ?? "",
  });
  return Object.freeze({ status: "ready", gcs: "pass", cloudSql: "pass" });
};
