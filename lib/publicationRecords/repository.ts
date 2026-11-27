import { randomUUID } from "node:crypto";
import type { PublicationIntent } from "../publicationBoundary/contracts";
import type { PublicationRightsSnapshot } from "../rightsRegistry/contracts";
import {
  isPublicationContentFormat,
  isPublicationContentFormatForPlatform,
  type PublicationContentFormat,
  type PublicationContentPlatform,
  type PublicationMetadataDeclaration,
} from "./metadata";

export const PUBLICATION_STATES = [
  "DRAFT", "VALIDATING", "READY", "AWAITING_CONFIRMATION", "QUEUED",
  "UPLOADING", "INTERRUPTED", "RECONCILING", "PUBLISHED_PRIVATE",
  "FAILED", "CANCELLED",
] as const;

export type PublicationState = (typeof PUBLICATION_STATES)[number];

export const isPublicationState = (value: unknown): value is PublicationState =>
  typeof value === "string" && (PUBLICATION_STATES as readonly string[]).includes(value);

/**
 * This is deliberately separate from the publication lifecycle state. A durable
 * `PUBLISHED_PRIVATE` state describes a completed intent; it does not prove that a
 * remote provider was contacted or that private visibility was observed. Only a real
 * provider receipt with verification VERIFIED may become REMOTE_PUBLICATION_VERIFIED.
 */
export const PUBLICATION_VERIFICATION_STATES = [
  "SIMULATION_COMPLETED",
  "UPLOAD_ACCEPTED",
  "REMOTE_PUBLICATION_VERIFIED",
  "REMOTE_PUBLICATION_FAILED",
  "REMOTE_STATE_UNKNOWN",
] as const;

export type PublicationVerificationState = (typeof PUBLICATION_VERIFICATION_STATES)[number];

export const isPublicationVerificationState = (value: unknown): value is PublicationVerificationState =>
  typeof value === "string" && (PUBLICATION_VERIFICATION_STATES as readonly string[]).includes(value);

/** Transport binding persisted with the intent. `REAL_TIKTOK` is admitted by the
 * TikTok adapter handoff; it never implies that a provider call was observed. */
export const PUBLICATION_TRANSPORT_KINDS = ["NONE", "FAKE_DETERMINISTIC", "REAL_YOUTUBE", "REAL_TIKTOK"] as const;
export type PublicationTransportKind = (typeof PUBLICATION_TRANSPORT_KINDS)[number];

export const isPublicationTransportKind = (value: unknown): value is PublicationTransportKind =>
  typeof value === "string" && (PUBLICATION_TRANSPORT_KINDS as readonly string[]).includes(value);

export type PublicationQueryResult<Row> = Readonly<{
  rows: readonly Row[];
  rowCount: number | null;
}>;

export type PublicationQueryClient = Readonly<{
  query<Row>(text: string, values?: readonly unknown[]): Promise<PublicationQueryResult<Row>>;
}>;

export type PublicationRecord = Readonly<{
  id: string;
  state: PublicationState;
  tenantId: string;
  platform: PublicationContentPlatform;
  contentFormat: PublicationContentFormat;
  operationId: string;
  idempotencyKey: string;
  asset: Readonly<{
    artifactId: string;
    revisionId: string;
    mediaDigest: string;
    mimeType: string;
    size: number;
  }>;
  metadataDigest: string;
  metadata: PublicationMetadataDeclaration;
  channelId: string | null;
  rightsEvidenceRef: string | null;
  rightsRecordId: string | null;
  rightsRevision: number | null;
  rightsSnapshot: Readonly<Record<string, unknown>> | null;
  privacyStatus: "private";
  revision: number;
  uploadSession: Readonly<Record<string, unknown>> | null;
  remoteVideoId: string | null;
  remoteProcessingStatus: string | null;
  reconciliationState: string | null;
  verificationState: PublicationVerificationState;
  transportKind: PublicationTransportKind;
  lastError: string | null;
  receipt: Readonly<Record<string, unknown>> | null;
  createdAt: string;
  updatedAt: string;
}>;

export type PublicationEvent = Readonly<{
  eventId: number;
  toState: PublicationState;
  detail: string | null;
  createdAt: string;
}>;

export type RepositoryResult =
  | Readonly<{ code: "APPLIED"; record: PublicationRecord }>
  | Readonly<{ code: "EXISTING"; record: PublicationRecord }>
  | Readonly<{ code: "NOT_FOUND" }>
  | Readonly<{ code: "CONFLICT"; record?: PublicationRecord }>
  | Readonly<{ code: "INVALID_RECORD" }>;

type Row = Readonly<Record<string, unknown>>;

