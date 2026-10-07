import { ARTIFACTS, fail, type Review } from "./contracts";
export type LocalMigrateAuthorization = Readonly<{ scope: "LOCAL_REHEARSAL" }>;
type Grant = { review: Review; expiresAt: number; consumed: boolean };
const grants = new WeakMap<object, Grant>();
export function issueLocalRehearsalAuthorization(review: Review, expiresAt: number, now: number): LocalMigrateAuthorization {
  if (review.targetKind !== "LOCAL_REHEARSAL" || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt-now > 30*60*1000 || review.flywayDigest !== ARTIFACTS.flyway.digest || review.proxyDigest !== ARTIFACTS.proxy.digest) fail("AUTHORIZATION_REJECTED");
  const token = Object.freeze({scope: "LOCAL_REHEARSAL" as const});
  grants.set(token, { review: Object.freeze({...review,pending:Object.freeze([...review.pending])}), expiresAt, consumed:false });
  return token;
}
export function consumeLocalAuthorization(token: LocalMigrateAuthorization, expected: Review, now: number): number {
  const grant = grants.get(token);
  if (!grant) fail("AUTHORIZATION_REJECTED");
  if (grant.consumed) fail("AUTHORIZATION_REPLAY");
  if (grant.expiresAt <= now) fail("AUTHORIZATION_EXPIRED");
  if (JSON.stringify(grant.review) !== JSON.stringify(expected)) fail("AUTHORIZATION_REJECTED");
  grant.consumed = true;
  return grant.expiresAt;
}
