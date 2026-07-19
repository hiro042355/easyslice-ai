import type { DurableWorkflowDatabaseCapability, DurableWorkflowDatabaseExecutionResult, DurableWorkflowDatabaseRow, DurableWorkflowDatabaseScalar } from "../durableTransaction";
import type { ProtectedIdentity, ReconciliationDigestDomain, ReconciliationFingerprintDomain, SemanticFingerprint } from "./types";

export const cloneParameters = (values: readonly DurableWorkflowDatabaseScalar[]) => Object.freeze(values.map(value => value instanceof Uint8Array ? Uint8Array.from(value) : value));
export const execute = (database: DurableWorkflowDatabaseCapability, statementId: string, parameters: readonly DurableWorkflowDatabaseScalar[], expectedResult: "none" | "single" | "many"): Promise<DurableWorkflowDatabaseExecutionResult> => database.execute(Object.freeze({ commandVersion: "1.0", statementId, parameters: cloneParameters(parameters), expectedResult }));
export const text = (row: DurableWorkflowDatabaseRow, key: string) => typeof row[key] === "string" ? row[key] : undefined;
export const integer = (row: DurableWorkflowDatabaseRow, key: string) => typeof row[key] === "number" && Number.isSafeInteger(row[key]) ? row[key] : undefined;
export const numericText = (row: DurableWorkflowDatabaseRow, key: string) => typeof row[key] === "string" ? row[key] : typeof row[key] === "number" && Number.isSafeInteger(row[key]) ? String(row[key]) : undefined;
export const bytes = (row: DurableWorkflowDatabaseRow, key: string) => row[key] instanceof Uint8Array ? Uint8Array.from(row[key]) : undefined;
export const validUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const validIdentity = <D extends ReconciliationDigestDomain>(value: unknown, domain: D): value is ProtectedIdentity<D> => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ProtectedIdentity<D>>;
  return candidate.domain === domain && candidate.algorithm === "hmac-sha256" && Number.isSafeInteger(candidate.algorithmVersion) && (candidate.algorithmVersion ?? 0) > 0 && candidate.digest instanceof Uint8Array && candidate.digest.byteLength === 32;
};
export const validFingerprint = <D extends ReconciliationFingerprintDomain>(value: unknown, domain: D): value is SemanticFingerprint<D> => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SemanticFingerprint<D>>;
  return candidate.domain === domain && candidate.algorithm === "hmac-sha256" && Number.isSafeInteger(candidate.algorithmVersion) && (candidate.algorithmVersion ?? 0) > 0 && candidate.digest instanceof Uint8Array && candidate.digest.byteLength === 32;
};
export const identityFromRow = <D extends ReconciliationDigestDomain>(row: DurableWorkflowDatabaseRow, prefix: string, domain: D): ProtectedIdentity<D> | undefined => {
  const actualDomain = text(row, `${prefix}_digest_domain`); const algorithm = text(row, `${prefix}_digest_algorithm`); const versionText = numericText(row, `${prefix}_digest_version`); const digest = bytes(row, `${prefix}_digest`);
  const version = versionText === undefined ? undefined : Number(versionText);
  return actualDomain === domain && algorithm === "hmac-sha256" && Number.isSafeInteger(version) && version! > 0 && digest?.byteLength === 32 ? Object.freeze({ domain, algorithm, algorithmVersion: version!, digest }) : undefined;
};
export const fingerprintFromRow = <D extends ReconciliationFingerprintDomain>(row: DurableWorkflowDatabaseRow, domain: D): SemanticFingerprint<D> | undefined => {
  const actualDomain = text(row, "semantic_fingerprint_domain"); const algorithm = text(row, "semantic_fingerprint_algorithm"); const versionText = numericText(row, "semantic_fingerprint_algorithm_version"); const digest = bytes(row, "semantic_fingerprint_digest"); const version = versionText === undefined ? undefined : Number(versionText);
  return actualDomain === domain && algorithm === "hmac-sha256" && Number.isSafeInteger(version) && version! > 0 && digest?.byteLength === 32 ? Object.freeze({ domain, algorithm, algorithmVersion: version!, digest }) : undefined;
};
export const safeJson = (value: unknown): Readonly<Record<string, string | number | boolean | null>> | undefined => {
  if (typeof value !== "string") return undefined;
  try { const parsed: unknown = JSON.parse(value); if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined; const entries = Object.entries(parsed); if (entries.some(([, item]) => item !== null && !["string", "number", "boolean"].includes(typeof item))) return undefined; return Object.freeze(Object.fromEntries(entries)); } catch { return undefined; }
};
export const immutableRecord = <T extends object>(value: T): Readonly<T> => Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item instanceof Uint8Array ? Uint8Array.from(item) : item])) as T);
export const sameDigest = (a: Uint8Array, b: Uint8Array) => a.byteLength === b.byteLength && a.every((value, index) => value === b[index]);