const text = (value: unknown, max = 512): string | undefined =>
  typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;

const nullableText = (value: unknown, max = 512): string | null | undefined =>
  value === null || value === undefined ? null : text(value, max);

const integer = (value: unknown): number | undefined => {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
};

const digest = (value: unknown): string | undefined =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : undefined;

const iso = (value: unknown): string | undefined => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return undefined;
};

const stringArray = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value) || value.some(entry => typeof entry !== "string")) return undefined;
  return Object.freeze([...(value as string[])]);
};

const objectOrNull = (value: unknown): Readonly<Record<string, unknown>> | null | undefined => {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.freeze({ ...(value as Record<string, unknown>) });
};

export function decodePublicationRecord(value: unknown): PublicationRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Row;
  const id = text(row.id, 64);
  const state = row.state;
  const tenantId = text(row.tenant_id);
  const platform = row.platform;
  const contentFormat = row.content_format;
  const operationId = text(row.operation_id);
  const idempotencyKey = text(row.idempotency_key);
  const assetId = text(row.asset_id);
  const assetRevision = text(row.asset_revision_id);
  const mediaDigest = digest(row.media_digest);
  const mimeType = text(row.mime_type, 128);
  const size = integer(row.size_bytes);
  const metadataDigest = digest(row.metadata_digest);
  const title = text(row.title, 200);
  const description = typeof row.description === "string" ? row.description : undefined;
  const tags = stringArray(row.tags);
  const subtitleRefs = stringArray(row.subtitle_refs);
  const thumbnailRef = nullableText(row.thumbnail_ref);
  const channelId = nullableText(row.channel_id);
  const rightsEvidenceRef = nullableText(row.rights_evidence_ref);
  const rightsRecordId = nullableText(row.rights_record_id, 64);
  const rightsRevisionValue = row.rights_revision === null || row.rights_revision === undefined
    ? null : integer(row.rights_revision);
  const rightsSnapshot = objectOrNull(row.rights_snapshot);
  const revision = integer(row.revision);
  const uploadSession = objectOrNull(row.upload_session);
  const remoteVideoId = nullableText(row.remote_video_id);
  const remoteProcessingStatus = nullableText(row.remote_processing_status);
  const reconciliationState = nullableText(row.reconciliation_state);
  const verificationState = row.verification_state;
  const transportKind = row.transport_kind;
  const lastError = nullableText(row.last_error, 2000);
  const receipt = objectOrNull(row.receipt);
  const createdAt = iso(row.created_at);
  const updatedAt = iso(row.updated_at);
  if (!id || !isPublicationState(state) || !tenantId ||
      (platform !== "youtube" && platform !== "tiktok") ||
      !isPublicationContentFormat(contentFormat) ||
      !isPublicationContentFormatForPlatform(contentFormat, platform) ||
      !operationId || !idempotencyKey || !assetId || !assetRevision || !mediaDigest ||
      !mimeType || size === undefined || size < 1 || !metadataDigest || !title ||
      description === undefined || !tags || !subtitleRefs || thumbnailRef === undefined ||
      channelId === undefined || rightsEvidenceRef === undefined || rightsRecordId === undefined ||
      rightsRevisionValue === undefined || rightsSnapshot === undefined ||
      (rightsRecordId === null) !== (rightsRevisionValue === null) ||
      (rightsRecordId === null) !== (rightsSnapshot === null) ||
      revision === undefined ||
      uploadSession === undefined || remoteVideoId === undefined ||
      remoteProcessingStatus === undefined || reconciliationState === undefined ||
      !isPublicationVerificationState(verificationState) ||
      !isPublicationTransportKind(transportKind) ||
      lastError === undefined || receipt === undefined || !createdAt || !updatedAt ||
      row.privacy_status !== "private") return undefined;
  return Object.freeze({
    id,
    state,
    tenantId,
    platform,
    contentFormat,
    operationId,
    idempotencyKey,
    asset: Object.freeze({ artifactId: assetId, revisionId: assetRevision, mediaDigest, mimeType, size }),
    metadataDigest,
    metadata: Object.freeze({
      title,
      description,
      tags,
      subtitleRefs,
      ...(thumbnailRef ? { thumbnailRef } : {}),
      contentFormat,
    }),
    channelId,
    rightsEvidenceRef,
    rightsRecordId,
    rightsRevision: rightsRevisionValue,
    rightsSnapshot,
    privacyStatus: "private",
    revision,
    uploadSession,
    remoteVideoId,
    remoteProcessingStatus,
    reconciliationState,
    verificationState,
    transportKind,
    lastError,
    receipt,
    createdAt,
    updatedAt,
  });
}

