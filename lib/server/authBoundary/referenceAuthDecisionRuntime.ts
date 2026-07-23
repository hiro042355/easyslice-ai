import type {
  AuthDecisionInput,
  AuthDecisionResult,
  AuthenticatedRequestContext,
  AuthenticationAudit,
  AuthenticationAuditEntry,
  AuthenticationDecision,
  AuthenticationInput,
  AuthenticationIssueCode,
  AuthenticationSubject,
  AuthenticationValidation,
  AuthorizationAudit,
  AuthorizationAuditEntry,
  AuthorizationDecision,
  AuthorizationInput,
} from "./types";

export type AuthenticationExecutionCapability = Readonly<{
  authenticate(input: AuthenticationInput): AuthenticationDecision | Promise<AuthenticationDecision>;
}>;

export type AuthorizationExecutionCapability = Readonly<{
  authorize(input: AuthorizationInput): AuthorizationDecision | Promise<AuthorizationDecision>;
}>;

export type ReferenceAuthDecisionDependencies = Readonly<{
  authentication: AuthenticationExecutionCapability;
  authorization: AuthorizationExecutionCapability;
}>;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const copySubject = (subject: AuthenticationSubject): AuthenticationSubject => ({ ...subject });

const authenticationAudit = (
  entries: readonly Omit<AuthenticationAuditEntry, "entryVersion" | "sequence">[],
): AuthenticationAudit => deepFreeze({
  auditVersion: "1.0",
  entries: entries.map((entry, sequence) => ({ entryVersion: "1.0", sequence, ...entry })),
  reasonCodes: entries.map((entry) => entry.reasonCode),
});

const authorizationAudit = (
  entries: readonly Omit<AuthorizationAuditEntry, "entryVersion" | "sequence">[],
): AuthorizationAudit => deepFreeze({
  auditVersion: "1.0",
  entries: entries.map((entry, sequence) => ({ entryVersion: "1.0", sequence, ...entry })),
  reasonCodes: entries.map((entry) => entry.reasonCode),
});

export const validateAuthenticationInput = (input: AuthenticationInput): AuthenticationValidation => {
  const issues: AuthenticationIssueCode[] = [];
  if (input.inputVersion !== "1.0" || input.requestIdentity.length === 0) issues.push("request-identity-missing");
  if (!Array.isArray(input.credentials) || input.credentials.length === 0) issues.push("credential-projection-missing");
  const references = new Set<string>();
  for (const credential of input.credentials ?? []) {
    if (!["session-reference", "bearer-reference", "service-reference"].includes(credential.credentialKind)) issues.push("credential-kind-unsupported");
    if (!["cookie-boundary", "authorization-boundary", "internal-service"].includes(credential.sourceClassification)) issues.push("source-classification-invalid");
    if (credential.presence === "present") {
      if (!credential.opaqueCredentialReference || credential.opaqueCredentialReference.length === 0) issues.push("credential-reference-invalid");
      else if (references.has(credential.opaqueCredentialReference)) issues.push("credential-reference-duplicate");
      else references.add(credential.opaqueCredentialReference);
    }
    if (credential.tenantReference !== undefined && credential.tenantReference.length === 0) issues.push("tenant-reference-invalid");
  }
  if (input.expectedTenantReference !== undefined && input.expectedTenantReference.length === 0) issues.push("tenant-reference-invalid");
  return deepFreeze(issues.length === 0 ? { status: "valid" } : {
    status: "invalid",
    issues: issues.map((issueCode, sequence) => ({ issueCode, sequence })),
  });
};

const validSubject = (subject: AuthenticationSubject): boolean =>
  subject.subjectVersion === "1.0" && subject.subjectReference.length > 0 && subject.tenantReference.length > 0;

const validAuthorization = (input: AuthorizationInput): boolean =>
  input.inputVersion === "1.0" && input.requestIdentity.length > 0 && validSubject(input.subject) &&
  ["multi-cut:create", "generation-job:create", "workflow:execute"].includes(input.action) &&
  input.resource.resourceVersion === "1.0" && input.resource.resourceReference.length > 0 &&
  input.resource.tenantReference.length > 0 && input.policyContext.contextVersion === "1.0" &&
  input.policyContext.requestedTenantReference.length > 0 &&
  input.subject.tenantReference === input.resource.tenantReference &&
  input.subject.tenantReference === input.policyContext.requestedTenantReference;

export class ReferenceAuthDecisionRuntime {
  readonly #authentication: AuthenticationExecutionCapability;
  readonly #authorization: AuthorizationExecutionCapability;

  constructor(dependencies: ReferenceAuthDecisionDependencies) {
    this.#authentication = dependencies.authentication;
    this.#authorization = dependencies.authorization;
  }

