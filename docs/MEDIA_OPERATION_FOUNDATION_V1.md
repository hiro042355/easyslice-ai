# Media Operation Capability Foundation V1

## Purpose

The Media Operation Foundation defines and executes one policy-approved media-operation capability call. It validates opaque inputs, ownership evidence, operation policy, dependency output, immutable decisions, and audit-safe evidence.

It does not implement FFmpeg, ffprobe, ZIP generation, filesystem access, temporary directories, cleanup, HTTP, workflow orchestration, provider access, persistence, retry scheduling, or process management.

## Dependency boundary

The intended direction is `Route -> Next Route Adapter -> Auth Boundary -> Upload Boundary -> Sensitive Boundary -> Media Operation Capability -> HTTP Adapter -> Generation Job Entry -> Workflow`.

The Media Operation contract imports only the Sensitive Boundary's safe internal projection type. The runtime imports only its own contract and receives one capability through explicit dependency injection. Lower foundations do not import the Media Operation Foundation.

## Operations

V1 supports `clip-generation`, `clip-export`, `zip-export`, and `preview-generation`. Capability results are `accepted`, `completed`, `failed`, `rejected`, or `unavailable`.

## Contract and validation

Requests carry operation identity and opaque upload/output references. Context carries tenant, workspace, ownership references and approved sensitive projections. Policy declares allowed operations, the upload-reference limit, and whether an output reference is required.

Validation rejects missing request/auth/upload context, missing or unsupported operations, malformed or duplicate opaque references, and malformed policy. Policy violations and failed ownership evidence are rejected before capability invocation.

## Runtime behavior

The capability is invoked at most once and receives a deeply frozen copy. Invalid, policy-rejected, and ownership-rejected input invokes it zero times. Dependency exceptions and malformed dependency results become a fixed `unavailable` decision. The runtime never exposes exception details.

## Audit and security

Audit records contain only sequence, stage, result classification, operation classification, and safe reason code. Commands, arguments, stdout, stderr, paths, temporary resources, provider responses, credentials, and stacks are forbidden.

The runtime uses no clock, randomness, timer, environment, filesystem, network, process API, singleton, or global mutable state. Results and nested collections are copied and deeply frozen.

## Versioning

Contract records use explicit `1.0` versions. New operations and additive safe classifications require contract review. Introducing executable infrastructure or weakening ownership/policy validation requires a separate foundation and version.
