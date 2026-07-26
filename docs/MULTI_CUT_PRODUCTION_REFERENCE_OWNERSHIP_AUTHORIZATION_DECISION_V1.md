# Multi-Cut Production Reference Ownership and Authorization Decision V1

## 1. Context

Production Input Materialization accepts a `SourceArtifactReference`, validates request and ownership projections, and then asks `SourceArtifactLocatorCapability` to resolve the opaque reference. Existing Production Locator Policy, Reference Authority, and Reference Identity and Scope ADRs establish the boundary but intentionally leave ownership, authorization, and access-control authority undecided.

This ADR records Repository evidence and the remaining Architecture Decisions. It does not select an authentication mechanism, authorization model, registry implementation, persistence technology, or physical location policy.

## 2. Existing Contracts

Relevant Repository contracts include:

- Input Materialization request, context, ownership projection, and Source Locator capability;
- Temporary Workspace ownership projection and lifecycle contracts;
- Provider Upload and Pending Upload identities and lifecycle states;
- Accepted Persistence context and authorization contracts;
- Workflow Entry authorization and ownership projections;
- Workflow API principal, permissions, ownership, and reference-vault contracts;
- Media Execution Composition and Runtime Binding capability boundaries.

These contracts are domain-specific. No committed contract designates any Upload, Persistence, Workflow, Workspace, Route, Composition, or Locator component as the authoritative owner or authorization evaluator for `SourceArtifactReference`.

## 3. Existing Ownership Evidence

Repository evidence establishes:

- Input Materialization carries authenticated, request, source, and workspace tenant references.
- It also carries authenticated, source, workspace, and operation ownership references.
- The reference adapter requires these projected values to agree before Source resolution.
- Workspace contracts separately require authenticated and workspace tenant ownership agreement.
- Upload, Pending Upload, Accepted Persistence, Workflow Entry, and Workflow API maintain their own ownership or tenant context.
- `ReferenceWorkflowApiReferenceVault` associates Workflow API references with Workflow-specific ownership and revocation state.
- Request, operation, workspace, upload, persistence, workflow, and Source identities remain distinct.

This is evidence of ownership consistency at individual boundaries. It is not evidence that one of those domains owns the Production Source reference.

## 4. Existing Authorization Evidence

Repository evidence also establishes:

- Workflow API principals contain actor, subject, tenant, region, and permission projections.
- Workflow Entry and Accepted Persistence accept explicit authorization decisions or classifications.
- Pending Upload supports expired, revoked, deleted, authorization, and policy-blocked outcomes.
- Input Materialization validates ownership projections before Locator invocation.
- `SourceArtifactLocatorCapability` receives only an opaque reference.
- The Locator contract carries no principal, subject, tenant, permission, workflow, operation, request, workspace, prior authorization decision, or delegation evidence.
- Possession of an opaque Source reference is not documented as authorization.
- Locator failures are normalized and physical locations remain private.

No committed contract proves which component authorizes Source access or whether authorization must be re-evaluated during resolution.

## 5. Decidable Facts

The following are decidable from the Repository:

1. Source access occurs behind Input Materialization and Source Locator boundaries.
2. Input Materialization performs request-level ownership-consistency validation before resolution.
3. Source Locator does not receive explicit authorization context.
4. Source Locator cannot independently evaluate tenant, subject, workflow, operation, request, or workspace permissions from its current input.
5. Authentication and authorization are separate concerns in adjacent contracts.
6. Domain-specific Workflow and Persistence authorization types do not automatically authorize Source Materialization.
7. Workspace ownership does not imply Source ownership.
8. Route, Media Execution Composition, and Runtime Binding do not own Source authorization.
9. Raw locations, credentials, tokens, internal ownership records, and exceptions must not enter public decisions or audit.
10. Opaque-reference possession alone is not an established grant of access.
11. Cross-user and cross-workflow access cannot be approved solely from identifier syntax.
12. Current ownership projection validation is not an authoritative revocation check.

## 6. Inferred Facts

The following are plausible but undocumented:

- Source authorization likely needs to agree with the tenant and ownership projections already validated by Input Materialization.
- A durable Source authority may be better positioned than a request-local component to evaluate revocation and replacement.
- Upload or Accepted Persistence may provide upstream ownership evidence for Sources originating from uploads.
- Workflow context may constrain intended use of a Source without necessarily owning the Source.
- Durable and cross-process resolution likely requires authorization evidence that is not stored only in request memory.

