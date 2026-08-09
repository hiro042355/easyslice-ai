# Creator Publication Identity Encoding Specification V1

## 1. Status and Authority

Accepted. This specification is the normative V1 encoding contract for Creator Publication protected identities. It supplements the Creator Account Ownership, Publication Lifecycle, and Source Artifact Identity ADRs. It authorizes no store, migration, runtime, provider, or UI implementation.

## 2. Existing Primitive Reuse

V1 reuses repository conventions: HMAC-SHA-256 for protected low-entropy identity, explicit algorithm version, domain separation, and deterministic length-prefixed UTF-8 scalar framing. Plain SHA-256 is not used for principal, idempotency-key, or other enumerable business identity. Key material is injected by Production composition and never enters a contract value.

## 3. Protected Identity Shape

`CreatorPublicationProtectedIdentityV1` contains `identityVersion: "1.0"`, one exact domain, `algorithm: "hmac-sha256"`, `algorithmVersion: 1`, and a 32-byte digest. Text transport, when required, uses lowercase unpadded hexadecimal prefixed by `hmac-sha256:1:`. Raw canonical input is never persisted beside the digest unless a separate restricted business field is explicitly required.

## 4. Domains

V1 domains are `source-artifact/v1`, `creator-account/v1`, `principal/v1`, `generated-clip/v1`, `publication-idempotency-key/v1`, `publication-command/v1`, `prediction/v1`, and `publication-reconciliation/v1`. Domain is framed as the first input field and persisted. Digests from different domains are never interchangeable.

## 5. Canonical Framing

Input is an ordered list fixed by each projection below. Each scalar is encoded as UTF-8 after type-specific canonicalization and framed as decimal byte-length, colon, then bytes. Field name and value are each framed. Optional fields use an explicit `absent` scalar; empty string is never equivalent to absent. Arrays include count and preserve specified order. Objects and locale-dependent property sorting are not encoding inputs.

## 6. String Rules

Strings use Unicode NFC, retain case unless the owning upstream contract defines case-insensitivity, reject leading/trailing whitespace where identifiers disallow it, and contain no locale-dependent conversion. Opaque references and platform IDs remain byte-for-byte case-sensitive after validation. Empty identity strings are rejected.

## 7. Integer and Version Rules

Integers use base-10 ASCII with no sign for nonnegative values, no leading zero except zero, and safe-integer validation. Versions are explicit ASCII literals. Boolean values are `true` or `false`. Floating-point numbers are never direct protected-identity inputs.

## 8. Canonical Boundary Unit

`CanonicalClipBoundaryIdentityV1` uses nonnegative integer milliseconds. Precision is one millisecond and decimal scale is three fractional second digits. Inputs must be finite, nonnegative, and exactly representable at millisecond precision. Values with meaningful precision below one millisecond are rejected; they are not rounded.

## 9. Boundary Canonicalization

Seconds are converted to integer milliseconds only when `seconds * 1000` is an exact safe integer under the validated input representation. `12.3`, `12.30`, and `12.300` canonicalize to `12300`. Negative zero canonicalizes to `0`. NaN, Infinity, negative values, unsafe integers, and sub-millisecond values are rejected. End must be greater than start.

## 10. Boundary Serialization

The identity scalar is the base-10 millisecond integer with no unit suffix or leading zeros. `encodingVersion` is `milliseconds-v1`. The typed contract retains start and end as separate ordered scalars, preventing concatenation ambiguity.

## 11. Key Authority

Production composition supplies an HMAC key reference for algorithm version 1 to the protected-identity projector. The key owner is the Production secrets/KMS boundary. The projector receives key bytes through injection, never environment lookup. Rotation introduces algorithmVersion 2 and dual-read migration; V1 digests are never silently recomputed with another key.

## 12. Creator Account Projection

Ordered inputs are tenant protected identity and Creator Account issuer-assigned opaque account ID. Domain is `creator-account/v1`. Account issuance remains owned by the Creator Account service; this projection protects the issued identity and does not create an account from principal data.

## 13. Source Artifact Projection

Ordered inputs are tenant protected identity and authoritative source-registration idempotency-key identity. Domain is `source-artifact/v1`. Ingestion kind and semantic fingerprint are persisted for replay/conflict validation but are not appended after issuance to mutate identity.

## 14. Protected Principal Projection

