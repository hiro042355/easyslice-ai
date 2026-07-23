# Multi-cut Upload Integration Requirements V1

## 1. Current upload input shape

The current route accepts clip ranges and style/output options but no explicit upload reference. It assumes one previously downloaded video exists outside the request body.

## 2. Path usage

The route constructs the fixed local path `downloaded.mp4` under the process temporary directory. This is not an opaque upload reference and must not cross the future boundary.

## 3. Filesystem discovery ownership

The route currently calls filesystem access directly. Future discovery belongs to a separately composed upload/media capability behind an authoritative opaque-reference resolver, never the Route Adapter or Upload Projection Runtime.

## 4. Temporary file ownership

The component materializing media bytes owns any temporary input/output path, collision policy and process isolation. The route and contracts do not own paths.

## 5. Cleanup ownership

The byte-materialization/media-operation component that creates a temporary artifact owns cleanup and recovery. Cleanup must be idempotent and must not expose paths in public results.

## 6. Accepted media type

`multi-cut` accepts only a verified `video` reference. Audio, image, archive and unknown references are rejected for this operation even though the generic V1 contract can classify them.

## 7. Upload reference extraction

After transport bounds and Auth allow, composition extracts an opaque reference from a validated request projection and invokes Upload Projection before HTTP/Generation Job execution.

## 8. Raw path destruction boundary

Any path or storage locator terminates inside the future byte-materialization capability. It is never placed in Upload, HTTP, Generation Job, audit, retry or idempotency contracts.

## 9. Auth ownership comparison

The authenticated ownership reference must match the upload ownership reference before resolver invocation. Denial must not reveal whether the upload exists.

## 10. Tenant and workspace comparison

Authenticated tenant, requested workspace and upload tenant/workspace must agree. Client-submitted tenant/workspace values cannot establish ownership.

## 11. Pending upload

Pending projects to accepted/202 at route composition, with no polling loop inside Upload Projection. Poll scheduling and authoritative state lookup belong to the Pending Upload foundation.

## 12. Expired, deleted and quarantined references

Expired and deleted references use existence-safe rejected/410 by default. Quarantined uses rejected/422. Authorization-sensitive deployments may normalize these with forbidden/403 to avoid existence disclosure.

## 13. Integrity verification

Require integrity present and verified, content-length verified and media-type verified before FFmpeg capability invocation. Raw checksum, ETag, scan report and provider receipt remain private.

## 14. HTTP response policy

- invalid request → rejected/400
- unsupported media → rejected/415
- ownership mismatch → rejected/403
- pending → accepted/202
- expired/deleted → rejected/410, or existence-safe 404 when policy requires
- quarantined → rejected/422, or 403 when existence protection requires
- resolver unavailable → unavailable/503

These mappings belong to route composition and do not alter the HTTP Adapter Production Contract in this foundation.

## 15. Retry and idempotency

Retries reuse authoritative request and upload mutation identities. Projection performs no retry. Pending/unavailable is not success, and media execution must not begin until the same authoritative reference is projected.

## 16. FFmpeg capability input

FFmpeg receives a private materialized-media capability or protected handle resolved after authorization and upload projection. It never receives a public request path, URL, bucket or object key.

## 17. ZIP and binary delivery

ZIP creation and binary delivery are separate output capabilities. They must not cause upload references or private storage locators to appear in filenames, headers or response bodies.

## 18. Migration prerequisites

Commit Upload Contract/Runtime, define authoritative upload lookup and byte materialization, integrate Auth ownership, define Pending Upload behavior, isolate FFmpeg and ZIP capabilities, then add route-level regression before modifying `multi-cut`.

## 19. Deletion candidates

Delete the fixed `downloaded.mp4` assumption, route-local filesystem access, temporary path generation, direct process execution, path logging and route-owned cleanup after replacement parity is proven.

## 20. Commit slicing proposal

Use separate commits for Upload contracts, Reference projection runtime, this integration document, authoritative lookup/materialization, pending handling, media-operation composition, thin-route migration and old direct-filesystem deletion.
