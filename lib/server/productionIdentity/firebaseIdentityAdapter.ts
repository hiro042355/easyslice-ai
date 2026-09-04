import { createHash } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import type {
  AuthenticationDecision,
  AuthenticationInput,
  AuthenticationSubject,
} from "../authBoundary/types";
import type { AuthenticationExecutionCapability } from "../authBoundary/referenceAuthDecisionRuntime";
import type { SessionId, UserId, VerifiedIdentity } from "./types";

export type FirebaseCredentialVerifier = Readonly<{
  verifyIdToken(token: string, checkRevoked?: boolean): Promise<DecodedIdToken>;
  verifySessionCookie(cookie: string, checkRevoked?: boolean): Promise<DecodedIdToken>;
}>;

const audit = (classification: string, reasonCode: string) => Object.freeze({
  auditVersion: "1.0" as const,
  entries: Object.freeze([{ entryVersion: "1.0" as const, sequence: 0, stage: "authentication" as const, classification, reasonCode }]),
  reasonCodes: Object.freeze([reasonCode]),
});

const subject = (uid: string): AuthenticationSubject => Object.freeze({
  subjectVersion: "1.0",
  subjectReference: uid,
  subjectClassification: "user",
  tenantReference: `user:${uid}`,
  authenticationStrength: "single-factor",
});

export class FirebaseAuthenticationAdapter implements AuthenticationExecutionCapability {
  constructor(private readonly verifier: FirebaseCredentialVerifier) {}

  async authenticate(input: AuthenticationInput): Promise<AuthenticationDecision> {
    const credential = input.credentials.find((item) => item.presence === "present");
    if (!credential?.opaqueCredentialReference) return Object.freeze({
      decisionVersion: "1.0", status: "anonymous", reasonCode: "credential-absent", audit: audit("anonymous", "credential-absent"),
    });
    try {
      const decoded = credential.credentialKind === "session-reference"
        ? await this.verifier.verifySessionCookie(credential.opaqueCredentialReference, true)
        : await this.verifier.verifyIdToken(credential.opaqueCredentialReference, true);
      if (!decoded.uid || !decoded.iss || !decoded.aud || !decoded.exp || !decoded.iat) throw new Error("invalid-provider-claims");
      return Object.freeze({
        decisionVersion: "1.0", status: "authenticated", subject: subject(decoded.uid), reasonCode: "credential-accepted",
        audit: audit("authenticated", "credential-accepted"),
      });
    } catch {
      return Object.freeze({
        decisionVersion: "1.0", status: "rejected", reasonCode: "credential-rejected", audit: audit("rejected", "credential-rejected"),
      });
    }
  }
}

const firebaseEpochSecondsToMilliseconds = (value: number): number => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("invalid-identity-timestamp");
  const milliseconds = value * 1_000;
  if (!Number.isSafeInteger(milliseconds)) throw new Error("invalid-identity-timestamp");
  return milliseconds;
};

export const projectVerifiedIdentity = (decoded: DecodedIdToken, credential: string): VerifiedIdentity => {
  const issuedAt = firebaseEpochSecondsToMilliseconds(decoded.iat);
  const expiresAt = firebaseEpochSecondsToMilliseconds(decoded.exp);
  if (expiresAt <= issuedAt) throw new Error("invalid-identity-timestamp");
  return Object.freeze({
    identityVersion: "1.0",
    userId: decoded.uid as UserId,
    providerSubject: decoded.sub,
    sessionId: createHash("sha256").update(credential).digest("hex") as SessionId,
    issuedAt,
    expiresAt,
  });
};