`ProtectedPrincipalIdentityV1` uses domain `principal/v1` and ordered inputs tenant protected identity, `AuthenticationSubject.subjectClassification`, issuer classification from the trusted authentication projection, and opaque subject reference. Raw email, credential, bearer token, session ID, and authentication payload are forbidden. User, service, and system remain distinct.

## 15. Generated Clip Projection

Domain is `generated-clip/v1`. Ordered inputs are creator protected identity, tenant-scoped source-artifact protected identity, unchanged `stableCandidateId`, boundary encoding version, canonical start milliseconds, canonical end milliseconds, and authoritative generation operation identity. Equal candidate IDs from different creators or sources produce different digests.

## 16. stableCandidateId Role

`stableCandidateId` is preserved as ranking evidence and one projection input. It is not a Production identity by itself. Its existing generation and compatibility semantics remain unchanged.

## 17. Publication Idempotency Key

`PublicationIdempotencyKeyV1` is a caller-supplied opaque key accepted only at the Publication application boundary. The raw key is never persisted or logged. Domain `publication-idempotency-key/v1` projects tenant protected identity, authorized principal protected identity, and the validated raw key. Missing, empty, URL-like, credential-like, or oversized keys are rejected by the future Contract; no fallback is generated.

## 18. Publication Command Projection

Domain is `publication-command/v1`. Ordered inputs are creator protected identity, generated-clip protected identity, exact target platform, command semantic version `1.0`, and protected Publication idempotency-key identity. Same ordered input produces the same command identity. Any creator, clip, target, semantic-version, or key mismatch produces a distinct digest and semantic replay comparison classifies reuse of an existing key binding as conflict.

## 19. Attempt Ordering

Attempt number, clock time, request arrival, and quality rank are excluded from command identity. Attempts are evidence within one command aggregate. No newer, older, or superseded meaning exists between commands.

## 20. Prediction Projection

Domain is `prediction/v1`. Ordered inputs are creator protected identity, generated-clip protected identity, exact platform target, and prediction contract version. Publication identity and observation time are excluded, permitting prediction before publication.

## 21. Reconciliation Evidence Identity

`PublicationReconciliationEvidenceV1` contains creator, generated clip, publication command, target platform, reconciliation-required literal, owner/action classification, and optional protected external request identity only when supplied authoritatively by a tracked Production adapter. Its protected identity uses domain `publication-reconciliation/v1` and the same ordered fields.

## 22. Unknown-outcome Rules

Unknown outcome never fabricates `platformVideoId`. Exact reconciliation lookup uses Publication Command identity plus authoritative protected external request identity when available. Without external request identity, the owner/action is operator-review and no provider lookup is inferred. Title, filename, URL, timestamp, duration, and text lookup are forbidden.

## 23. Reconciliation Owner

The Publication aggregate owns reconciliation-required state and evidence. A future reconciliation worker consumes the evidence but does not alter its identity. Only the Publication aggregate may resolve unknown-outcome to published or failed after authoritative evidence.

## 24. Copy Isolation and Immutability

All public identity and evidence values are readonly and deep-copy digest bytes on ingress and egress. Callers cannot mutate stored or projected identities. Equality compares domain, algorithm, algorithm version, and digest bytes in constant-time where secrets-sensitive implementation permits.

## 25. Persistence Metadata

Every protected identity slot persists domain, algorithm, algorithm version, and 32-byte digest. Database code never infers metadata from a column name. Unique constraints include tenant scope where the owning ADR defines tenant-scoped identity.

## 26. Exact Chains

The exact forward chain is Creator Account to Source Artifact to Generated Clip to Prediction and Generated Clip to Publication Command to Publication Result to Published Video. The unknown chain is Publication Command to Reconciliation Evidence to authoritative resolution. Reverse traversal uses persisted relations only.

## 27. Prohibited Inputs

Random values, current time, title, filename, transcript similarity, URL parsing, locale output, JSON property order, raw credentials, raw email, raw session ID, and UI state are prohibited identity inputs. No fallback identity exists.

## 28. Implementation Readiness

All V1 domains, ordered inputs, scalar encodings, boundary representation, algorithm, version, key ownership, principal protection, idempotency key, and unknown-outcome evidence are fixed. The subsequent persistence Change Set may implement these contracts without introducing identity semantics.

## 29. Open Decisions

None for V1.