  async authenticate(input: AuthenticationInput): Promise<AuthenticationDecision> {
    const validation = validateAuthenticationInput(input);
    if (validation.status === "invalid") return deepFreeze({
      decisionVersion: "1.0", status: "rejected", reasonCode: "authentication-invalid",
      audit: authenticationAudit([{ stage: "validation", classification: "invalid", reasonCode: "authentication-invalid" }]),
    });
    let decision: AuthenticationDecision;
    try {
      decision = await this.#authentication.authenticate(deepFreeze({
        ...input,
        credentials: input.credentials.map((credential) => ({ ...credential })),
      }));
    } catch {
      return deepFreeze({
        decisionVersion: "1.0", status: "unavailable", reasonCode: "authentication-unavailable",
        audit: authenticationAudit([{ stage: "authentication", classification: "unavailable", reasonCode: "authentication-unavailable" }]),
      });
    }
    if (decision.status === "authenticated" && validSubject(decision.subject)) return deepFreeze({
      decisionVersion: "1.0", status: "authenticated", subject: copySubject(decision.subject), reasonCode: "credential-accepted",
      audit: authenticationAudit([{ stage: "authentication", classification: "authenticated", reasonCode: "credential-accepted" }]),
    });
    if (decision.status === "anonymous") return deepFreeze({
      decisionVersion: "1.0", status: "anonymous", reasonCode: "credential-absent",
      audit: authenticationAudit([{ stage: "authentication", classification: "anonymous", reasonCode: "credential-absent" }]),
    });
    if (decision.status === "rejected") return deepFreeze({
      decisionVersion: "1.0", status: "rejected", reasonCode: "credential-rejected",
      audit: authenticationAudit([{ stage: "authentication", classification: "rejected", reasonCode: "credential-rejected" }]),
    });
    return deepFreeze({
      decisionVersion: "1.0", status: "unavailable", reasonCode: "authentication-unavailable",
      audit: authenticationAudit([{ stage: "authentication", classification: "unavailable", reasonCode: "authentication-unavailable" }]),
    });
  }

  async authorize(input: AuthorizationInput): Promise<AuthorizationDecision> {
    if (!validAuthorization(input)) return deepFreeze({
      decisionVersion: "1.0", status: "denied", reasonCode: "authorization-invalid",
      audit: authorizationAudit([{ stage: "validation", classification: "invalid", reasonCode: "authorization-invalid" }]),
    });
    let decision: AuthorizationDecision;
    try {
      decision = await this.#authorization.authorize(deepFreeze({
        ...input, subject: copySubject(input.subject), resource: { ...input.resource }, policyContext: { ...input.policyContext },
      }));
    } catch {
      return deepFreeze({
        decisionVersion: "1.0", status: "unavailable", reasonCode: "authorization-unavailable",
        audit: authorizationAudit([{ stage: "authorization", classification: "unavailable", reasonCode: "authorization-unavailable" }]),
      });
    }
    if (decision.status === "allowed") return deepFreeze({
      decisionVersion: "1.0", status: "allowed", reasonCode: "policy-allowed",
      audit: authorizationAudit([{ stage: "authorization", classification: "allowed", reasonCode: "policy-allowed" }]),
    });
    if (decision.status === "denied") return deepFreeze({
      decisionVersion: "1.0", status: "denied", reasonCode: "policy-denied",
      audit: authorizationAudit([{ stage: "authorization", classification: "denied", reasonCode: "policy-denied" }]),
    });
    return deepFreeze({
      decisionVersion: "1.0", status: "unavailable", reasonCode: "authorization-unavailable",
      audit: authorizationAudit([{ stage: "authorization", classification: "unavailable", reasonCode: "authorization-unavailable" }]),
    });
  }

  async decide(input: AuthDecisionInput): Promise<AuthDecisionResult> {
    const authentication = await this.authenticate(input.authentication);
    if (authentication.status === "anonymous" || authentication.status === "rejected") return deepFreeze({
      resultVersion: "1.0", status: authentication.status === "anonymous" ? "unauthenticated" : authentication.reasonCode === "authentication-invalid" ? "invalid" : "unauthenticated",
      reasonCode: authentication.reasonCode,
      authenticationAudit: authentication.audit,
    } as AuthDecisionResult);
    if (authentication.status === "unavailable") return deepFreeze({
      resultVersion: "1.0", status: "unavailable", reasonCode: "authentication-unavailable", authenticationAudit: authentication.audit,
    });
    const authorizationInput: AuthorizationInput = {
      inputVersion: "1.0", requestIdentity: input.authentication.requestIdentity,
      subject: copySubject(authentication.subject), action: input.authorization.action,
      resource: { ...input.authorization.resource }, policyContext: { ...input.authorization.policyContext },
    };
    const authorization = await this.authorize(authorizationInput);
    if (authorization.status === "denied") return deepFreeze({
      resultVersion: "1.0",
      status: authorization.reasonCode === "authorization-invalid" ? "invalid" : "forbidden",
      reasonCode: authorization.reasonCode,
      authenticationAudit: authentication.audit, authorizationAudit: authorization.audit,
    } as AuthDecisionResult);
    if (authorization.status === "unavailable") return deepFreeze({
      resultVersion: "1.0", status: "unavailable", reasonCode: "authorization-unavailable",
      authenticationAudit: authentication.audit, authorizationAudit: authorization.audit,
    });
    const context: AuthenticatedRequestContext = {
      contextVersion: "1.0", requestIdentity: input.authentication.requestIdentity,
      subject: copySubject(authentication.subject), tenantReference: authentication.subject.tenantReference,
      action: input.authorization.action, resource: { ...input.authorization.resource },
    };
    return deepFreeze({
      resultVersion: "1.0", status: "allowed", context,
      authenticationAudit: authentication.audit, authorizationAudit: authorization.audit,
    });
  }
}