These statements are inference, not adopted design. Their status is `UNRESOLVED`.

## 7. Undecidable Decisions

The Repository alone cannot decide:

- authoritative Source owner: `UNRESOLVED`;
- authorization owner: `UNRESOLVED`;
- access-control owner: `UNRESOLVED`;
- permission evaluator: `UNRESOLVED`;
- authentication dependency at Source resolution: `UNRESOLVED`;
- tenant or user ownership model: `UNRESOLVED`;
- request, workflow, operation, or workspace delegation: `UNRESOLVED`;
- authorization lifetime and re-evaluation points: `UNRESOLVED`;
- revocation authority and propagation: `UNRESOLVED`;
- cross-user access policy: `UNRESOLVED`;
- cross-workflow access policy: `UNRESOLVED`;
- privilege-escalation prevention policy: `UNRESOLVED`;
- audit owner and authoritative audit evidence: `UNRESOLVED`;
- whether wrong-owner and missing references are intentionally indistinguishable: `UNRESOLVED`;
- whether Locator input requires a versioned authorization context: `UNRESOLVED`.

## 8. Candidate Ownership Models

No candidate is adopted without additional evidence.

| Candidate | Ownership meaning | Dependency | Security | Durability | Auditability | Testability | Migration | Locator compatibility |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Upload-owned authorization | Upload domain owns Sources originating from upload records | Locator or authority depends on Upload ownership state | Strong at ingestion, incomplete for non-upload Sources | Depends on Upload retention | Upload lifecycle can provide evidence | Good for upload-derived fixtures | Couples all Sources to Upload unless generalized | Requires Upload-to-Source mapping absent today |
| B. Persistence-owned authorization | Accepted or durable asset authority owns Source records | Locator delegates to persistence authority | Can centralize owner, lifecycle, and revocation | Potentially durable and cross-process | Durable state can support authoritative audit | Authority and Locator can be isolated | Requires formal Source-to-persisted-asset mapping | Compatible only through a defined authority capability |
| C. Workflow-owned authorization | Workflow owns access to Sources bound to it | Locator or caller needs Workflow context | Limits use to Workflow scope but may conflate use with ownership | Depends on Workflow persistence | Workflow execution supplies contextual audit | Good for workflow-scoped cases | Cross-workflow reuse and independent assets become difficult | Current Locator lacks Workflow context |
| D. Request-scoped authorization | Each authenticated request owns a temporary grant | Materialization relies on prior request authorization | Narrow exposure, weak recovery and replay semantics | Normally request-local | Request audit is available but not durable authority | Easy for single-request tests | Cross-process resume requires new grants | Structurally possible only if authorization is conclusively upstream |
| E. External authorization boundary | A separate authority owns Source access decisions | Locator or Materialization consumes an injected decision capability | Clear separation if context and failure projection are versioned | Depends on external authority | Can centralize decision evidence | Independently testable | Adds a new explicit dependency and migration boundary | Current Locator input is insufficient if it performs evaluation |
| F. Composite ownership model | Durable Source ownership plus request or workflow delegation | Source authority evaluates owner and delegated context | Can support durable ownership and least-privilege use | Potentially durable with scoped grants | Can record both authoritative ownership and use decisions | Most test dimensions but clear seams | Highest contract and migration cost | Requires contextual lookup or a prior authoritative decision |

Repository evidence rules out Route, Composition, Runtime Binding, and Workspace cleanup ownership as Source ownership models. It does not select among A through F.

## 9. Candidate Authorization Models

The same ownership candidate may use different authorization placement:

1. Pre-authorized request: an upstream boundary authorizes access and Materialization receives trusted evidence. Evidence format, issuer, lifetime, and replay rules are `UNRESOLVED`.
2. Authority-time authorization: Source authority evaluates principal and scope during lookup. The current Locator contract cannot carry the required context.
3. Scoped capability reference: possession represents delegated access. The Repository does not establish that Source references are capabilities.
4. Split evaluation: upstream authentication and policy evaluation are combined with authority-owned ownership and revocation checks. Contract shape and failure precedence are `UNRESOLVED`.

No model is adopted. Authentication implementation, permission representation, and policy engine selection remain outside this ADR.

## 10. Ownership Boundary

The future authoritative owner must, at minimum, define:

