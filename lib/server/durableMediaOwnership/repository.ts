import { randomUUID } from "node:crypto";
import { createExportStorageKey, createMediaStorageKey, isUuid, type MediaStorageKind } from "./storageKey";

export type OwnershipQueryResult<Row = unknown> = Readonly<{ rows: readonly Row[]; rowCount: number | null }>;
export type OwnershipQueryClient = Readonly<{
  // SQL text cannot prove an arbitrary caller-selected generic row type.
  query(text: string, values: readonly unknown[]): Promise<OwnershipQueryResult>;
}>;

export type OwnedJob = Readonly<{ id: string; ownerUid: string; status: "created" | "processing" | "completed" | "failed" }>;
export type OwnedMedia = Readonly<{ id: string; jobId: string; storageKey: string; kind: MediaStorageKind }>;
export type OwnedExport = Readonly<{ id: string; jobId: string; storageKey: string }>;

const owner = (uid: string): string => {
  if (!uid) throw new Error("Canonical owner UID is required");
  return uid;
};
const validId = (id: string): boolean => isUuid(id);
const record = (row: unknown): row is Record<string, unknown> => row !== null && typeof row === "object" && !Array.isArray(row);
const uuid = (value: unknown): value is string => typeof value === "string" && isUuid(value);
const jobStatus = (value: unknown): value is OwnedJob["status"] => value === "created" || value === "processing" || value === "completed" || value === "failed";
const job = (row: unknown): OwnedJob => {
  if (!record(row) || !uuid(row.id) || typeof row.owner_uid !== "string" || !row.owner_uid || !jobStatus(row.status)) throw Error("INVALID_OWNERSHIP_ROW");
  return Object.freeze({ id: row.id, ownerUid: row.owner_uid, status: row.status });
};
const media = (row: unknown): OwnedMedia => {
  if (!record(row) || !uuid(row.id) || !uuid(row.job_id) || typeof row.storage_key !== "string" || !row.storage_key || (row.kind !== "input" && row.kind !== "work")) throw Error("INVALID_OWNERSHIP_ROW");
  return Object.freeze({ id: row.id, jobId: row.job_id, storageKey: row.storage_key, kind: row.kind });
};
const exported = (row: unknown): OwnedExport => {
  if (!record(row) || !uuid(row.id) || !uuid(row.job_id) || typeof row.storage_key !== "string" || !row.storage_key) throw Error("INVALID_OWNERSHIP_ROW");
  return Object.freeze({ id: row.id, jobId: row.job_id, storageKey: row.storage_key });
};

export const createDurableMediaOwnershipRepository = (client: OwnershipQueryClient) => Object.freeze({
  async createJob(canonicalOwnerUid: string): Promise<OwnedJob> {
    const id = randomUUID();
    return this.createJobWithId(id, canonicalOwnerUid);
  },

  async createJobWithId(id: string, canonicalOwnerUid: string): Promise<OwnedJob> {
    if (!validId(id)) throw new Error("Invalid job ID");
    const result = await client.query(
      "INSERT INTO workflow.jobs (id, owner_uid, status) VALUES ($1, $2, 'created') RETURNING id, owner_uid, status",
      [id, owner(canonicalOwnerUid)],
    );
    const created = job(result.rows[0]);
    if (created.id !== id || created.ownerUid !== canonicalOwnerUid) throw Error("INVALID_OWNERSHIP_ROW");
    return created;
  },

  async resolveOwnedJob(jobId: string, canonicalOwnerUid: string): Promise<OwnedJob | undefined> {
    if (!validId(jobId)) return undefined;
    const result = await client.query(
      "SELECT id, owner_uid, status FROM workflow.jobs WHERE id = $1 AND owner_uid = $2",
      [jobId, owner(canonicalOwnerUid)],
    );
    if (!result.rows.length) return undefined;
    const owned = job(result.rows[0]);
    return owned.id === jobId && owned.ownerUid === canonicalOwnerUid ? owned : undefined;
  },

  async createMedia(jobId: string, canonicalOwnerUid: string, kind: MediaStorageKind, mime: string): Promise<OwnedMedia | undefined> {
    if (!validId(jobId)) return undefined;
    const id = randomUUID();
    return this.createMediaWithId(id, jobId, canonicalOwnerUid, kind, mime);
  },

  async createMediaWithId(id: string, jobId: string, canonicalOwnerUid: string, kind: MediaStorageKind, mime: string): Promise<OwnedMedia | undefined> {
    if (!validId(id) || !validId(jobId)) return undefined;
    const storageKey = createMediaStorageKey(jobId, id, kind, mime);
    const result = await client.query(
      "INSERT INTO workflow.media (id, job_id, storage_key, kind) SELECT $1, j.id, $2, $3 FROM workflow.jobs j WHERE j.id = $4 AND j.owner_uid = $5 RETURNING id, job_id, storage_key, kind",
      [id, storageKey, kind, jobId, owner(canonicalOwnerUid)],
    );
    if (!result.rows.length) return undefined;
    const created = media(result.rows[0]);
    if (created.id !== id || created.jobId !== jobId || created.storageKey !== storageKey || created.kind !== kind) throw Error("INVALID_OWNERSHIP_ROW");
    return created;
  },

  async resolveOwnedMedia(mediaId: string, canonicalOwnerUid: string): Promise<OwnedMedia | undefined> {
    if (!validId(mediaId)) return undefined;
    const result = await client.query(
      "SELECT m.id, m.job_id, m.storage_key, m.kind FROM workflow.media m JOIN workflow.jobs j ON j.id = m.job_id WHERE m.id = $1 AND j.owner_uid = $2",
      [mediaId, owner(canonicalOwnerUid)],
    );
    if (!result.rows.length) return undefined;
    const owned = media(result.rows[0]);
    return owned.id === mediaId ? owned : undefined;
  },

  async createExport(jobId: string, canonicalOwnerUid: string, mime: string): Promise<OwnedExport | undefined> {
    if (!validId(jobId)) return undefined;
    const id = randomUUID();
    return this.createExportWithId(id, jobId, canonicalOwnerUid, mime);
  },

  async createExportWithId(id: string, jobId: string, canonicalOwnerUid: string, mime: string): Promise<OwnedExport | undefined> {
    if (!validId(id) || !validId(jobId)) return undefined;
    const storageKey = createExportStorageKey(jobId, id, mime);
    const result = await client.query(
      "INSERT INTO workflow.exports (id, job_id, storage_key) SELECT $1, j.id, $2 FROM workflow.jobs j WHERE j.id = $3 AND j.owner_uid = $4 RETURNING id, job_id, storage_key",
      [id, storageKey, jobId, owner(canonicalOwnerUid)],
    );
    if (!result.rows.length) return undefined;
    const created = exported(result.rows[0]);
    if (created.id !== id || created.jobId !== jobId || created.storageKey !== storageKey) throw Error("INVALID_OWNERSHIP_ROW");
    return created;
  },

  async resolveOwnedExport(exportId: string, canonicalOwnerUid: string): Promise<OwnedExport | undefined> {
    if (!validId(exportId)) return undefined;
    const result = await client.query(
      "SELECT e.id, e.job_id, e.storage_key FROM workflow.exports e JOIN workflow.jobs j ON j.id = e.job_id WHERE e.id = $1 AND j.owner_uid = $2",
      [exportId, owner(canonicalOwnerUid)],
    );
    if (!result.rows.length) return undefined;
    const owned = exported(result.rows[0]);
    return owned.id === exportId ? owned : undefined;
  },
});
