# Reference Next Route Adapter Foundation V1

## Purpose

The Next Route Adapter is the outermost transport boundary between `NextRequest`/`NextResponse` and the provider-neutral HTTP Adapter contract. It does not register a route.

## Ownership

It owns safe JSON reading, bounded body classification, HTTP method and route projection, allowlisted header extraction, explicit request/correlation identity projection, one injected HTTP Adapter capability invocation, response status preservation, allowlisted response headers, JSON content type, and fixed safe transport failures.

## Non-ownership

It does not own authentication, authorization, uploads, multipart parsing, signed URLs, generation-job construction, workflow or server-composition execution, providers, materializers, queues, workers, polling, retries, persistence, or business rules.

## Dependency injection

The constructor accepts only an HTTP Adapter execution capability. Route classification and request/correlation identities are explicit `handle` context. There is no factory, default dependency, registry, singleton, or hidden fallback.

## Request security boundary

Only content type, request identity, and correlation identity headers are projected. Cookies, authorization, raw URLs, query collections, and arbitrary headers are omitted. JSON bodies are bounded to 65,536 bytes by default. Malformed JSON and projection failures stop before capability invocation.

## Response security boundary

Only the safe body and status code from `HttpResponseEnvelope` are used. Content type, request identity, correlation identity, cache control, and retry advice form the response-header allowlist. Dependency exceptions and stack traces are not exposed. Response construction failure uses a fixed safe 500 response.

## Versioning

This foundation consumes version `1.0` HTTP envelopes. New transport behavior requires an additive compatible change or an explicit versioned boundary.
