/** Report-only, declared evidence. No billing, SDK, secret, runtime or network authority. */
export const ZERO_COST_COMPONENTS = Object.freeze(["hosting", "database", "encryption", "runtimeIdentity", "secrets", "callback", "authentication", "logging", "worker", "automation"] as const);
export const OAUTH_READINESS_CHECKS = Object.freeze(["hosting", "httpsCallback", "registeredRedirect", "database", "encryption", "runtimeIdentity", "secretManagement", "authentication", "stateProtection", "featureFlags", "rollback", "ownerAuthorization"] as const);
export type Component = typeof ZERO_COST_COMPONENTS[number];
export type ReadinessCheck = typeof OAUTH_READINESS_CHECKS[number];
export type Witness = Readonly<{ result: "VERIFIED" | "UNVERIFIED" | "BLOCKED"; source: "LOCAL_TEST" | "STATIC_SOURCE" | "OFFICIAL_DOCUMENTATION" | "AUTHORIZED_NON_PRODUCTION_RUNTIME" | "PRODUCT_OWNER_SAVED_STATE" | "PRODUCT_OWNER_AUTHORIZATION" }>;
export type CostDeclaration = Readonly<{ model: "FREE_NO_BILLING" | "EXISTING_NO_INCREMENT" | "METERED" | "TRIAL" | "UNKNOWN"; paymentRequired: boolean | null; billingActivationRequired: boolean | null; automaticUpgrade: boolean | null; overage: "STOP" | "CHARGE" | "UNKNOWN"; eligibility: "VERIFIED" | "UNVERIFIED"; capacity: "WITHIN_LIMIT" | "UNKNOWN"; source: "OFFICIAL_DOCUMENTATION" | "AUTHORIZED_ACCOUNT_METADATA" | "LOCAL_TEST" }>;
export type ZeroCostEvidence = Readonly<{ version: "1"; environment: "sandbox"; origin: string; redirectUri: string; connectEnabled: boolean; workerEnabled: boolean; encryption: "QUALIFIED_ENVELOPE" | "SOFTWARE_PROPOSAL" | "SYNTHETIC_ONLY" | "HMAC" | "UNKNOWN"; identity: "NON_PRODUCTION" | "PRODUCTION_BOUND" | "UNKNOWN"; components: Readonly<Partial<Record<Component, CostDeclaration>>>; checks: Readonly<Partial<Record<ReadinessCheck, Witness>>> }>;
const canonical = "https://www.nexcutai.com";
const resultValues = ["VERIFIED", "UNVERIFIED", "BLOCKED"];
const sources = ["LOCAL_TEST", "STATIC_SOURCE", "OFFICIAL_DOCUMENTATION", "AUTHORIZED_NON_PRODUCTION_RUNTIME", "PRODUCT_OWNER_SAVED_STATE", "PRODUCT_OWNER_AUTHORIZATION"];
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v)); }
function exact(v: unknown, keys: readonly string[]): v is Record<string, unknown> { return object(v) && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k)); }
/** This input cannot independently attest accounts/evidence; READY is reserved for a future approved live verifier. */
export function evaluateZeroCostReadiness(input: unknown) {
 try {
  if (!exact(input, ["version", "environment", "origin", "redirectUri", "connectEnabled", "workerEnabled", "encryption", "identity", "components", "checks"])) throw new Error();
  const v = input as ZeroCostEvidence;
  if (v.version !== "1" || v.environment !== "sandbox" || typeof v.origin !== "string" || typeof v.redirectUri !== "string" || v.origin.length >= 512 || v.redirectUri.length >= 512 || typeof v.connectEnabled !== "boolean" || typeof v.workerEnabled !== "boolean" || !["QUALIFIED_ENVELOPE", "SOFTWARE_PROPOSAL", "SYNTHETIC_ONLY", "HMAC", "UNKNOWN"].includes(v.encryption) || !["NON_PRODUCTION", "PRODUCTION_BOUND", "UNKNOWN"].includes(v.identity) || !object(v.components) || !object(v.checks) || Object.keys(v.components).some(k => !ZERO_COST_COMPONENTS.includes(k as Component)) || Object.keys(v.checks).some(k => !OAUTH_READINESS_CHECKS.includes(k as ReadinessCheck))) throw new Error();
  const o = new URL(v.origin), r = new URL(v.redirectUri);
  if (o.protocol !== "https:" || o.origin !== v.origin || o.username || o.password || r.protocol !== "https:" || r.origin !== v.origin || r.username || r.password || r.search || r.hash || r.pathname !== "/api/tiktok/oauth/callback") throw new Error();
  const costs = ZERO_COST_COMPONENTS.map(component => {
   const c = v.components[component];
   if (c === undefined) return Object.freeze({ component, state: "UNVERIFIED" as const, reason: "COST_EVIDENCE_REQUIRED" });
   if (!exact(c, ["model", "paymentRequired", "billingActivationRequired", "automaticUpgrade", "overage", "eligibility", "capacity", "source"]) || !["FREE_NO_BILLING", "EXISTING_NO_INCREMENT", "METERED", "TRIAL", "UNKNOWN"].includes(c.model) || [c.paymentRequired, c.billingActivationRequired, c.automaticUpgrade].some(b => b !== null && typeof b !== "boolean") || !["STOP", "CHARGE", "UNKNOWN"].includes(c.overage) || !["VERIFIED", "UNVERIFIED"].includes(c.eligibility) || !["WITHIN_LIMIT", "UNKNOWN"].includes(c.capacity) || !["OFFICIAL_DOCUMENTATION", "AUTHORIZED_ACCOUNT_METADATA", "LOCAL_TEST"].includes(c.source)) throw new Error();
   if (c.paymentRequired || c.billingActivationRequired) return Object.freeze({ component, state: "BLOCKED" as const, reason: "REQUIRES_PRODUCT_OWNER_APPROVAL" });
   if (["METERED", "TRIAL"].includes(c.model) || c.automaticUpgrade || c.overage === "CHARGE") return Object.freeze({ component, state: "BLOCKED" as const, reason: "ZERO_ADDITIONAL_COST_NOT_PROVEN" });
   if (c.model === "UNKNOWN" || c.paymentRequired !== false || c.billingActivationRequired !== false || c.automaticUpgrade !== false || c.overage !== "STOP" || c.eligibility !== "VERIFIED" || c.capacity !== "WITHIN_LIMIT" || c.source !== "AUTHORIZED_ACCOUNT_METADATA") return Object.freeze({ component, state: "UNVERIFIED" as const, reason: "ACCOUNT_ELIGIBILITY_CAPACITY_AND_HARD_STOP_REQUIRED" });
   return Object.freeze({ component, state: "DECLARED_ONLY" as const, reason: "INDEPENDENT_ACCOUNT_VERIFICATION_REQUIRED" });
  });
  const checks = OAUTH_READINESS_CHECKS.map(check => {
   const e = v.checks[check];
   if (e === undefined) return Object.freeze({ check, state: "UNVERIFIED" as const, reason: "EXTERNAL_EVIDENCE_REQUIRED" });
   if (!exact(e, ["result", "source"]) || !resultValues.includes(e.result) || !sources.includes(e.source)) throw new Error();
   if (e.result === "BLOCKED") return Object.freeze({ check, state: "BLOCKED" as const, reason: "PREREQUISITE_BLOCKED" });
   const source = check === "registeredRedirect" ? "PRODUCT_OWNER_SAVED_STATE" : check === "ownerAuthorization" ? "PRODUCT_OWNER_AUTHORIZATION" : "AUTHORIZED_NON_PRODUCTION_RUNTIME";
   return Object.freeze({ check, state: "UNVERIFIED" as const, reason: e.result !== "VERIFIED" || e.source !== source ? "QUALIFIED_EXTERNAL_EVIDENCE_REQUIRED" : "INDEPENDENT_VERIFICATION_NOT_INSTALLED" });
  });
  const blockers: string[] = [];
  if (v.origin === canonical) blockers.push("PRODUCTION_ORIGIN_NOT_ISOLATED");
  if (v.redirectUri !== canonical + "/api/tiktok/oauth/callback") blockers.push("ALTERNATE_CALLBACK_RELEASE_REQUIRED");
  if (v.connectEnabled) blockers.push("CONNECT_MUST_REMAIN_DISABLED");
  if (v.workerEnabled) blockers.push("WORKER_MUST_REMAIN_DISABLED");
  if (v.encryption === "HMAC") blockers.push("HMAC_NOT_ENCRYPTION");
  if (v.encryption === "SOFTWARE_PROPOSAL") blockers.push("SOFTWARE_CUSTODY_ADAPTER_REVIEW_REQUIRED");
  if (v.encryption === "SYNTHETIC_ONLY" || v.encryption === "UNKNOWN") blockers.push("QUALIFIED_ENVELOPE_REQUIRED");
  if (v.identity !== "NON_PRODUCTION") blockers.push("NON_PRODUCTION_IDENTITY_REQUIRED");
  const status: "READY" | "BLOCKED" | "UNVERIFIED" = blockers.length || costs.some(c => c.state === "BLOCKED") || checks.some(c => c.state === "BLOCKED") ? "BLOCKED" : "UNVERIFIED";
  return Object.freeze({ reportOnly: true, status, evidenceAssurance: "DECLARED_ONLY", costs: Object.freeze(costs), checks: Object.freeze(checks), blockers: Object.freeze(blockers), REAL_SANDBOX_OAUTH_READY: "NO" as const, executionAuthorized: false, firstFutureApiStage: "CREATOR_INFO_ONLY", networkOperations: 0, billingOperations: 0, deploymentOperations: 0 });
 } catch { throw new Error("ZERO_COST_INPUT_REJECTED"); }
}
