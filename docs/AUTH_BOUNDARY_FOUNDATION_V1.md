# Authentication and Authorization Boundary Foundation V1

## Purpose

This foundation separates authentication (who the caller may be) from authorization (whether that subject may perform an action on a resource). Lower HTTP, Generation Job, Workflow, Provider, and persistence layers receive only safe projected identity and never inspect credentials.

## Contract boundary

The type-only contract defines opaque credential projections, authentication inputs and decisions, safe subjects, authorization actions/resources/policy context and decisions, audits, an authenticated request context, and the combined result. It contains no executable value or provider-specific type.

## Credential projection

Credentials are extracted and protected by an outer transport/session boundary. This contract accepts only kind, presence, opaque reference, source and issuer classifications, and optional opaque session/tenant references. Raw Authorization or Cookie headers, JWTs, access/refresh tokens, passwords, secrets, signed-cookie values, and provider session objects are forbidden.

## Authentication runtime

The Reference runtime validates input and credential projections, invokes one explicitly injected authentication capability at most once, normalizes authenticated/anonymous/rejected/unavailable decisions, emits safe audits, catches dependency errors, and returns immutable deterministic snapshots. It performs no cryptographic or remote verification itself.

## Authorization runtime

Authorization requires a validated authenticated subject and matching subject/resource/policy tenant references. One explicitly injected authorization capability is invoked at most once. Allowed, denied, unavailable, and invalid outcomes are normalized without policy internals.

## Combined decision

Authentication failure short-circuits authorization. Only authenticated subjects reach authorization. An allowed result contains `AuthenticatedRequestContext`; all other results contain safe classifications and audits only.

## Audit and security

Audits contain ordered stages, classifications, and reason codes. They contain no subject, tenant, credential reference, provider response, policy document, exception, stack, database identity, or filesystem path.

## Determinism and immutability

No clock, random source, UUID generator, timer, environment, singleton, or ambient state is used. Inputs and dependency decisions are copied; returned snapshots are deeply frozen.

## HTTP projection recommendation

Composition should handle auth before the HTTP Adapter: unauthenticated → rejected/401, forbidden → rejected/403, unavailable → unavailable/503, invalid → rejected/400. Only an allowed safe identity proceeds to the HTTP Adapter. The existing HTTP Adapter contract remains unchanged.

## Versioning

All V1 boundary records use explicit `1.0` versions. Provider-specific verification and route composition require separate foundations.
