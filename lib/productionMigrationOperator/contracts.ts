import { createHash } from "node:crypto";

export const DEFAULT_TARGET = "NONE" as const;
export const MAX_MIGRATIONS = 64;
export const MAX_SESSION_MS = 30 * 60 * 1000;
export const ARTIFACTS = Object.freeze({
  flyway: Object.freeze({ image: "flyway/flyway", version: "12.6.1", digest: "sha256:876479697e6f272e7897f9cebc5d43090e4e7ba164de9eb11e07767bff075011", platform: "linux/amd64" }),
  proxy: Object.freeze({ image: "gcr.io/cloud-sql-connectors/cloud-sql-proxy", version: "2.26.0", digest: "sha256:86e4f3cc266020e7ee07740df78d7511e2c340c274b56f84d80b7251913af9ad", childDigest: "sha256:076f128d5bdb9d345e253aa9bbf5f1f9a320caff21dfdbf07d582437e55e4f66", platform: "linux/amd64" }),
});
export type TargetKind = "NONE" | "LOCAL_REHEARSAL" | "NON_PRODUCTION_CLOUD_SQL" | "PRODUCTION";
export type Classification = "YES" | "NO" | "UNKNOWN";
export type Operation = "INFO" | "VALIDATE" | "MIGRATE";
export type ManifestEntry = Readonly<{ filename: string; sha256: string }>;
export type ArtifactInput = Readonly<{ image: string; version: string; digest: string; platform: string; childDigest?: string; automaticUpgrade?: false }>;
export type Target = Readonly<{ kind: TargetKind; id: string; database: string; identity: "MIGRATOR" | "RUNTIME" | "BOOTSTRAP" }>;
export type History = Readonly<{ schema: string; table: string; targetId: string; database: string; verified: Classification; locations: number }>;
export type Privileges = Readonly<{ targetId: string; database: string; identityVerified: Classification; databaseVerified: Classification; schemaExists: Classification; connect: Classification; usage: Classification; create: Classification; ownershipAlter: Classification; historyReadable: Classification; historyAuthoritative: Classification }>;
export type TransportContract = Readonly<{ adapter: "IN_MEMORY" | "LOCAL_DOCKER"; binding: "LOOPBACK_PRIVATE_NAMESPACE"; publishedPorts: false; restartPolicy: "NONE"; credentialModel: "NONE" | "DISPOSABLE_LOCAL"; sessionMs: number }>;
export type PreflightInput = Readonly<{ expectedCommit: string; actualCommit: string; worktreeClean: boolean; indexClean: boolean; target?: Target; migrations: readonly ManifestEntry[]; approvedManifest: readonly ManifestEntry[]; untrackedMigrations: readonly string[]; knownCollisions: readonly string[]; flyway: ArtifactInput; proxy: ArtifactInput; history: History; privileges: Privileges; transport: TransportContract }>;
export type FailureCode = "TARGET_REQUIRED" | "PRODUCTION_ADAPTER_UNAVAILABLE" | "CLOUD_ADAPTER_UNAVAILABLE" | "IDENTITY_REJECTED" | "SOURCE_MISMATCH" | "DIRTY_SOURCE" | "INDEX_DIRTY" | "UNTRACKED_MIGRATION" | "VERSION_COLLISION" | "VERSION_INVALID" | "VERSION_DUPLICATE" | "VERSION_GAP" | "MANIFEST_MISMATCH" | "ARTIFACT_MISMATCH" | "HISTORY_UNVERIFIED" | "PRIVILEGE_UNVERIFIED" | "TRANSPORT_CONTRACT_REJECTED" | "PENDING_MISMATCH" | "OPERATION_REJECTED" | "STATE_REJECTED" | "AUTHORIZATION_REJECTED" | "AUTHORIZATION_EXPIRED" | "AUTHORIZATION_REPLAY" | "TRANSPORT_FAILED" | "VALIDATION_FAILED" | "MIGRATION_FAILED" | "POST_VALIDATION_FAILED" | "CLEANUP_FAILED" | "CANCELLED" | "TIMEOUT" | "WRAPPER_EXCEPTION" | "CONCURRENT_OPERATION";
export class OperatorFailure extends Error {
  constructor(public readonly code: FailureCode) { super(code); }
}
const safeCodes = new Set<FailureCode>(["TARGET_REQUIRED","PRODUCTION_ADAPTER_UNAVAILABLE","CLOUD_ADAPTER_UNAVAILABLE","IDENTITY_REJECTED","SOURCE_MISMATCH","DIRTY_SOURCE","INDEX_DIRTY","UNTRACKED_MIGRATION","VERSION_COLLISION","VERSION_INVALID","VERSION_DUPLICATE","VERSION_GAP","MANIFEST_MISMATCH","ARTIFACT_MISMATCH","HISTORY_UNVERIFIED","PRIVILEGE_UNVERIFIED","TRANSPORT_CONTRACT_REJECTED","PENDING_MISMATCH","OPERATION_REJECTED","STATE_REJECTED","AUTHORIZATION_REJECTED","AUTHORIZATION_EXPIRED","AUTHORIZATION_REPLAY","TRANSPORT_FAILED","VALIDATION_FAILED","MIGRATION_FAILED","POST_VALIDATION_FAILED","CLEANUP_FAILED","CANCELLED","TIMEOUT","WRAPPER_EXCEPTION","CONCURRENT_OPERATION"]);
export function safeFailure(error: unknown, fallback: FailureCode): FailureCode {
  try { const code = error instanceof OperatorFailure ? Object.getOwnPropertyDescriptor(error,"code")?.value : undefined; if (typeof code === "string" && safeCodes.has(code as FailureCode)) return code as FailureCode; } catch { /* never expose error properties */ }
  return fallback;
}
export function fail(code: FailureCode): never { throw new OperatorFailure(code); }
const sha = /^[a-f0-9]{40}$/;
const identifier = /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/;
const filename = /^V([0-9]{6})__[a-z][a-z0-9]*(?:_[a-z0-9]+)*\.sql$/;
export function versions(entries: readonly ManifestEntry[]): readonly string[] {
  if (!Array.isArray(entries) || !entries.length || entries.length > MAX_MIGRATIONS) fail("VERSION_INVALID");
  const seen = new Set<number>();
  for (const entry of entries) {
    const match = typeof entry.filename === "string" ? filename.exec(entry.filename) : null;
    if (!match || Number(match[1]) === 0 || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail("VERSION_INVALID");
    const n = Number(match[1]);
    if (seen.has(n)) fail("VERSION_DUPLICATE");
    seen.add(n);
  }
  const numbers = [...seen].sort((a,b) => a-b);
  if (numbers.some((n,i) => n !== i+1)) fail("VERSION_GAP");
  return Object.freeze(numbers.map(n => String(n).padStart(6, "0")));
}
export function artifactMatches(actual: ArtifactInput, expected: ArtifactInput): boolean {
  if (!actual || typeof actual !== "object" || Object.keys(actual).some(k => !["image","version","digest","platform","childDigest","automaticUpgrade"].includes(k)) || (actual.automaticUpgrade !== undefined && actual.automaticUpgrade !== false)) return false;
  return actual.image === expected.image && actual.version === expected.version && actual.digest === expected.digest && actual.platform === expected.platform && actual.childDigest === expected.childDigest;
}
const certificates = new WeakSet<object>();
export type PassedPreflight = Readonly<{ source: string; target: Target; history: History; privileges: Privileges; manifest: readonly ManifestEntry[]; versions: readonly string[]; transport: TransportContract }>;
export function isPassedPreflight(value: object): boolean { return certificates.has(value); }
export function preflight(input: PreflightInput): PassedPreflight {
  const target = input.target;
  if (!target || target.kind === "NONE") fail("TARGET_REQUIRED");
  // No flag, capability, ADC, URL or environment value can activate these targets.
  if (target.kind === "PRODUCTION") fail("PRODUCTION_ADAPTER_UNAVAILABLE");
  if (target.kind === "NON_PRODUCTION_CLOUD_SQL") fail("CLOUD_ADAPTER_UNAVAILABLE");
  if (target.kind !== "LOCAL_REHEARSAL" || typeof target.id !== "string" || typeof target.database !== "string" || !identifier.test(target.id) || !identifier.test(target.database)) fail("TARGET_REQUIRED");
  if (target.identity !== "MIGRATOR") fail("IDENTITY_REJECTED");
  if (typeof input.expectedCommit !== "string" || typeof input.actualCommit !== "string" || !sha.test(input.expectedCommit) || input.actualCommit !== input.expectedCommit) fail("SOURCE_MISMATCH");
  if (input.worktreeClean !== true) fail("DIRTY_SOURCE");
  if (input.indexClean !== true) fail("INDEX_DIRTY");
  if (!Array.isArray(input.untrackedMigrations) || input.untrackedMigrations.length) fail("UNTRACKED_MIGRATION");
  if (!Array.isArray(input.knownCollisions) || input.knownCollisions.length) fail("VERSION_COLLISION");
  const orderedVersions = versions(input.migrations);
  versions(input.approvedManifest);
  const canonical = (entries: readonly ManifestEntry[]) => JSON.stringify([...entries].map(e => [e.filename,e.sha256]).sort());
  if (canonical(input.migrations) !== canonical(input.approvedManifest)) fail("MANIFEST_MISMATCH");
  if (!artifactMatches(input.flyway, ARTIFACTS.flyway) || !artifactMatches(input.proxy, ARTIFACTS.proxy)) fail("ARTIFACT_MISMATCH");
  const h = input.history;
  if (!h || h.verified !== "YES" || h.locations !== 1 || h.targetId !== target.id || h.database !== target.database || typeof h.schema !== "string" || typeof h.table !== "string" || !identifier.test(h.schema) || !identifier.test(h.table)) fail("HISTORY_UNVERIFIED");
  const p = input.privileges;
  if (!p || p.targetId !== target.id || p.database !== target.database || [p.identityVerified,p.databaseVerified,p.schemaExists,p.connect,p.usage,p.create,p.ownershipAlter,p.historyReadable,p.historyAuthoritative].some(v => v !== "YES")) fail("PRIVILEGE_UNVERIFIED");
  const t = input.transport;
  if (!t || !["IN_MEMORY","LOCAL_DOCKER"].includes(t.adapter) || t.binding !== "LOOPBACK_PRIVATE_NAMESPACE" || t.publishedPorts !== false || t.restartPolicy !== "NONE" || (t.adapter === "IN_MEMORY" ? t.credentialModel !== "NONE" : t.credentialModel !== "DISPOSABLE_LOCAL") || !Number.isSafeInteger(t.sessionMs) || t.sessionMs < 1 || t.sessionMs > MAX_SESSION_MS) fail("TRANSPORT_CONTRACT_REJECTED");
  const result = Object.freeze({ source: input.expectedCommit, target: Object.freeze({kind:target.kind,id:target.id,database:target.database,identity:target.identity}), history: Object.freeze({schema:h.schema,table:h.table,targetId:h.targetId,database:h.database,verified:h.verified,locations:h.locations}), privileges: Object.freeze({targetId:p.targetId,database:p.database,identityVerified:p.identityVerified,databaseVerified:p.databaseVerified,schemaExists:p.schemaExists,connect:p.connect,usage:p.usage,create:p.create,ownershipAlter:p.ownershipAlter,historyReadable:p.historyReadable,historyAuthoritative:p.historyAuthoritative}), manifest: Object.freeze(input.migrations.map(e => Object.freeze({filename:e.filename,sha256:e.sha256}))), versions: orderedVersions, transport: Object.freeze({adapter:t.adapter,binding:t.binding,publishedPorts:t.publishedPorts,restartPolicy:t.restartPolicy,credentialModel:t.credentialModel,sessionMs:t.sessionMs}) });
  certificates.add(result);
  return result;
}
export type Review = Readonly<{ sessionId: string; source: string; targetKind: "LOCAL_REHEARSAL"; targetBinding: string; historyBinding: string; flywayDigest: string; proxyDigest: string; pending: readonly string[] }>;
export function binding(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function pendingSet(pending: readonly string[], available: readonly string[]): readonly string[] {
  if (!Array.isArray(pending) || pending.length > MAX_MIGRATIONS || pending.some(v => !/^[0-9]{6}$/.test(v) || !available.includes(v)) || new Set(pending).size !== pending.length) fail("PENDING_MISMATCH");
  return Object.freeze([...pending].sort());
}
// Future Production authorization/transport must be designed and implemented separately.
// This foundation intentionally exports no Production authority constructor.