- which entity owns a Source;
- how ownership is associated at issuance;
- whether ownership may transfer;
- relationship to upload and persisted-asset records;
- deletion, replacement, and revocation ownership;
- authoritative state used during access evaluation.

Input Materialization continues to own consistency validation of the projections it receives. It must not infer authoritative ownership from paths, reference syntax, workspace membership, or successful resolution.

## 11. Authorization Boundary

The authorization boundary must decide:

- which authenticated actor or service may request Source use;
- which context is evaluated;
- whether authorization occurs before, during, or at both stages of resolution;
- how delegated Workflow or Operation use is represented;
- when authorization is re-evaluated;
- how revoked, stale, wrong-owner, and unavailable states are safely classified.

The current Locator signature cannot perform contextual authorization. Production implementation must not silently treat prior ownership equality or opaque-reference possession as a complete authorization decision.

## 12. Security Boundary

The boundary must prevent:

- cross-tenant and cross-user reference substitution;
- cross-workflow or cross-operation reuse where not explicitly allowed;
- privilege escalation through caller-supplied ownership projections;
- authorization bypass through direct Locator invocation;
- stale or revoked reference reuse;
- disclosure differences that reveal another owner's Source;
- leakage of paths, credentials, tokens, registry records, raw exceptions, or internal policy evidence.

The Repository establishes non-disclosure and capability injection patterns. The exact authentication, authorization, and permission mechanisms remain `UNRESOLVED`.

## 13. Audit Boundary

Safe audit may record stable classifications, stage, correlation identity, decision outcome, and non-sensitive reference projections where separately approved. It must not expose raw Source references when classified sensitive, physical locations, principals' secrets, credentials, tokens, or internal errors.

The authoritative owner of:

- authorization decision audit;
- ownership-change audit;
- delegation audit;
- revocation audit;
- Locator invocation audit;

is `UNRESOLVED`. Duplicate or contradictory audit ownership must be avoided in the follow-up design.

## 14. Required Follow-up Decisions

1. Select the authoritative Source ownership model.
2. Select the authorization evaluation owner.
3. Define the authentication-to-authorization dependency without choosing an authentication implementation.
4. Define tenant, user, service, Workflow, Operation, Request, and Workspace scope relationships.
5. Define delegation and cross-scope reuse.
6. Define revocation, deletion, ownership transfer, and replacement.
7. Define privilege-escalation and confused-deputy protections.
8. Define safe missing, wrong-owner, revoked, stale, and unavailable classifications.
9. Define authorization evidence, lifetime, replay, and re-evaluation boundaries.
10. Define audit ownership and safe audit projections.
11. Decide whether Input Materialization or Locator contracts require a versioned context or result extension.
12. Define migration from Upload and Accepted Persistence ownership evidence to Source authority.

## 15. Recommended Decision Order

1. Select Source identity and authoritative ownership together.
2. Define uniqueness and ownership scope.
3. Define authentication inputs and the authorization evaluation owner.
4. Define delegation across Workflow, Operation, Request, and Workspace boundaries.
5. Define lifecycle, transfer, replacement, revocation, and deletion.
6. Define safe authorization outcomes and non-disclosing failures.
7. Define audit ownership and evidence.
8. Re-evaluate Locator and Materialization contract sufficiency.
9. Decide persistence and migration boundaries.
10. Only then design and implement Production Locator resolution.

## 16. Implementation Blocking Status

Production Locator Readiness Review:

| ADR area | Evidence complete | Decision complete | Readiness |
| --- | --- | --- | --- |
| Production Locator Policy | Boundary and undecidable policy inventory documented | Physical and authority policies intentionally unresolved | PARTIAL |
| Reference Authority | Candidate authorities and dependency constraints documented | Issuer and authoritative owner unresolved | PARTIAL |
| Reference Identity and Scope | Candidate identities and scopes documented | Semantic identity and uniqueness scope unresolved | PARTIAL |
| Reference Ownership and Authorization | Evidence and candidate models documented here | Ownership, authorization, delegation, revocation, and audit ownership unresolved | PARTIAL |

Overall Production Locator implementation readiness: **NO**.

The four ADRs are sufficient to explain the boundary and enumerate the required decisions. They are not sufficient to implement a Production Locator without inventing ownership and authorization policy. Implementation remains blocked until the decisions in Section 14 are approved.

This ADR does not decide JWT, cookies, sessions, OAuth, database schema, tenant model, provider implementation, filesystem implementation, token format, permission format, RBAC, ABAC, or ACL.
