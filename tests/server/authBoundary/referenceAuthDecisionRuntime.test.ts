import assert from "node:assert/strict";
import test from "node:test";
import { ReferenceAuthDecisionRuntime } from "../../../lib/server/authBoundary/referenceAuthDecisionRuntime";
import type {
  AuthDecisionInput,
  AuthenticationAudit,
  AuthenticationDecision,
  AuthenticationInput,
  AuthenticationSubject,
  AuthorizationAudit,
  AuthorizationDecision,
  AuthorizationInput,
} from "../../../lib/server/authBoundary/types";

const authAudit: AuthenticationAudit = { auditVersion: "1.0", entries: [], reasonCodes: [] };
const authorizationAudit: AuthorizationAudit = { auditVersion: "1.0", entries: [], reasonCodes: [] };
const subject: AuthenticationSubject = {
  subjectVersion: "1.0", subjectReference: "subject-1", subjectClassification: "user",
  tenantReference: "tenant-1", authenticationStrength: "multi-factor",
};
const authenticationInput = (): AuthenticationInput => ({
  inputVersion: "1.0", requestIdentity: "request-1", expectedTenantReference: "tenant-1",
  credentials: [{
    projectionVersion: "1.0", credentialKind: "session-reference", presence: "present",
    opaqueCredentialReference: "credential-ref-1", sourceClassification: "cookie-boundary",
    issuerClassification: "first-party", sessionReference: "session-ref-1", tenantReference: "tenant-1",
  }],
});
const combinedInput = (): AuthDecisionInput => ({
  decisionVersion: "1.0", authentication: authenticationInput(),
  authorization: {
    action: "multi-cut:create",
    resource: { resourceVersion: "1.0", resourceKind: "route", resourceReference: "multi-cut", tenantReference: "tenant-1" },
    policyContext: { contextVersion: "1.0", policyClassification: "interactive-user", requestedTenantReference: "tenant-1", workspaceReference: "workspace-1" },
  },
});
const authenticated = (): AuthenticationDecision => ({ decisionVersion: "1.0", status: "authenticated", subject, reasonCode: "credential-accepted", audit: authAudit });
const allowed = (): AuthorizationDecision => ({ decisionVersion: "1.0", status: "allowed", reasonCode: "policy-allowed", audit: authorizationAudit });
const runtime = (
  authenticate: (input: AuthenticationInput) => AuthenticationDecision | Promise<AuthenticationDecision> = authenticated,
  authorize: (input: AuthorizationInput) => AuthorizationDecision | Promise<AuthorizationDecision> = allowed,
) => new ReferenceAuthDecisionRuntime({ authentication: { authenticate }, authorization: { authorize } });

test("authentication projects authenticated, anonymous, rejected, and unavailable decisions", async () => {
  const cases: AuthenticationDecision[] = [
    authenticated(),
    { decisionVersion: "1.0", status: "anonymous", reasonCode: "credential-absent", audit: authAudit },
    { decisionVersion: "1.0", status: "rejected", reasonCode: "credential-rejected", audit: authAudit },
    { decisionVersion: "1.0", status: "unavailable", reasonCode: "authentication-unavailable", audit: authAudit },
  ];
  for (const decision of cases) assert.equal((await runtime(() => decision).authenticate(authenticationInput())).status, decision.status);
});

test("authentication validation rejects malformed and unsupported projections without invocation", async () => {
  let calls = 0;
  const target = runtime(() => { calls += 1; return authenticated(); });
  const invalid = [
    { ...authenticationInput(), requestIdentity: "" },
    { ...authenticationInput(), credentials: [] },
    { ...authenticationInput(), credentials: [{ ...authenticationInput().credentials[0]!, credentialKind: "unsupported" }] },
    { ...authenticationInput(), credentials: [{ ...authenticationInput().credentials[0]!, opaqueCredentialReference: "" }] },
    { ...authenticationInput(), credentials: [authenticationInput().credentials[0]!, authenticationInput().credentials[0]!] },
    { ...authenticationInput(), expectedTenantReference: "" },
    { ...authenticationInput(), credentials: [{ ...authenticationInput().credentials[0]!, sourceClassification: "malformed" }] },
  ];
  for (const input of invalid) assert.equal((await target.authenticate(input as AuthenticationInput)).status, "rejected");
  assert.equal(calls, 0);
});

