# Reference Materializer Runtime Foundation V1

## 1. Purpose and ownership

This foundation implements deterministic Reference request materialization for Vocal, Music, and MV. Its exact production ownership is `materializerUtils.ts`, `referenceProfiles.ts`, and the three Reference materializer modules.

It consumes the committed Materializer Contract, Asset Contract, and Provider Request Contract. It does not change those contracts.

## 2. Shared utilities and profiles

Shared utilities validate common input, build a resolved-asset index, classify duplicate or ambiguous usage, validate kind/access/expiry, copy request data, and project safe Issue/Audit metadata. All time decisions use the caller-supplied strict UTC `baselineTime`.

Reference profiles statically bind provider, API version, operation, slot requirement, cardinality, asset kind, access mode, and minimum lifetime. Profiles are deeply frozen. They contain no credential, endpoint, availability claim, environment switch, or registration behavior.

## 3. Vocal, Music, and MV behavior

Vocal binds optional reference voice and guide melody access while preserving lyrics, direction, and timeline. Music binds optional reference audio while preserving duration, tempo, structure, sections, and provider fields. MV requires audio, binds ordered scene assets, and preserves scene order, duration, transition, visual direction, and metadata.

Logical asset identifier fields are removed from successful provider bodies and replaced only by validated materialized access values. The runtime does not reinterpret prompts, lyrics, scene meaning, duration, or Director output.

## 4. Validation and failure semantics

Validation is fail-closed for malformed input, version/provider/API/operation mismatch, incomplete resolution, invalid profile, duplicate or ambiguous usage, missing required assets, kind/access mismatch, invalid expiry, and cardinality violations. Failure uses only Contract-defined status, classification, and reason codes. It returns no partial provider request.

Issue and Audit projections contain counts, safe enums, mapping index, usage, kind, profile version, and reason codes only. They never contain request bodies, asset identifiers, URL, token, handle, prompt, lyrics, credential, endpoint, raw error, or stack.

## 5. Determinism and mutation isolation

The runtime is synchronous, pure, and deterministic for the same input and baseline. It has no system clock, random source, network, filesystem, environment, persistence, logging, retry, or polling. Input request data is copied before projection. Static profiles and materializer instances are frozen.

## 6. Non-ownership

This foundation does not resolve logical assets, verify external existence, upload assets, acquire credentials, select providers or clients, execute transport, orchestrate workflows, ingest output, recalculate duration, plan scenes, run Director or Emotion engines, render UI, or own a registry.

Materializer Registry, Workflow, Provider Client, Upload/Gate, and Output Ingestion remain separate later foundations. Reference access-mode support is representation capability, not provider network readiness or credential readiness.

## 7. Exact validation and candidate

Validation consists of the static runtime boundary test, Vocal/Music/MV behavior tests, the access capability audit, committed Contract compatibility, Provider Request and Asset compatibility tests, scoped TypeScript, snapshot dependency validation, security scanning, and `git diff --check`.

The exact candidate contains five production modules, four dedicated test modules plus the shared test fixture and existing capability audit, this document, and `MATERIALIZER_ACCESS_CAPABILITY_SEMANTICS_CONTRACT_V1.md`.

Status: implementation candidate; production provider composition is not ready and is not claimed.
