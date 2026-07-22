# Multi-cut Route Migration Plan V1

## 1. Current responsibility inventory

`app/api/multi-cut/route.ts` currently combines JSON reading, request validation, creator-style logging, downloaded-file discovery, temporary-path management, shell command construction and execution, FFmpeg processing, ZIP generation, response construction, and cleanup. It also creates time-derived filenames and directly accesses filesystem and process execution capabilities.

## 2. Target dependency flow

`multi-cut route` → `Next Route Adapter` → `HTTP Adapter Runtime` → `Generation Job Entry Runtime` → injected Server Composition capability. Authentication, upload resolution, and sensitive-value handling remain explicit adjacent capabilities and do not move into transport adapters.

## 3. Keep / Move / Delete matrix

| Responsibility | Decision | Target owner |
| --- | --- | --- |
| Route export, NextRequest receipt, route identity, HTTP method, wiring | Keep | thin `app/api/multi-cut/route.ts` |
| Allowlisted headers, bounded JSON read, malformed JSON, response mapping | Move | Next Route Adapter |
| HTTP envelope validation, Generation Job request projection, safe result envelope | Already moved | HTTP Adapter Runtime |
| Job validation, server capability invocation, terminal projection | Already moved | Generation Job Entry Runtime |
| Authentication and authorization | Separate | Authentication Adapter capability |
| Upload resolution, pending upload, polling, provider upload gate | Separate | Upload foundations |
| Credentials and sensitive references | Separate | Sensitive Boundary |
| Direct workflow calls, runtime factories, singleton defaults, duplicate mappers/validation | Delete after parity | obsolete route/integration code |
| FFmpeg, ZIP, temporary files and process execution | Move behind an operation capability | future media operation runtime |

## 4. Required preconditions

The Next Route Adapter, Authentication Adapter, upload request projection, Sensitive Boundary, explicit Server Composition wiring, and a media-operation capability must be committed and independently validated before route replacement.

## 5. Authentication dependency

The route must receive an explicit authentication/authorization capability. The Next Route Adapter only projects transport values and must not interpret cookies, credentials, sessions, or authorization policy.

## 6. Upload dependency

The current fixed temporary input path must be replaced by an opaque validated upload reference. Multipart parsing, signed URLs, provider upload gates, pending states, and polling remain outside the route adapter.

## 7. Sensitive-data boundary

Cookies, authorization headers, raw URLs, query collections, filesystem paths, shell commands, provider references, credentials, and stack traces must never enter public HTTP envelopes or responses.

## 8. HTTP status mapping

The route preserves the HTTP Adapter contract lock: accepted 202, completed 200, partial 207, cancelled 200, recovery-required 202, rejected 403, failed 503, dependency throw 503, and unsupported dependency result 500.

## 9. Incremental migration steps

1. Commit the Next Route Adapter Foundation.
2. Introduce or capability-wrap authentication and authorization.
3. Separate upload request projection and opaque input resolution.
4. Compose explicit server capabilities without defaults or singletons.
5. Replace `multi-cut` with thin route wiring.
6. Run route behavior, security, and status-parity regression.
7. Remove the obsolete Workflow API path.
8. Remove obsolete Workflow Integration after reverse-dependency verification.

## 10. Rollback boundary

Keep each step in a separate commit. Before obsolete-path deletion, rollback is limited to route wiring and composition commits; committed lower foundations remain unchanged. Do not operate both routes against the same mutation identity without an authoritative idempotency decision.

## 11. Test plan

Cover method and identity projection, malformed and oversized JSON, header allowlists, auth allow/deny, upload reference validation, exactly-once capability invocation, all locked status mappings, cancellation/recovery, no sensitive leakage, deterministic results, and old-route parity for supported behavior.

## 12. Deletion candidates

Delete direct Workflow invocation, old Workflow Integration imports, route-local runtime factories/default instances, duplicate response mapping and validation, raw shell command construction, and fixed temporary-file assumptions only after replacement capability parity is proven.

## 13. Remaining blockers

Authentication/authorization capability, upload projection, opaque media-operation capability, explicit production composition, idempotency ownership for route retries, and a decision on binary ZIP delivery remain unresolved.

## 14. Commit slicing proposal

Use independent commits for: status-map lock; Next Route Adapter Foundation; migration plan; Authentication Adapter; upload projection; composition wiring; thin route migration plus regression; old Workflow API deletion; and old Workflow Integration deletion.
