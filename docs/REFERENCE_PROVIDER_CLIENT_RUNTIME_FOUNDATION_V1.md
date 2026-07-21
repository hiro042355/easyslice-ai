# Reference Provider Client Runtime Foundation V1

## 1. Status, version, and purpose

Status: implemented and validation-gated. Version: V1.

This foundation implements the provider-neutral `ProviderClient` contract as a
deterministic Reference simulation. It validates one submit, poll, or cancel
attempt and projects safe fixture outcomes. It is not a production transport.

## 2. Exact boundaries

Production:

- `lib/providerClients/referenceProviderClient.ts`
- `lib/providerClients/providerClientUtils.ts`

Tests:

- `tests/providerClients/providerClientRuntimeBoundary.test.ts`
- `tests/providerClients/referenceProviderClient.test.ts`

The Registry is excluded and remains a future Foundation.

## 3. Contract relationships

The runtime implements `ProviderClient<TBody, TSafeResponse>` from the Provider
Client Contract and consumes materialized request and Reference DTO types from
the Provider Request and Provider Client Type Contracts. It does not change or
take ownership of either contract.

## 4. Reference simulation

Transport scenarios are explicit fixture inputs. No scenario opens a socket,
resolves an endpoint, reads a file, or obtains a credential. Completed,
accepted, pending, failed, rate-limited, timeout, unavailable, cancellation,
and malformed-response behavior is simulated through fixed mappings.

## 5. Submit semantics

Submit validates contract and request versions, provider/API/operation,
materialization proof, body kind/count/format, timeout, correlation,
idempotency, cancellation, credential-handle state, and asset lifetime before
projecting an outcome. Response DTOs are schema-checked and deep-copied.

## 6. Poll and cancel semantics

Poll validates the restricted job reference and safety contexts, bounds
progress, validates completed responses, and returns normalized failures.
Cancel distinguishes cancelled, already completed, unsupported, and failed
outcomes without performing a remote cancellation.

## 7. Credential semantics

Only opaque credential handles and injected fixture availability states are
used. The runtime never owns or resolves an API key, token, authorization
header, or other credential value. Handles and states are not projected into
results or metadata.

## 8. Deterministic time and identifiers

Asset lifetime uses injected `referenceNowEpochSeconds`. Gregorian conversion
does not call a clock. Job references are fixed restricted opaque identifiers;
they contain no URL, path, credential, endpoint, or random value.

## 9. Idempotency and state

Each client instance owns an in-memory idempotency Map. Completed and accepted
results are stored as frozen copies. Replays return fresh copies; a different
safe fingerprint returns a normalized conflict. Instances do not share state.
The Map is non-persistent and does not claim durable idempotency.

## 10. Retry, timeout, and orchestration non-ownership

The runtime returns retry advice but owns no retry loop. It validates timeout
policy but owns no timer, abort, or timeout enforcement. It performs one poll
attempt but owns no polling loop, queue, worker, or Workflow orchestration.

## 11. Safe projections

Transport metadata is restricted to coarse classes, attempt, acceptance,
timeout, and bounded rate-limit data. Errors contain fixed categories,
retryability, and allowlisted safe codes. Raw errors, messages, stacks,
requests, responses, headers, endpoints, job URLs, and credential handles are
never projected. Safe response metadata contains only its defined DTO fields.

## 12. Mutation isolation and Utils ownership

Inputs and injected config are copied. Exported policy/config/capability values
and cached results are frozen. Returned results are independent copies.

`providerClientUtils.ts` owns Reference-runtime validation, copy/freeze,
progress/retry normalization, scenario-to-error mapping, and deterministic ISO
conversion. `deepCopy` is intentionally limited to JSON-compatible values; it
must not receive cyclic values, BigInt, functions, or non-JSON objects.

## 13. Security and platform policy

The runtime uses browser-safe language primitives and has no Node built-in,
network, HTTP, filesystem, environment, logging, clock, random, crypto-random,
timer, persistence, or import-time registration dependency. It stores no
actual secret and exposes no unrestricted provider identifier.

## 14. Non-ownership

This foundation does not own Registry behavior, provider selection, Adapter or
Materializer behavior, Upload, Output Ingestion, actual credentials, actual
transport, persistence, Workflow, Webhook, retry workers, or deployment.

## 15. Versioning and validation

Public contract, request schema, reason-code, and safe result changes require a
versioned contract decision. Validation requires the two exact tests, the
Provider Client Contract boundary regression, scoped TypeScript compilation,
and an exact-file snapshot dependency audit.

## 16. Exact commit candidate and future work

The exact candidate consists of the two production and two test files listed
above plus this document. A future Provider Client Registry Foundation may
publish static descriptors. A future actual Provider Transport Foundation may
add endpoint, credential resolver, HTTP, timeout enforcement, and restricted
diagnostics under a separate production contract.
