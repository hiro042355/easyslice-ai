import { applyPublicationObservation, type ObservationResult } from "../publicationIntegration/observation";
import { resolvePublicationPrincipal } from "../publicationIntegration/principal";
import { decodePublicationRecord, type PublicationQueryClient, type PublicationRecord } from "../publicationRecords/repository";
import type { AdapterObservationReport } from "./observationBoundary";

/**
 * Adapter observation application (Core side of the Publication Observation contract).
 *
 * Authority is the verified adapter transport signature, but *scope* always comes
 * from the stored row: the owner and tenant in the report must match the record,
 * and the transition itself is decided by `applyPublicationObservation`. A report
 * that names a different owner is answered as not-found so the endpoint does not
 * confirm whether a foreign publication exists.
 *
 * This module is marker-free so the path can be executed under `tsx`.
 */
export type AdapterObservationOutcome =
  | Readonly<{ code: "APPLIED" | "DUPLICATE"; record: PublicationRecord }>
  | Readonly<{ code: "REJECTED"; status: 403 | 404 | 409 | 422; error: string }>;

const notFound: AdapterObservationOutcome = Object.freeze({ code: "REJECTED" as const, status: 404 as const, error: "publication_not_found" });

const mapRejection = (result: Extract<ObservationResult, { code: "REJECTED" | "INVALID_COMMAND" | "INVALID_RECORD" | "CONFLICT" | "NOT_FOUND" }>): AdapterObservationOutcome => {
  switch (result.code) {
    case "NOT_FOUND":
      return notFound;
    case "CONFLICT":
      return Object.freeze({ code: "REJECTED" as const, status: 409 as const, error: "revision_conflict" });
    case "INVALID_COMMAND":
    case "INVALID_RECORD":
      return Object.freeze({ code: "REJECTED" as const, status: 422 as const, error: "observation_command_invalid" });
    case "REJECTED":
      return Object.freeze({ code: "REJECTED" as const, status: 409 as const, error: `observation_rejected_${result.reason.toLowerCase()}` });
  }
};

export async function applyAdapterObservation(
  client: PublicationQueryClient,
  report: AdapterObservationReport,
): Promise<AdapterObservationOutcome> {
  const scoped = await client.query(
    `SELECT owner_uid, tenant_id FROM workflow.publication_intents
     WHERE id = $1 AND platform = 'tiktok'`,
    [report.publicationId],
  );
  const owner = scoped.rows[0] as { owner_uid?: unknown; tenant_id?: unknown } | undefined;
  if (!owner || owner.owner_uid !== report.ownerUid || owner.tenant_id !== report.tenantId) return notFound;

  const resolved = resolvePublicationPrincipal({ ownerUid: report.ownerUid, tenantId: report.tenantId });
  if (resolved.code !== "PRINCIPAL_BOUND") {
    return Object.freeze({ code: "REJECTED" as const, status: 422 as const, error: "observation_principal_invalid" });
  }

  // Two attempts cover a concurrent observation landing between the read and the
  // revision-guarded update; the second read observes the committed revision.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await client.query(
      `SELECT * FROM workflow.publication_intents WHERE id = $1 AND owner_uid = $2 AND tenant_id = $3 AND platform = 'tiktok'`,
      [report.publicationId, report.ownerUid, report.tenantId],
    );
    const record = current.rows[0] ? decodePublicationRecord(current.rows[0]) : undefined;
    if (!record) return notFound;

    const result = await applyPublicationObservation(client, {
      principal: resolved.principal,
      publicationId: record.id,
      expectedRevision: record.revision,
      observationId: report.observationId,
      observation: report.observation,
      ...(report.provider === undefined ? {} : { provider: report.provider }),
      ...(report.error === undefined ? {} : { error: report.error }),
    });
    if (result.code === "APPLIED" || result.code === "DUPLICATE") {
      return Object.freeze({ code: result.code, record: result.record });
    }
    if (result.code === "CONFLICT" && attempt === 0) continue;
    return mapRejection(result);
  }
  return Object.freeze({ code: "REJECTED" as const, status: 409 as const, error: "revision_conflict" });
}
