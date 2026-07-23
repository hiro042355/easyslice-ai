# Multi-cut Sensitive Data Integration Requirements V1

## Scope

`app/api/multi-cut/route.ts` remains unchanged by this document. The requirements below define the future integration boundary between the existing route, Auth Boundary, Upload Boundary, Sensitive Boundary, HTTP Adapter, and media capability.

## Required integration checklist

1. **Request identity classification:** Request identity is operational data. It is available to internal execution and an audit-safe classification only; the raw identity is never public.
2. **Correlation identity classification:** Correlation identity is operational data. Public responses and diagnostics must not expose its raw value.
3. **Creator-style input classification:** Creator-style input is confidential and may be supplied only to an explicitly approved capability input.
4. **Filename classification:** User-supplied filenames are personal or confidential data. They must not be emitted raw to diagnostics or audit.
5. **Temporary path classification:** Input, output, and ZIP paths are locators and are limited to capability input or cleanup.
6. **Raw path discard boundary:** A raw path must be resolved and consumed inside the future filesystem/media infrastructure adapter. It must be discarded before returning to Sensitive Boundary, audit, diagnostics, HTTP projection, or workflow state.
7. **Command non-disclosure:** FFmpeg commands and shell arguments are confidential implementation details and must never be returned, audited, or logged.
8. **stderr non-disclosure:** Raw stderr is consumed only by the infrastructure adapter and normalized into a safe reason code before crossing the capability boundary.
9. **Exception non-disclosure:** Raw exceptions, exception messages, causes, and stacks are discarded at the owning infrastructure boundary.
10. **stdout non-disclosure:** Raw stdout must not enter public, audit, diagnostic, or workflow projections.
11. **Authentication ordering:** Authentication establishes the authenticated tenant and ownership context before upload or sensitive projection.
12. **Upload ordering:** Upload Boundary validates the upload and produces opaque upload references before sensitive projection.
13. **Sensitive ordering:** The required order is `Auth Boundary -> Upload Boundary -> Sensitive Boundary`. It must not be bypassed.
14. **Ownership alignment:** Tenant, workspace, and ownership references must match before any sensitive capability projection.
15. **Capability input:** Only approved opaque references and safe internal projections may be supplied to the media capability.
16. **Cleanup capability limitation:** Cleanup receives only the locator reference required for deletion. Cleanup locators must never be copied into a public response, audit record, or diagnostic.
17. **ZIP binary boundary:** ZIP bytes remain in the binary response transport boundary and must not be represented in Sensitive Boundary contracts or audit.
18. **Public projection:** Public responses contain only a safe outcome classification and a fixed generic message.
19. **Audit projection:** Audit may contain sequence, stage, classification, requested scope, decision classification, and safe reason code only.
20. **Diagnostic projection:** Commands, paths, filenames, creator-style values, stderr, exceptions, stacks, tokens, URLs, and provider locators are replaced by categorical reason codes.
21. **HTTP contract isolation:** HTTP Adapter contracts must not gain token, path, URL, provider-id, credential, locator, command, stderr, or exception fields.
22. **HTTP status projection:** Invalid sensitive projection maps to rejected/400; ownership mismatch or forbidden scope maps to rejected/403; capability unavailability maps to unavailable/503; normalized operation failure maps to unavailable/500 or 503 according to the owning HTTP policy.
23. **No sensitive logging:** Existing direct logging of creator-style configuration, paths, commands, or raw failures must be removed during route integration.
24. **Migration verification:** Route integration tests must prove non-disclosure, ownership rejection, unavailable classification, cleanup isolation, deterministic projection, and immutable results.
25. **Commit isolation:** Sensitive Contract, Sensitive Runtime, this integration document, infrastructure adapters, and route migration remain separate commits with independent validation.

## HTTP projection

| Condition | Safe decision | HTTP candidate |
| --- | --- | --- |
| Invalid sensitive projection | `rejected` | 400 |
| Forbidden scope or ownership mismatch | `rejected` | 403 |
| Sensitive capability unavailable | `unavailable` | 503 |
| Safely normalized operation failure | `unavailable` | 500 or 503 |

Only the safe classification and fixed generic message may cross the HTTP boundary.

## Migration prerequisites

1. Establish authenticated tenant, workspace, and ownership context.
2. Replace direct upload/path input with opaque Upload Boundary references.
3. Complete Sensitive Boundary projection before media capability invocation.
4. Move path resolution, command construction, and process execution behind explicit infrastructure capabilities.
5. Normalize stdout, stderr, exceptions, and stacks before diagnostics.
6. Keep ZIP bytes outside audit and Sensitive Boundary records.
7. Restrict cleanup to its injected capability and opaque locator references.
8. Remove direct sensitive logging.
9. Add dedicated route integration and leakage regressions.

## Responsibility

The route owner removes direct logging and sensitive infrastructure handling. The media-operation owner accepts only approved capability inputs. The HTTP Adapter owner maps only safe decisions. Sensitive Boundary does not resolve raw values, execute media operations, store secrets, create archives, or perform cleanup.
