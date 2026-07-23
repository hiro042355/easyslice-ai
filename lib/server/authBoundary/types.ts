export type AuthenticationIssueCode =
  | "request-identity-missing"
  | "credential-projection-missing"
  | "credential-kind-unsupported"
  | "credential-reference-invalid"
  | "credential-reference-duplicate"
  | "tenant-reference-invalid"
  | "source-classification-invalid";

export type AuthenticationCredentialProjection = Readonly<{
  projectionVersion: "1.0";
  credentialKind: "session-reference" | "bearer-reference" | "service-reference";
  presence: "present" | "absent";
  opaqueCredentialReference?: string;
  sourceClassification: "cookie-boundary" | "authorization-boundary" | "internal-service";
  issuerClassification: "first-party" | "trusted-external" | "unknown";
  sessionReference?: string;
  tenantReference?: string;
}>;

export type AuthenticationInput = Readonly<{
  inputVersion: "1.0";
  requestIdentity: string;
  credentials: readonly AuthenticationCredentialProjection[];
  expectedTenantReference?: string;
}>;

export type AuthenticationSubject = Readonly<{
  subjectVersion: "1.0";
  subjectReference: string;
  subjectClassification: "user" | "service" | "system";
  tenantReference: string;
  authenticationStrength: "single-factor" | "multi-factor" | "service-attested";
}>;

export type AuthenticationValidation =
  | Readonly<{ status: "valid" }>
  | Readonly<{ status: "invalid"; issues: readonly Readonly<{ issueCode: AuthenticationIssueCode; sequence: number }>[] }>;

export type AuthenticationAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: "validation" | "authentication" | "projection";
  classification: string;
  reasonCode: string;
}>;

export type AuthenticationAudit = Readonly<{
  auditVersion: "1.0";
  entries: readonly AuthenticationAuditEntry[];
  reasonCodes: readonly string[];
}>;

export type AuthenticationDecision =
  | Readonly<{ decisionVersion: "1.0"; status: "authenticated"; subject: AuthenticationSubject; reasonCode: "credential-accepted"; audit: AuthenticationAudit }>
  | Readonly<{ decisionVersion: "1.0"; status: "anonymous"; reasonCode: "credential-absent"; audit: AuthenticationAudit }>
  | Readonly<{ decisionVersion: "1.0"; status: "rejected"; reasonCode: "credential-rejected" | "authentication-invalid"; audit: AuthenticationAudit }>
  | Readonly<{ decisionVersion: "1.0"; status: "unavailable"; reasonCode: "authentication-unavailable"; audit: AuthenticationAudit }>;

export type AuthorizationAction = "multi-cut:create" | "generation-job:create" | "workflow:execute";

export type AuthorizationResource = Readonly<{
  resourceVersion: "1.0";
  resourceKind: "route" | "generation-job" | "workflow";
  resourceReference: string;
  tenantReference: string;
}>;

export type AuthorizationPolicyContext = Readonly<{
  contextVersion: "1.0";
  policyClassification: "interactive-user" | "internal-service" | "system";
  requestedTenantReference: string;
  workspaceReference?: string;
}>;

export type AuthorizationInput = Readonly<{
  inputVersion: "1.0";
  requestIdentity: string;
  subject: AuthenticationSubject;
  action: AuthorizationAction;
  resource: AuthorizationResource;
  policyContext: AuthorizationPolicyContext;
}>;

export type AuthorizationReasonCode =
  | "policy-allowed"
  | "policy-denied"
  | "authorization-unavailable"
  | "authorization-invalid";

export type AuthorizationAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: "validation" | "authorization" | "projection";
  classification: string;
  reasonCode: string;
}>;

export type AuthorizationAudit = Readonly<{
  auditVersion: "1.0";
  entries: readonly AuthorizationAuditEntry[];
  reasonCodes: readonly string[];
}>;

export type AuthorizationDecision =
  | Readonly<{ decisionVersion: "1.0"; status: "allowed"; reasonCode: "policy-allowed"; audit: AuthorizationAudit }>
  | Readonly<{ decisionVersion: "1.0"; status: "denied"; reasonCode: "policy-denied" | "authorization-invalid"; audit: AuthorizationAudit }>
  | Readonly<{ decisionVersion: "1.0"; status: "unavailable"; reasonCode: "authorization-unavailable"; audit: AuthorizationAudit }>;

export type AuthenticatedRequestContext = Readonly<{
  contextVersion: "1.0";
  requestIdentity: string;
  subject: AuthenticationSubject;
  tenantReference: string;
  action: AuthorizationAction;
  resource: AuthorizationResource;
}>;

export type AuthDecisionInput = Readonly<{
  decisionVersion: "1.0";
  authentication: AuthenticationInput;
  authorization: Readonly<{
    action: AuthorizationAction;
    resource: AuthorizationResource;
    policyContext: AuthorizationPolicyContext;
  }>;
}>;

export type AuthDecisionResult =
  | Readonly<{ resultVersion: "1.0"; status: "allowed"; context: AuthenticatedRequestContext; authenticationAudit: AuthenticationAudit; authorizationAudit: AuthorizationAudit }>
  | Readonly<{ resultVersion: "1.0"; status: "unauthenticated"; reasonCode: "credential-absent" | "credential-rejected"; authenticationAudit: AuthenticationAudit }>
  | Readonly<{ resultVersion: "1.0"; status: "forbidden"; reasonCode: "policy-denied"; authenticationAudit: AuthenticationAudit; authorizationAudit: AuthorizationAudit }>
  | Readonly<{ resultVersion: "1.0"; status: "unavailable"; reasonCode: "authentication-unavailable" | "authorization-unavailable"; authenticationAudit: AuthenticationAudit; authorizationAudit?: AuthorizationAudit }>
  | Readonly<{ resultVersion: "1.0"; status: "invalid"; reasonCode: "authentication-invalid" | "authorization-invalid"; authenticationAudit: AuthenticationAudit; authorizationAudit?: AuthorizationAudit }>;
