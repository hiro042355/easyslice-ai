import { createHash, randomUUID } from "node:crypto";
import {
  canonicalRightsDigest,
  decodeRightsRecord,
  validateRightsAt,
  validateRightsEvidenceInput,
  type RightsEvidenceInput,
  type RightsPlatform,
  type RightsRecord,
  type RightsResult,
  type RightsValidation,
} from "./contracts";
import type { PublicationQueryClient } from "../publicationRecords/repository";

type Row = Readonly<Record<string, unknown>>;

const ref = /^[A-Za-z0-9_.:@/-]{1,512}$/;

function digestInput(input: RightsEvidenceInput): string {
  return canonicalRightsDigest({
    licenseKind: input.licenseKind,
    licenseRef: input.licenseRef,
    evidenceRef: input.evidenceRef,
    permittedUsage: input.permittedUsage,
    platformPermissions: input.platformPermissions,
    effectiveAtMs: input.effectiveAtMs,
    ...(input.expiresAtMs !== undefined ? { expiresAtMs: input.expiresAtMs } : {}),
  });
}

function valid(input: RightsEvidenceInput): boolean {
  return input.ownerUid.length > 0 && input.tenantId.length > 0 &&
    ref.test(input.rightsKey) && ref.test(input.sourceId) && ref.test(input.licenseRef) &&
    ref.test(input.evidenceRef) && /^[a-f0-9]{64}$/.test(input.evidenceDigest) &&
    input.permittedUsage.length > 0 && input.platformPermissions.length > 0 &&
    Number.isSafeInteger(input.effectiveAtMs) && input.effectiveAtMs > 0 &&
    (input.expiresAtMs === undefined || input.expiresAtMs > input.effectiveAtMs) &&
    input.evidenceDigest === digestInput(input);
}

function values(input: RightsEvidenceInput, id: string, revision: number, supersedesId: string | null): readonly unknown[] {
  return [
    id, input.rightsKey, input.ownerUid, input.tenantId, input.sourceId, input.assetId ?? null,
    input.licenseKind, input.licenseRef, input.evidenceRef, input.evidenceDigest,
    JSON.stringify(input.permittedUsage), JSON.stringify(input.platformPermissions),
    new Date(input.effectiveAtMs), input.expiresAtMs === undefined ? null : new Date(input.expiresAtMs),
    revision, supersedesId,
  ];
}