export function decodePublicationEvent(value: unknown): PublicationEvent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Row;
  const eventId = integer(row.event_id);
  const state = row.to_state;
  const detail = nullableText(row.detail, 2000);
  const createdAt = iso(row.created_at);
  if (eventId === undefined || !isPublicationState(state) || detail === undefined || !createdAt) return undefined;
  return Object.freeze({ eventId, toState: state, detail, createdAt });
}

const TRANSITIONS: Readonly<Record<PublicationState, readonly PublicationState[]>> = Object.freeze({
  DRAFT: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["READY", "FAILED", "CANCELLED"],
  READY: ["AWAITING_CONFIRMATION", "CANCELLED"],
  AWAITING_CONFIRMATION: ["QUEUED", "CANCELLED"],
  QUEUED: ["UPLOADING", "CANCELLED", "FAILED"],
  UPLOADING: ["INTERRUPTED", "RECONCILING", "PUBLISHED_PRIVATE", "FAILED"],
  INTERRUPTED: ["RECONCILING", "QUEUED", "UPLOADING", "FAILED"],
  RECONCILING: ["PUBLISHED_PRIVATE", "FAILED", "INTERRUPTED"],
  PUBLISHED_PRIVATE: [],
  FAILED: ["QUEUED", "CANCELLED"],
  CANCELLED: [],
});

export const allowedPublicationNextStates = (from: PublicationState): readonly PublicationState[] =>
  TRANSITIONS[from];

export const canTransitionPublication = (from: PublicationState, to: PublicationState): boolean =>
  TRANSITIONS[from].includes(to);

export type CreatePublicationRecordInput = Readonly<{
  ownerUid: string;
  tenantId: string;
  intent: PublicationIntent;
  metadata: PublicationMetadataDeclaration;
  channelId?: string;
  rightsEvidenceRef?: string;
}>;

const valuesForCreate = (input: CreatePublicationRecordInput): readonly unknown[] => [
  randomUUID(),
  input.ownerUid,
  input.tenantId,
  "AWAITING_CONFIRMATION",
  input.intent.platform,
  input.metadata.contentFormat,
  input.intent.operationId,
  input.intent.idempotencyKey,
  input.intent.asset.artifactId,
  input.intent.asset.revisionId,
  input.intent.asset.mediaDigest,
  input.intent.asset.mimeType,
  input.intent.asset.size,
  input.intent.metadataDigest,
  input.metadata.title,
  input.metadata.description,
  JSON.stringify(input.metadata.tags),
  JSON.stringify(input.metadata.subtitleRefs),
  input.metadata.thumbnailRef ?? null,
  input.channelId ?? null,
  input.rightsEvidenceRef ?? null,
];

