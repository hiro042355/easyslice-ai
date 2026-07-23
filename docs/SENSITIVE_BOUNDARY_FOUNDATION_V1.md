# Sensitive Boundary Foundation V1

## Purpose and ownership

The Sensitive Boundary classifies opaque references and decides whether each reference may be projected into an internal capability input, audit record, diagnostic, cleanup action, or public response. It owns validation, ownership alignment, deterministic policy decisions, redaction classification, safe projections, and immutable audit evidence.

It does not store, encrypt, resolve, decrypt, hash, partially reveal, log, or transport a sensitive value. KMS, vault, environment-variable access, secret SDKs, persistence, HTTP, workflow orchestration, and provider execution remain outside this foundation.

## Dependency direction

`Next Route Adapter -> Auth Boundary -> Upload Boundary -> Sensitive Boundary -> HTTP Adapter / Media Operation Capability`

The contract is type-only. The reference runtime depends only on that contract and one explicitly injected classification capability. Lower foundations must not depend on the Sensitive Boundary.

## Classifications

- `public`: externally publishable.
- `internal`: restricted to internal processing.
- `confidential`: never public and never emitted raw to diagnostics.
- `credential`: tokens, cookies, keys, passwords, and secrets; never public or raw in audit.
- `locator`: paths, buckets, object keys, and signed locations; limited to capability input or cleanup.
- `personal`: subject identity and personal data; public only under the explicit personal-public policy.
- `operational`: internal job, provider-response, or temporary-resource references; never raw in public output.
- `derived-safe`: booleans, reason codes, and other non-reversible safe derivations.

## Usage scopes and policy

Scopes are `internal-execution`, `capability-input`, `audit`, `public-response`, `diagnostic`, and `cleanup`. Credentials and locators are never projected raw to audit or public responses. Confidential diagnostic values are redacted. Operational public values are redacted. Derived-safe values may be projected to audit and public responses. Personal public projection requires `personal-public-explicit`.

Redaction is categorical and non-reversible. It never exposes prefixes, suffixes, fingerprints, basenames, hostnames, email fragments, hashes, or provider-key fragments.

## Reference and ownership

Inputs contain externally generated opaque references, not raw values. Every reference carries tenant, workspace, and ownership references. All three must match the authenticated/requested context. A mismatch is rejected without exposing any identifier and without invoking the dependency capability.

## Decisions and projections

Decisions are `projected`, `redacted`, `rejected`, `invalid`, or `unavailable`. Internal projections may contain the opaque reference only for an approved scope. Audit projections contain sequence, stage, classification, scope, outcome, and safe reason code. Public projections contain only outcome, safe reason, retry, user-action, and generic message classifications.

Invalid structure, duplicates, unsupported classifications/scopes, and malformed metadata are rejected before dependency invocation. Dependency rejection and unavailability are normalized. Exceptions and stacks are discarded.

## Determinism and immutability

The runtime uses no clock, randomness, timer, filesystem, network, environment, singleton, or global mutable state. Results and nested collections are copied and deeply frozen. The injected capability is invoked at most once for each reference that passes local validation, ownership, and policy.

## Security and versioning

Raw credentials, locators, identities, provider responses, database identities, exceptions, stacks, and policy documents are forbidden in public and audit projections. Contract records carry explicit `1.0` versions. New classifications or scopes require an additive contract review; weakening an existing policy requires a new major contract.
