import "server-only";

import { randomUUID } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import { createDurableMediaOwnershipRepository } from "@/lib/server/durableMediaOwnership";
import { withProductionMediaCloudSqlPool } from "./cloudSqlAdapter";
import { createProductionMediaWifClient, readProductionMediaWifConfiguration } from "./mediaWifCredential";

const SYNTHETIC_OWNER_PREFIX = "ownership-runtime-proof:";

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing Production media configuration: ${name}`);
  return value;
};

export const runProductionOwnershipRuntimeReadiness = async (): Promise<void> => {
  let stage = "configuration";
  const wif = readProductionMediaWifConfiguration();
  const auth = createProductionMediaWifClient(wif, () => getVercelOidcToken());
  const instanceConnectionName = required("CLOUD_SQL_INSTANCE_CONNECTION_NAME", process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME);
  const database = required("POSTGRES_DATABASE", process.env.POSTGRES_DATABASE);
  const iamUser = required("POSTGRES_IAM_USER", process.env.POSTGRES_IAM_USER);
  const proofId = randomUUID();
  const ownerA = `${SYNTHETIC_OWNER_PREFIX}${proofId}:owner-a`;
  const ownerB = `${SYNTHETIC_OWNER_PREFIX}${proofId}:owner-b`;

  try {
    await withProductionMediaCloudSqlPool(auth, { instanceConnectionName, database, iamUser }, async (pool) => {
      const repository = createDurableMediaOwnershipRepository(pool);
      stage = "job";
      const job = await repository.createJob(ownerA);
      if (!await repository.resolveOwnedJob(job.id, ownerA)) throw new Error("ownership-runtime-job-proof-failed");
      if (await repository.resolveOwnedJob(job.id, ownerB)) throw new Error("ownership-runtime-job-isolation-failed");

      stage = "media";
      const media = await repository.createMedia(job.id, ownerA, "input", "video/mp4");
      if (!media || !await repository.resolveOwnedMedia(media.id, ownerA)) throw new Error("ownership-runtime-media-proof-failed");
      if (await repository.resolveOwnedMedia(media.id, ownerB)) throw new Error("ownership-runtime-media-isolation-failed");

      stage = "export";
      const exported = await repository.createExport(job.id, ownerA, "application/zip");
      if (!exported || !await repository.resolveOwnedExport(exported.id, ownerA)) throw new Error("ownership-runtime-export-proof-failed");
      if (await repository.resolveOwnedExport(exported.id, ownerB)) throw new Error("ownership-runtime-export-isolation-failed");
    });
  } catch {
    console.error(`ownership-runtime-readiness:${stage}:failed`);
    throw new Error("ownership-runtime-readiness-failed");
  }
};
