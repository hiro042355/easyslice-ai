# Provider Client Types Contract Foundation V1

## 1. Status, version, and purpose

Status: implemented and validation-gated. Version: V1.

This foundation separates provider-neutral Provider Client contracts from
Reference implementation support types without adding a runtime client.

## 2. Production boundary

The exact production boundary is:

- `lib/providerClients/types.ts`
- `lib/providerClients/referenceTypes.ts`

Both files are type-only modules. They contain no executable values, module
initialization, transport, registry, persistence, or environment access.

## 3. Provider-neutral ownership

`types.ts` owns credential handles and availability states, correlation,
idempotency and cancellation contexts, timeout policy, submit/poll/cancel
inputs and results, retry advice, normalized client errors, safe transport
metadata, sensitive job references, attempt results, the generic
`ProviderClient<TBody, TSafeResponse>` contract, descriptors, and client
availability.

Credential handles contain opaque references and version metadata. This layer
never owns, resolves, logs, or transports actual credential values.

## 4. Reference ownership

`referenceTypes.ts` owns only Reference fixture and implementation support
shapes: transport scenarios, the Reference request body, safe response DTO,
and Reference client configuration. These types are not provider-neutral
capabilities and do not imply a production transport.

## 5. Separation rationale and compatibility

Reference scenarios and fixtures must not define the neutral client contract.
The source of truth for Reference types is therefore `referenceTypes.ts`.
`types.ts` preserves existing imports through an `export type` compatibility
re-export. There are no duplicate named definitions or runtime re-exports.

## 6. Dependency direction

Both modules type-import the Provider Request Contract where required.
`types.ts` type-re-exports `referenceTypes.ts`; `referenceTypes.ts` does not
depend back on `types.ts`. This one-way graph prevents a circular dependency.

The Provider Request Contract owns operation and materialized request shapes.
The Provider Client Contract consumes those shapes without taking ownership.

## 7. Submit, poll, and cancel contract

Submit binds a materialized request to an opaque credential handle, timeout,
correlation, and optional idempotency/cancellation contexts. Poll and cancel
operate on a restricted job reference with the same safety contexts. Results
distinguish completed, accepted, pending, cancelled, and safely normalized
failure outcomes.

## 8. Retry and transport metadata

Retry advice records retryability, a bounded optional delay, and a stable
reason. Safe transport metadata exposes only coarse HTTP, latency, timeout,
attempt, acceptance, and rate-limit classifications. It does not expose raw
headers, endpoints, response bodies, or authorization material.

## 9. Error, descriptor, and availability contracts

Normalized errors contain a stable category, retry projection, bounded delay,
and optional safe code. Descriptors identify a client and its capability using
an endpoint configuration reference rather than an endpoint or credential.
Availability is explicitly `available` or `disabled`.

## 10. Security and browser-safe boundary

The contracts contain no credential value, API key, token, authorization
header, HTTP execution, filesystem access, logging, clock, randomness, timer,
mutable state, or persistence. Type erasure makes the modules browser-safe and
side-effect free.

## 11. Runtime non-ownership

This foundation does not own Provider Client execution, HTTP, retries,
credential resolution, Registry behavior, Workflow orchestration, Upload,
Materializer behavior, Adapter behavior, queues, or persistence. Existing
Reference runtime files remain outside this change.

## 12. Versioning and validation

Breaking changes to neutral client signatures or safe result projections
require a new contract version. Reference-only additions remain in
`referenceTypes.ts` and must not leak into neutral ownership.

Validation consists of:

- `tests/providerClientContracts/providerClientContractBoundary.test.ts`
- scoped TypeScript compilation excluding only the separately owned Duration
  test; and
- an exact-file snapshot dependency audit.

## 13. Exact commit candidate and future work

The exact candidate is:

- `lib/providerClients/types.ts`
- `lib/providerClients/referenceTypes.ts`
- `tests/providerClientContracts/providerClientContractBoundary.test.ts`
- `docs/PROVIDER_CLIENT_TYPES_CONTRACT_FOUNDATION_V1.md`

A future Runtime Foundation may consume these types to implement transport,
credential resolution, retry execution, and registry integration. None of
those capabilities is implemented by this contract foundation.
