import { randomUUID } from "node:crypto";
import { createExportStorageKey, createMediaStorageKey, isUuid, type MediaStorageKind } from "./storageKey";

export type OwnershipQueryResult<Row> = Readonly<{ rows: readonly Row[]; rowCount: number | null }>;
export type OwnershipQueryClient = Readonly<{
  query<Row>(text: string, values: readonly unknown[]): Promise<OwnershipQueryResult<Row>>;
}>;

export type OwnedJob = Readonly<{ id: string; ownerUid: string; status: "created" | "processing" | "completed" | "failed" }>;
export type OwnedMedia = Readonly<{ id: string; jobId: string; storageKey: string; kind: MediaStorageKind }>;
export type OwnedExport = Readonly<{ id: string; jobId: string; storageKey: string }>;

type JobRow = Readonly<{ id: string; owner_uid: string; status: OwnedJob["status"] }>;
type MediaRow = Readonly<{ id: string; job_id: string; storage_key: string; kind: MediaStorageKind }>;
type ExportRow = Readonly<{ id: string; job_id: string; storage_key: string }>;

const owner = (uid: string): string => {
  if (!uid) throw new Error("Canonical owner UID is required");
  return uid;
};
const validId = (id: string): boolean => isUuid(id);
const job = (row: JobRow): OwnedJob => Object.freeze({ id: row.id, ownerUid: row.owner_uid, status: row.status });
const media = (row: MediaRow): OwnedMedia => Object.freeze({ id: row.id, jobId: row.job_id, storageKey: row.storage_key, kind: row.kind });
const exported = (row: ExportRow): OwnedExport => Object.freeze({ id: row.id, jobId: row.job_id, storageKey: row.storage_key });

export const createDurableMediaOwnershipRepository = (client: OwnershipQueryClient) => Object.freeze({
  async createJob(canonicalOwnerUid: string): Promise<OwnedJob> {
    const id = randomUUID();
    return this.createJobWithId(id, canonicalOwnerUid);
  },

  async createJobWithId(id: string, canonicalOwnerUid: string): Promise<OwnedJob> {
    if (!validId(id)) throw new Error("Invalid job ID");
    const result = await client.query<JobRow>(
      "INSERT INTO workflow.jobs (id, owner_uid, status) VALUES ($1, $2, 'created') RETURNING id, owner_uid, status",
      [id, owner(canonicalOwnerUid)],
    );
    return job(result.rows[0]!);
  },

  async resolveOwnedJob(jobId: string, canonicalOwnerUid: string): Promise<OwnedJob | undefined> {
    if (!validId(jobId)) return undefined;
    const result = await client.query<JobRow>(
      "SELECT id, owner_uid, status FROM workflow.jobs WHERE id = $1 AND owner_uid = $2",
      [jobId, owner(canonicalOwnerUid)],
    );
    return result.rows[0] ? job(result.rows[0]) : undefined;
  },

  async createMedia(jobId: string, canonicalOwnerUid: string, kind: MediaStorageKind, mime: string): Promise<OwnedMedia | undefined> {
    if (!validId(jobId)) return undefined;
    const id = randomUUID();
    return this.createMediaWithId(id, jobId, canonicalOwnerUid, kind, mime);
  },

  async createMediaWithId(id: string, jobId: string, canonicalOwnerUid: string, kind: MediaStorageKind, mime: string): Promise<OwnedMedia | undefined> {
    if (!validId(id) || !validId(jobId)) return undefined;
    const storageKey = createMediaStorageKey(jobId, id, kind, mime);
    const result = await client.query<MediaRow>(
      "INSERT INTO workflow.media (id, job_id, storage_key, kind) SELECT $1, j.id, $2, $3 FROM workflow.jobs j WHERE j.id = $4 AND j.owner_uid = $5 RETURNING id, job_id, storage_key, kind",
      [id, storageKey, kind, jobId, owner(canonicalOwnerUid)],
    );
    return result.rows[0] ? media(result.rows[0]) : undefined;
  },

  async resolveOwnedMedia(mediaId: string, canonicalOwnerUid: string): Promise<OwnedMedia | undefined> {
    if (!validId(mediaId)) return undefined;
    const result = await client.query<MediaRow>(
      "SELECT m.id, m.job_id, m.storage_key, m.kind FROM workflow.media m JOIN workflow.jobs j ON j.id = m.job_id WHERE m.id = $1 AND j.owner_uid = $2",
      [mediaId, owner(canonicalOwnerUid)],
    );
    return result.rows[0] ? media(result.rows[0]) : undefined;
  },

  async createExport(jobId: string, canonicalOwnerUid: string, mime: string): Promise<OwnedExport | undefined> {
    if (!validId(jobId)) return undefined;
    const id = randomUUID();
    return this.createExportWithId(id, jobId, canonicalOwnerUid, mime);
  },

  async createExportWithId(id: string, jobId: string, canonicalOwnerUid: string, mime: string): Promise<OwnedExport | undefined> {
    if (!validId(id) || !validId(jobId)) return undefined;
    const storageKey = createExportStorageKey(jobId, id, mime);
    const result = await client.query<ExportRow>(
      "INSERT INTO workflow.exports (id, job_id, storage_key) SELECT $1, j.id, $2 FROM workflow.jobs j WHERE j.id = $3 AND j.owner_uid = $4 RETURNING id, job_id, storage_key",
      [id, storageKey, jobId, owner(canonicalOwnerUid)],
    );
    return result.rows[0] ? exported(result.rows[0]) : undefined;
  },

  async resolveOwnedExport(exportId: string, canonicalOwnerUid: string): Promise<OwnedExport | undefined> {
    if (!validId(exportId)) return undefined;
    const result = await client.query<ExportRow>(
      "SELECT e.id, e.job_id, e.storage_key FROM workflow.exports e JOIN workflow.jobs j ON j.id = e.job_id WHERE e.id = $1 AND j.owner_uid = $2",
      [exportId, owner(canonicalOwnerUid)],
    );
    return result.rows[0] ? exported(result.rows[0]) : undefined;
  },
});
