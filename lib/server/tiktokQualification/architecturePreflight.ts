/** Inert local decision tool. No credentials, SDK, runtime installation or execution authority. */
export const ARCHITECTURE_CHECKS = Object.freeze([
  "applicationConfiguration", "environmentSeparation", "redirectConsistency", "databaseReadiness",
  "encryptionReadiness", "runtimeIdentity", "firebaseBoundary", "stateStorage", "tokenCustody",
  "connectFlag", "workerFlag", "loggingRedaction", "callbackComposition", "disconnectPath", "rollback",
] as const);
export type ArchitectureCheck = typeof ARCHITECTURE_CHECKS[number];
export type PreflightState = "PASS" | "FAIL" | "UNVERIFIED" | "BLOCKED";
export type EvidenceSource = "LOCAL_TEST" | "STATIC_SOURCE" | "AUTHORIZED_NON_PRODUCTION_RUNTIME";
export type ArchitectureEvidence = Readonly<{
  version: "1"; option: "A" | "B" | "C"; environment: "sandbox";
  origin: string; redirectUri: string;
  connectEnabled: boolean; workerEnabled: boolean;
  database: "ISOLATED_PERSISTENT_TLS" | "DISPOSABLE_LOCAL" | "UNKNOWN";
  encryption: "SYMMETRIC_ENVELOPE" | "SYNTHETIC_ONLY" | "HMAC" | "UNKNOWN";
  identity: "NON_PRODUCTION" | "PRODUCTION_BOUND" | "UNKNOWN";
  checks: Readonly<Partial<Record<ArchitectureCheck, Readonly<{ state: PreflightState; source: EvidenceSource }>>>>;
}>;
const keys = ["version", "option", "environment", "origin", "redirectUri", "connectEnabled", "workerEnabled", "database", "encryption", "identity", "checks"];
const states = ["PASS", "FAIL", "UNVERIFIED", "BLOCKED"];
const sources = ["LOCAL_TEST", "STATIC_SOURCE", "AUTHORIZED_NON_PRODUCTION_RUNTIME"];
const external = new Set<ArchitectureCheck>(["databaseReadiness", "encryptionReadiness", "runtimeIdentity", "firebaseBoundary", "stateStorage", "callbackComposition", "disconnectPath", "rollback"]);
const canonical = "https://www.nexcutai.com";
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
export function evaluateArchitecturePreflight(input: unknown) {
  try {
    if (!object(input) || Object.keys(input).length !== keys.length || Object.keys(input).some(k => !keys.includes(k))) throw new Error();
    const v = input as ArchitectureEvidence;
    if (v.version !== "1" || !["A", "B", "C"].includes(v.option) || v.environment !== "sandbox" ||
      typeof v.origin !== "string" || typeof v.redirectUri !== "string" || v.origin.length > 511 || v.redirectUri.length > 511 ||
      typeof v.connectEnabled !== "boolean" || typeof v.workerEnabled !== "boolean" ||
      !["ISOLATED_PERSISTENT_TLS", "DISPOSABLE_LOCAL", "UNKNOWN"].includes(v.database) ||
      !["SYMMETRIC_ENVELOPE", "SYNTHETIC_ONLY", "HMAC", "UNKNOWN"].includes(v.encryption) ||
      !["NON_PRODUCTION", "PRODUCTION_BOUND", "UNKNOWN"].includes(v.identity) || !object(v.checks) ||
      Object.keys(v.checks).some(k => !ARCHITECTURE_CHECKS.includes(k as ArchitectureCheck))) throw new Error();
    const origin = new URL(v.origin), redirect = new URL(v.redirectUri);
    if (origin.protocol !== "https:" || origin.origin !== v.origin || origin.username || origin.password ||
      redirect.protocol !== "https:" || redirect.origin !== v.origin || redirect.username || redirect.password ||
      redirect.search || redirect.hash || redirect.pathname !== "/api/tiktok/oauth/callback") throw new Error();
    const results = ARCHITECTURE_CHECKS.map(check => {
      const e = v.checks[check];
      if (e && (!object(e) || Object.keys(e).length !== 2 || Object.keys(e).some(k => !["state", "source"].includes(k)) || !states.includes(e.state) || !sources.includes(e.source))) throw new Error();
      let state: PreflightState = e?.state ?? "UNVERIFIED";
      let reason = e ? "DECLARED_EVIDENCE" : "EVIDENCE_REQUIRED";
      const override = (s: PreflightState, r: string) => { state = s; reason = r; };
      if (state === "PASS" && external.has(check) && e?.source !== "AUTHORIZED_NON_PRODUCTION_RUNTIME") override("UNVERIFIED", "NON_PRODUCTION_RUNTIME_EVIDENCE_REQUIRED");
      if (check === "environmentSeparation" && v.origin === canonical) override("BLOCKED", "CANONICAL_PRODUCTION_ORIGIN_NOT_ISOLATED");
      if (check === "redirectConsistency" && v.redirectUri !== canonical + "/api/tiktok/oauth/callback") override("BLOCKED", "ALTERNATE_CALLBACK_CODE_PORTAL_FIREBASE_RELEASE_REQUIRED");
      if (check === "databaseReadiness" && v.database !== "ISOLATED_PERSISTENT_TLS") override(v.database === "DISPOSABLE_LOCAL" ? "BLOCKED" : "UNVERIFIED", "PERSISTENT_ISOLATED_DATABASE_REQUIRED");
      if (check === "encryptionReadiness" && v.encryption !== "SYMMETRIC_ENVELOPE") override(v.encryption === "HMAC" ? "FAIL" : "UNVERIFIED", "QUALIFIED_SYMMETRIC_KEY_REQUIRED");
      if (check === "runtimeIdentity" && v.identity !== "NON_PRODUCTION") override(v.identity === "PRODUCTION_BOUND" ? "BLOCKED" : "UNVERIFIED", "NON_PRODUCTION_IDENTITY_REQUIRED");
      if (check === "connectFlag") override(v.connectEnabled ? "BLOCKED" : "PASS", v.connectEnabled ? "CONNECT_MUST_REMAIN_DISABLED" : "CONNECT_DISABLED");
      if (check === "workerFlag") override(v.workerEnabled ? "BLOCKED" : "PASS", v.workerEnabled ? "WORKER_MUST_REMAIN_DISABLED" : "WORKER_DISABLED");
      return Object.freeze({ check, state, reason });
    });
    const status: PreflightState = results.some(r => r.state === "FAIL") ? "FAIL" : results.some(r => r.state === "BLOCKED") ? "BLOCKED" : results.some(r => r.state === "UNVERIFIED") ? "UNVERIFIED" : "PASS";
    return Object.freeze({ reportOnly: true, option: v.option, status, checks: Object.freeze(results), REAL_SANDBOX_OAUTH_READY: "NO" as const, executionAuthorized: false, networkOperations: 0, productionAccess: 0 });
  } catch { throw new Error("ARCHITECTURE_INPUT_REJECTED"); }
}
