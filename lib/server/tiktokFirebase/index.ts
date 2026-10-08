import "server-only";
import { withFirebaseAdminAuth } from "../productionIdentity/firebaseAdmin";
import { CanonicalFirebaseSessionVerifier } from "../localTikTok/security";
/** Inert factory. Existing Next routes do not instantiate or activate this adapter. */
export function createCanonicalTikTokFirebaseVerifier() {
  return new CanonicalFirebaseSessionVerifier({
    verifySessionCookie: (cookie, revoked) => withFirebaseAdminAuth(auth => auth.verifySessionCookie(cookie, revoked)),
    verifyIdToken: (token, revoked) => withFirebaseAdminAuth(auth => auth.verifyIdToken(token, revoked)),
  }, process.env.NEXCUT_BETA_ALLOWED_UIDS ?? "");
}