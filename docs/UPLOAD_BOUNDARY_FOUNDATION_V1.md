# Upload Boundary Foundation V1

## Purpose

This foundation projects externally created opaque upload references into safe contexts for HTTP and Generation Job composition. It performs no upload, download, storage, multipart, signed-URL, filesystem, or media processing operation.

## Contract boundary

The type-only contract defines reference kind, opaque identity, source/media/lifecycle classifications, safe integrity and metadata projections, ownership scope, validation, decisions, audits, and projected context. Native request, binary, stream, URL, storage SDK, provider and database types are forbidden.

## Opaque reference model

An upload reference contains only an externally generated opaque ID and classified metadata. Paths, directories, buckets, object keys, public/signed/download URLs, provider locators, tokens, receipts, checksums and handles are never represented.

## Runtime

The Reference runtime validates structure, duplicate identity, media and lifecycle classifications, safe integrity shape, and tenant/workspace/ownership agreement. Only an available, supported, owned reference reaches the explicitly injected resolution capability, which is invoked at most once.

## Lifecycle mapping

- available → resolution, then projected/rejected/unavailable
- pending → pending
- expired → rejected
- deleted → rejected
- quarantined → rejected
- unavailable → unavailable

No clock comparison occurs; lifecycle is classified by an outer authoritative boundary.

## Integrity boundary

Integrity projection records presence, verification, algorithm classification, content-length verification and media-type verification. It contains no raw digest, ETag, receipt, scan report or scanner output.

## Audit and security

Audit includes only ordered stage, classification and reason code. It excludes request/upload/subject/tenant/workspace identities, storage information, dependency output, raw errors and stack traces.

## Immutability and determinism

Capability inputs and projected references are copied, results are deeply frozen, and no clock, randomness, UUID, timer, filesystem stat, environment or global mutable state is used.

## Versioning

V1 supports video, audio, image, archive and unknown media classifications without defining how bytes are transported. Additional transport/storage behavior belongs in separate foundations.
