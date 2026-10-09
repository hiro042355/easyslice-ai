import {evaluateZeroCostReadiness} from "./zeroCostReadiness";
import type {ReadinessCheck} from "./zeroCostReadiness";
export const FINAL_READINESS_FIELDS = Object.freeze(["HOSTING_READY", "DATABASE_READY", "ENCRYPTION_READY", "IDENTITY_READY", "SECRETS_READY", "CALLBACK_READY", "PORTAL_READY", "BILLING_SAFE", "ROLLBACK_READY"] as const);
export type FinalReadinessField = typeof FINAL_READINESS_FIELDS[number];
export type ReadinessAnswer = "YES" | "NO" | "UNKNOWN";
/** Consolidates existing qualification rules. Declared JSON never independently verifies infrastructure. */
export function evaluateFinalSandboxPreflight(input: unknown) {
 try {
  const base = evaluateZeroCostReadiness(input);
  const answer = (checks: readonly ReadinessCheck[]): ReadinessAnswer => checks.some(k => base.checks.find(c => c.check === k)?.state === "BLOCKED") ? "NO" : "UNKNOWN";
  const readiness: Record<FinalReadinessField, ReadinessAnswer> = {
   HOSTING_READY: answer(["hosting"]), DATABASE_READY: answer(["database", "stateProtection"]),
   ENCRYPTION_READY: base.blockers.some(b => ["HMAC_NOT_ENCRYPTION", "SOFTWARE_CUSTODY_ADAPTER_REVIEW_REQUIRED", "QUALIFIED_ENVELOPE_REQUIRED"].includes(b)) ? "NO" : answer(["encryption"]),
   IDENTITY_READY: base.blockers.includes("NON_PRODUCTION_IDENTITY_REQUIRED") ? "NO" : answer(["runtimeIdentity", "authentication"]),
   SECRETS_READY: answer(["secretManagement"]),
   CALLBACK_READY: base.blockers.some(b => ["PRODUCTION_ORIGIN_NOT_ISOLATED", "ALTERNATE_CALLBACK_RELEASE_REQUIRED"].includes(b)) ? "NO" : answer(["httpsCallback"]),
   PORTAL_READY: answer(["registeredRedirect"]),
   BILLING_SAFE: base.costs.some(c => c.state === "BLOCKED") ? "NO" : "UNKNOWN",
   ROLLBACK_READY: answer(["rollback"]),
  };
  const ownerAuthorization = answer(["ownerAuthorization"]);
  const blockers = [...FINAL_READINESS_FIELDS.filter(k => readiness[k] !== "YES").map(k => k + "_" + readiness[k]), "OWNER_AUTHORIZED_" + ownerAuthorization, ...base.blockers];
  if (readiness.BILLING_SAFE === "UNKNOWN") blockers.push("UNKNOWN_BILLING_EXPOSURE_BLOCKS_STARTUP");
  return Object.freeze({ reportOnly: true, status: "BLOCKED" as const, readiness: Object.freeze(readiness), OWNER_AUTHORIZED: ownerAuthorization, REAL_SANDBOX_OAUTH_READY: "NO" as const, startupPermitted: false, executionAuthorized: false, evidenceAssurance: "DECLARED_ONLY", blockers: Object.freeze(blockers), networkOperations: 0, billingOperations: 0, deploymentOperations: 0 });
 } catch { throw new Error("FINAL_PREFLIGHT_INPUT_REJECTED"); }
}
/** Explicit fail-closed seam only. Not installed in Next, no SDK loader or side effect. */
export function assertSandboxStartupPreconditions(input: unknown): never {
 evaluateFinalSandboxPreflight(input);
 throw new Error("SANDBOX_STARTUP_BLOCKED");
}