test("authentication dependency throw is safe and invocation is exactly once", async () => {
  let calls = 0;
  const secret = "raw-token-and-stack";
  const actual = await runtime(() => { calls += 1; throw new Error(secret); }).authenticate(authenticationInput());
  assert.equal(calls, 1);
  assert.equal(actual.status, "unavailable");
  assert.equal(JSON.stringify(actual).includes(secret), false);
});

test("authorization projects allowed, denied, unavailable and validates subject, action, resource, and tenant", async () => {
  let calls = 0;
  const base: AuthorizationInput = {
    inputVersion: "1.0", requestIdentity: "request-1", subject, action: "multi-cut:create",
    resource: { resourceVersion: "1.0", resourceKind: "route", resourceReference: "multi-cut", tenantReference: "tenant-1" },
    policyContext: { contextVersion: "1.0", policyClassification: "interactive-user", requestedTenantReference: "tenant-1" },
  };
  const target = runtime(authenticated, () => { calls += 1; return allowed(); });
  assert.equal((await target.authorize(base)).status, "allowed");
  assert.equal(calls, 1);
  for (const input of [
    { ...base, subject: { ...subject, subjectReference: "" } },
    { ...base, action: "unsupported" },
    { ...base, resource: { ...base.resource, resourceReference: "" } },
    { ...base, resource: { ...base.resource, tenantReference: "tenant-2" } },
    { ...base, policyContext: { ...base.policyContext, requestedTenantReference: "tenant-2" } },
  ]) assert.equal((await target.authorize(input as AuthorizationInput)).reasonCode, "authorization-invalid");
  assert.equal(calls, 1);
  assert.equal((await runtime(authenticated, () => ({ decisionVersion: "1.0", status: "denied", reasonCode: "policy-denied", audit: authorizationAudit })).authorize(base)).status, "denied");
  assert.equal((await runtime(authenticated, () => ({ decisionVersion: "1.0", status: "unavailable", reasonCode: "authorization-unavailable", audit: authorizationAudit })).authorize(base)).status, "unavailable");
});

test("authorization dependency throw is safe and policy internals are not exposed", async () => {
  const secret = "internal-policy-document";
  const input = combinedInput();
  const target = runtime(authenticated, () => { throw new Error(secret); });
  const actual = await target.decide(input);
  assert.equal(actual.status, "unavailable");
  assert.equal(JSON.stringify(actual).includes(secret), false);
});

test("combined decisions short-circuit authentication failures and invoke authorization at most once", async () => {
  for (const [authentication, expected] of [
    [{ decisionVersion: "1.0", status: "anonymous", reasonCode: "credential-absent", audit: authAudit }, "unauthenticated"],
    [{ decisionVersion: "1.0", status: "rejected", reasonCode: "credential-rejected", audit: authAudit }, "unauthenticated"],
    [{ decisionVersion: "1.0", status: "unavailable", reasonCode: "authentication-unavailable", audit: authAudit }, "unavailable"],
  ] as const) {
    let authorizationCalls = 0;
    const actual = await runtime(() => authentication, () => { authorizationCalls += 1; return allowed(); }).decide(combinedInput());
    assert.equal(actual.status, expected);
    assert.equal(authorizationCalls, 0);
  }
  for (const [authorization, expected] of [
    [allowed(), "allowed"],
    [{ decisionVersion: "1.0", status: "denied", reasonCode: "policy-denied", audit: authorizationAudit }, "forbidden"],
    [{ decisionVersion: "1.0", status: "unavailable", reasonCode: "authorization-unavailable", audit: authorizationAudit }, "unavailable"],
  ] as const) {
    let calls = 0;
    const actual = await runtime(authenticated, () => { calls += 1; return authorization; }).decide(combinedInput());
    assert.equal(actual.status, expected);
    assert.equal(calls, 1);
  }
});

test("results are deterministic, deeply frozen, and copy isolated", async () => {
  const target = runtime();
  const first = await target.decide(combinedInput());
  const second = await target.decide(combinedInput());
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  if (first.status === "allowed") {
    assert.equal(Object.isFrozen(first.context), true);
    assert.equal(Object.isFrozen(first.context.subject), true);
    assert.notEqual(first.context, second.status === "allowed" ? second.context : undefined);
  }
  for (const forbidden of ["token", "cookie", "password", "secret", "providerSession", "stack"])
    assert.equal(JSON.stringify(first).toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});