export function createPublicationRepository(client: PublicationQueryClient) {
  return Object.freeze({
    async create(input: CreatePublicationRecordInput): Promise<RepositoryResult> {
      // Destination pairing is enforced before the database CHECK so a bilibili
      // intent (valid boundary data, unsupported destination) is never persisted.
      if (!isPublicationContentFormatForPlatform(input.metadata.contentFormat, input.intent.platform)) {
        return Object.freeze({ code: "INVALID_RECORD" });
      }
      const inserted = await client.query<Row>(
        `INSERT INTO workflow.publication_intents
          (id, owner_uid, tenant_id, state, platform, content_format, operation_id,
           idempotency_key, asset_id, asset_revision_id, media_digest, mime_type,
           size_bytes, metadata_digest, title, description, tags, subtitle_refs,
           thumbnail_ref, channel_id, rights_evidence_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,
                 $18::jsonb,$19,$20,$21)
         ON CONFLICT (owner_uid, idempotency_key) DO NOTHING
         RETURNING *`,
        valuesForCreate(input),
      );
      if (inserted.rows[0]) {
        const record = decodePublicationRecord(inserted.rows[0]);
        if (!record) return Object.freeze({ code: "INVALID_RECORD" });
        await client.query(
          `INSERT INTO workflow.publication_events (publication_id, owner_uid, to_state, detail)
           VALUES ($1,$2,$3,$4)`,
          [record.id, input.ownerUid, record.state, "created"],
        );
        return Object.freeze({ code: "APPLIED", record });
      }
      const existing = await client.query<Row>(
        `SELECT * FROM workflow.publication_intents
         WHERE owner_uid=$1 AND idempotency_key=$2`,
        [input.ownerUid, input.intent.idempotencyKey],
      );
      const record = existing.rows[0] ? decodePublicationRecord(existing.rows[0]) : undefined;
      if (!record) return Object.freeze({ code: "CONFLICT" });
      const same = record.operationId === input.intent.operationId &&
        record.asset.artifactId === input.intent.asset.artifactId &&
        record.asset.revisionId === input.intent.asset.revisionId &&
        record.asset.mediaDigest === input.intent.asset.mediaDigest &&
        record.asset.size === input.intent.asset.size &&
        record.metadataDigest === input.intent.metadataDigest &&
        record.metadata.title === input.metadata.title &&
        record.metadata.description === input.metadata.description &&
        record.metadata.contentFormat === input.metadata.contentFormat &&
        JSON.stringify(record.metadata.tags) === JSON.stringify(input.metadata.tags) &&
        JSON.stringify(record.metadata.subtitleRefs) === JSON.stringify(input.metadata.subtitleRefs) &&
        record.metadata.thumbnailRef === input.metadata.thumbnailRef &&
        record.channelId === (input.channelId ?? null) &&
        record.rightsEvidenceRef === (input.rightsEvidenceRef ?? null);
      return same
        ? Object.freeze({ code: "EXISTING", record })
        : Object.freeze({ code: "CONFLICT", record });
    },

    async list(ownerUid: string): Promise<readonly PublicationRecord[]> {
      const result = await client.query<Row>(
        `SELECT * FROM workflow.publication_intents
         WHERE owner_uid=$1 ORDER BY created_at DESC, id DESC`,
        [ownerUid],
      );
      return Object.freeze(result.rows.map(decodePublicationRecord)
        .filter((record): record is PublicationRecord => record !== undefined));
    },

    async get(ownerUid: string, id: string): Promise<PublicationRecord | undefined> {
      const result = await client.query<Row>(
        `SELECT * FROM workflow.publication_intents WHERE owner_uid=$1 AND id=$2`,
        [ownerUid, id],
      );
      return result.rows[0] ? decodePublicationRecord(result.rows[0]) : undefined;
    },

    async events(ownerUid: string, id: string): Promise<readonly PublicationEvent[]> {
      const result = await client.query<Row>(
        `SELECT event_id, to_state, detail, created_at
         FROM workflow.publication_events
         WHERE owner_uid=$1 AND publication_id=$2 ORDER BY event_id ASC`,
        [ownerUid, id],
      );
      return Object.freeze(result.rows.map(decodePublicationEvent)
        .filter((event): event is PublicationEvent => event !== undefined));
    },

    async transition(
      ownerUid: string,
      id: string,
      expectedRevision: number,
      next: PublicationState,
      detail?: string,
      rightsSnapshot?: PublicationRightsSnapshot,
    ): Promise<RepositoryResult> {
      const current = await this.get(ownerUid, id);
      if (!current) return Object.freeze({ code: "NOT_FOUND" });
      if (!canTransitionPublication(current.state, next)) {
        return Object.freeze({ code: "CONFLICT", record: current });
      }
      if (next === "QUEUED" && (!current.channelId || !current.rightsEvidenceRef)) {
        return Object.freeze({ code: "CONFLICT", record: current });
      }
      const allowedFrom = Object.entries(TRANSITIONS)
        .filter(([, nextStates]) => nextStates.includes(next))
        .map(([from]) => from);
      const updated = await client.query<Row>(
        `WITH updated AS (
           UPDATE workflow.publication_intents
           SET state=$4, revision=revision+1, updated_at=transaction_timestamp(),
               last_error=CASE WHEN $4='FAILED' THEN $5 ELSE last_error END,
               rights_record_id=COALESCE($7::uuid, rights_record_id),
               rights_revision=COALESCE($8::bigint, rights_revision),
               rights_snapshot=COALESCE($9::jsonb, rights_snapshot)
           WHERE owner_uid=$1 AND id=$2 AND revision=$3 AND state = ANY($6::text[])
           RETURNING *
         ), logged AS (
           INSERT INTO workflow.publication_events (publication_id, owner_uid, to_state, detail)
           SELECT id, owner_uid, state, $5 FROM updated
         )
         SELECT * FROM updated`,
        [
          ownerUid, id, expectedRevision, next, detail ?? null, allowedFrom,
          rightsSnapshot?.rightsRecordId ?? null,
          rightsSnapshot?.revision ?? null,
          rightsSnapshot ? JSON.stringify(rightsSnapshot) : null,
        ],
      );
      const record = updated.rows[0] ? decodePublicationRecord(updated.rows[0]) : undefined;
      if (record) return Object.freeze({ code: "APPLIED", record });
      const latest = await this.get(ownerUid, id);
      return latest
        ? Object.freeze({ code: "CONFLICT", record: latest })
        : Object.freeze({ code: "NOT_FOUND" });
    },
  });
}

export type PublicationRepository = ReturnType<typeof createPublicationRepository>;
