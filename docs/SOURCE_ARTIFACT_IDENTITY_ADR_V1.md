# Source Artifact Identity ADR V1

## 1. Status

Accepted. This ADR is the normative V1 decision for source-artifact identity issuance, scope, lifetime, ownership, and external-source relations. It authorizes no persistence implementation or migration.

## 2. Context

`SourceArtifactReference` already carries a versioned opaque reference across trusted materialization boundaries, but prior decisions did not define its business meaning, uniqueness scope, issuance owner, or durable semantics. Creator Publication identity requires those properties without exposing filenames, URLs, or provider identifiers as internal identity.

## 3. Decision

A Source Artifact is one accepted, immutable logical source-media registration used as input to creator-owned generation. It is not a filesystem object, upload session, filename, URL, provider video, or mutable media locator. Content replacement creates a new registration.

## 4. Issuance Owner

The Source Registration application service at the accepted ingestion boundary is the sole issuer. Upload ingestion and YouTube ingestion submit registration commands to it; adapters and UI never issue identities. Issuance succeeds only after an authoritative tenant, authorized creator account, accepted source evidence, and source-registration idempotency key are present.

## 5. Identity Shape

`SourceArtifactIdentityV1` is represented at existing materialization boundaries by `SourceArtifactReference` version `1.0`. Its `opaqueSourceArtifactReference` is the protected identity output defined by the Creator Publication Identity Encoding Specification V1 under domain `source-artifact/v1`. Consumers treat it as opaque.

## 6. Uniqueness Scope

The identity is tenant-scoped. Canonical uniqueness is tenant identity plus source-registration idempotency-key identity. Creator ownership is an explicit relation and is not part of the artifact identity, allowing an explicitly authorized ownership transfer or additional owner without rewriting the source identity. The same opaque value in another tenant is not the same artifact.

## 7. Source Registration Idempotency

The registration command binds tenant, accepted ingestion kind, and its authoritative opaque idempotency-key identity. Same key and same semantic binding replays the existing artifact. Same key with different binding is a conflict. A different key is a new artifact registration even when external provenance matches.

## 8. Durable Semantics

The Source Registration store persists the tenant-scoped protected identity and immutable semantic binding before downstream generation. The same record remains addressable after process restart. An in-memory handle, temporary upload ID, URL, filename, or path cannot substitute for the durable identity.

## 9. Creator Ownership Relation

`CreatorSourceArtifactLinkV1` binds an authorized Creator Account to an exact tenant-scoped Source Artifact. The link owner is the Creator Publication store. Binding requires creator and source tenant equality. Deleting or revoking access does not recycle the artifact identity or rewrite historical clip ownership.

## 10. Upload Source Semantics

Upload filename, MIME presentation name, local path, and upload session are provenance or transport evidence only. Upload ingestion supplies an authoritative registration idempotency key. Repeated submission under the same key and same binding reuses the registration; otherwise a new registration is created.

## 11. YouTube External Source Relation

YouTube provenance is represented separately as `ExternalSourceIdentityV1` with provider `youtube` and authoritative `videoId`. It links to the internal Source Artifact but never replaces it. The pair provider plus external ID is not an internal uniqueness constraint: separate explicit ingestion commands may register separate artifacts from the same external video.

## 12. Other External Sources

Additional providers require an additive provider value and authoritative provider object ID. URLs, titles, channel names, and parsed path fragments are not external identity. Unsupported provider evidence remains absent rather than inferred.

## 13. Source Type

Source type is exactly `upload` or `youtube` in V1. It is source provenance and is independent from optimization target and published platform.

## 14. Referential Integrity

Creator/source links and generated clips reference the tenant-scoped Source Artifact record. When no shared Source Artifact database table is available, the Creator Publication store persists the complete opaque reference plus tenant scope and validates it through the Source Registration capability; it does not invent a foreign key to an unrelated table.

## 15. Privacy

The internal reference is a protected identity. Raw credentials, tokens, session IDs, local paths, URLs, filenames, and external API payloads are excluded. External provider IDs are restricted provenance and are not exposed through ordinary analytics output.

## 16. Exact Join

All joins use tenant scope plus exact protected Source Artifact identity. Provider ID is used only to query explicit provenance. Filename, title, timestamp, duration, transcript, URL, or similarity joins are forbidden.

## 17. Rejected Alternatives

- Global unscoped opaque identity: loses tenant isolation.
- Creator-scoped identity: ownership changes would rewrite identity.
- Provider-scoped identity: cannot represent uploads or repeated accepted ingestions.
- Filename, URL, session, or path identity: unstable and unsafe.
- Automatic provider-ID deduplication: conflates distinct ingestion intent.

## 18. Compatibility

The existing `SourceArtifactReference` shape remains unchanged. This ADR supplies its missing semantics. Existing consumers remain opaque-reference consumers and gain no authority to issue or interpret references.

## 19. Migration Impact

The next persistence Change Set adds an additive Source Registration record or an explicit reference to an existing authoritative record after verifying compatibility. Historical references without tenant-scoped issuance evidence remain legacy-unlinked and are not upgraded by inference.

## 20. Open Decisions

None for V1.