export function createRightsRegistry(client: PublicationQueryClient) {
  async function event(
    connection: PublicationQueryClient,
    record: RightsRecord,
    action: "CREATED" | "REVISED" | "REVOKED" | "REVALIDATED",
    detail?: string,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO workflow.rights_audit_events
        (rights_id, owner_uid, tenant_id, action, revision, detail)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [record.id, record.ownerUid, record.tenantId, action, record.revision, detail ?? null],
    );
  }

  async function latest(ownerUid: string, rightsKey: string): Promise<RightsRecord | undefined> {
    const result = await client.query<Row>(
      `SELECT * FROM workflow.rights_evidence
       WHERE owner_uid=$1 AND rights_key=$2 ORDER BY revision DESC LIMIT 1`,
      [ownerUid, rightsKey],
    );
    return result.rows[0] ? decodeRightsRecord(result.rows[0]) : undefined;
  }

  return Object.freeze({
    async create(input: RightsEvidenceInput): Promise<RightsResult> {
      if (!valid(input)) return Object.freeze({ code: "INVALID", detail: "RIGHTS_EVIDENCE_INVALID" });
      const existing = await latest(input.ownerUid, input.rightsKey);
      if (existing) return Object.freeze({ code: "CONFLICT", record: existing });
      const id = randomUUID();
      const inserted = await client.query<Row>(
        `INSERT INTO workflow.rights_evidence
          (id,rights_key,owner_uid,tenant_id,source_id,asset_id,license_kind,license_ref,
           evidence_ref,evidence_digest,permitted_usage,platform_permissions,effective_at,
           expires_at,revision,supersedes_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16)
         RETURNING *`,
        values(input, id, 1, null),
      );
      const record = inserted.rows[0] ? decodeRightsRecord(inserted.rows[0]) : undefined;
      if (!record) return Object.freeze({ code: "INVALID", detail: "RIGHTS_PERSISTENCE_INVALID" });
      await event(client, record, "CREATED", "rights evidence registered");
      return Object.freeze({ code: "APPLIED", record });
    },

    async revise(
      ownerUid: string,
      rightsKey: string,
      expectedRevision: number,
      input: RightsEvidenceInput,
    ): Promise<RightsResult> {
      if (!valid(input) || input.ownerUid !== ownerUid || input.rightsKey !== rightsKey) {
        return Object.freeze({ code: "INVALID", detail: "RIGHTS_REVISION_INVALID" });
      }
      const current = await latest(ownerUid, rightsKey);
      if (!current) return Object.freeze({ code: "NOT_FOUND" });
      if (current.revision !== expectedRevision) return Object.freeze({ code: "CONFLICT", record: current });
      if (current.status === "REVOKED") return Object.freeze({ code: "CONFLICT", record: current });
      const id = randomUUID();
      const inserted = await client.query<Row>(
        `INSERT INTO workflow.rights_evidence
          (id,rights_key,owner_uid,tenant_id,source_id,asset_id,license_kind,license_ref,
           evidence_ref,evidence_digest,permitted_usage,platform_permissions,effective_at,
           expires_at,revision,supersedes_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16)
         RETURNING *`,
        values(input, id, current.revision + 1, current.id),
      );
      const record = inserted.rows[0] ? decodeRightsRecord(inserted.rows[0]) : undefined;
      if (!record) return Object.freeze({ code: "INVALID", detail: "RIGHTS_PERSISTENCE_INVALID" });
      await event(client, record, "REVISED", `supersedes:${current.id}`);
      return Object.freeze({ code: "APPLIED", record });
    },

    async revoke(ownerUid: string, rightsKey: string, expectedRevision: number): Promise<RightsResult> {
      const current = await latest(ownerUid, rightsKey);
      if (!current) return Object.freeze({ code: "NOT_FOUND" });
      if (current.revision !== expectedRevision) return Object.freeze({ code: "CONFLICT", record: current });
      if (current.status === "REVOKED") return Object.freeze({ code: "CONFLICT", record: current });
      const id = randomUUID();
      const inserted = await client.query<Row>(
        `INSERT INTO workflow.rights_evidence
          (id,rights_key,owner_uid,tenant_id,source_id,asset_id,license_kind,license_ref,
           evidence_ref,evidence_digest,permitted_usage,platform_permissions,effective_at,
           expires_at,status,revoked_at,revision,supersedes_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,'REVOKED',
                 transaction_timestamp(),$15,$16)
         RETURNING *`,
        [
          id, current.rightsKey, current.ownerUid, current.tenantId, current.sourceId, current.assetId,
          current.licenseKind, current.licenseRef, current.evidenceRef, current.evidenceDigest,
          JSON.stringify(current.permittedUsage), JSON.stringify(current.platformPermissions),
          current.effectiveAt, current.expiresAt, current.revision + 1, current.id,
        ],
      );
      const record = inserted.rows[0] ? decodeRightsRecord(inserted.rows[0]) : undefined;
      if (!record) return Object.freeze({ code: "INVALID", detail: "RIGHTS_PERSISTENCE_INVALID" });
      await event(client, record, "REVOKED", `revokes:${current.id}`);
      return Object.freeze({ code: "APPLIED", record });
    },

    async get(ownerUid: string, id: string): Promise<RightsRecord | undefined> {
      const result = await client.query<Row>(
        `SELECT * FROM workflow.rights_evidence WHERE owner_uid=$1 AND id=$2`,
        [ownerUid, id],
      );
      return result.rows[0] ? decodeRightsRecord(result.rows[0]) : undefined;
    },

    async getLatest(ownerUid: string, rightsKey: string): Promise<RightsRecord | undefined> {
      return latest(ownerUid, rightsKey);
    },

    async history(ownerUid: string, rightsKey: string): Promise<readonly RightsRecord[]> {
      const result = await client.query<Row>(
        `SELECT * FROM workflow.rights_evidence
         WHERE owner_uid=$1 AND rights_key=$2 ORDER BY revision ASC`,
        [ownerUid, rightsKey],
      );
      return Object.freeze(result.rows.map(decodeRightsRecord)
        .filter((record): record is RightsRecord => record !== undefined));
    },

    async events(ownerUid: string, rightsKey: string): Promise<readonly Readonly<Record<string, unknown>>[]> {
      const result = await client.query<Row>(
        `SELECT e.* FROM workflow.rights_audit_events e
         JOIN workflow.rights_evidence r ON r.id=e.rights_id
         WHERE e.owner_uid=$1 AND r.rights_key=$2 ORDER BY e.event_id ASC`,
        [ownerUid, rightsKey],
      );
      return Object.freeze(result.rows.map(row => Object.freeze({ ...row })));
    },

    async requireActive(
      ownerUid: string,
      rightsKey: string,
      platform: RightsPlatform,
      nowMs = Date.now(),
    ): Promise<RightsValidation> {
      const record = await latest(ownerUid, rightsKey);
      if (!record) return Object.freeze({ allowed: false, code: "RIGHTS_NOT_FOUND" });
      return validateRightsAt(record, platform, nowMs);
    },

    async requireRecord(
      ownerUid: string,
      rightsRecordId: string,
      platform: RightsPlatform,
      nowMs = Date.now(),
    ): Promise<RightsValidation> {
      const record = await this.get(ownerUid, rightsRecordId);
      if (!record) return Object.freeze({ allowed: false, code: "RIGHTS_NOT_FOUND" });
      return validateRightsAt(record, platform, nowMs);
    },

    /** Stable digest of the exact evidence document persisted for this revision. */
    digest(record: RightsRecord): string {
      return createHash("sha256").update(JSON.stringify({
        id: record.id,
        rightsKey: record.rightsKey,
        revision: record.revision,
        evidenceDigest: record.evidenceDigest,
      })).digest("hex");
    },

    parse: validateRightsEvidenceInput,
  });
}

export type RightsRegistry = ReturnType<typeof createRightsRegistry>;
