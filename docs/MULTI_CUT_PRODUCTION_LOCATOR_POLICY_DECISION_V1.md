# Multi-Cut Production Locator Policy Decision V1

## Status

Architecture boundary recorded; Production location policies remain intentionally undecided.

## Purpose

This ADR records what the current Repository contracts establish about Production Locators, what they do not establish, and which Architecture Decisions are required before a Production implementation can be created. It defines no path, filename, root, registry, environment source, or filesystem implementation.

## Existing Locator contracts

### Source Artifact Locator

`SourceArtifactLocatorCapability.locateSource()` accepts one opaque reference and returns a `LocatedArtifact` containing an internal location. The Input Materialization Adapter validates the request before invocation, inspects the located artifact, and requires a regular file.

### Workspace Locator

`WorkspaceLocatorCapability.locateWorkspace()` accepts one opaque reference and returns a `LocatedWorkspace` containing an internal location. The Input Materialization Adapter verifies that the located destination remains contained by that workspace.

### Packaging Output Locator

`PackagingOutputLocatorCapability.locateOutput()` accepts one opaque output reference and returns an internal location plus an archive-entry name. ZIP Packaging validates the located file and rejects unsafe or duplicate archive-entry names.

### Packaging Archive Locator

`PackagingArchiveLocatorCapability.locateArchive()` accepts an opaque archive reference and the deterministic archive name supplied by ZIP Packaging. It returns an internal archive location. ZIP Packaging owns collision inspection and exclusive writing at that location.

## Policy classification

| Policy question | Classification | Repository evidence and boundary |
| --- | --- | --- |
| A Locator consumes an opaque reference rather than a public path | Currently decidable from the Repository | All four public Locator contracts use opaque references. |
| A Locator returns only Adapter-internal location data | Currently decidable from the Repository | Locations are dependency results and do not enter public Adapter decisions. |
| Source location must resolve to a regular file | Currently decidable from the Repository | Input Materialization performs the authoritative filesystem inspection. |
| Materialized output must remain contained by the located workspace | Currently decidable from the Repository | Input Materialization performs containment validation before copying. |
| Packaging output must resolve to a regular file | Currently decidable from the Repository | ZIP Packaging inspects every located output. |
| Archive-entry names must be safe and unique | Currently decidable from the Repository | ZIP Packaging validates leaf-name safety and duplicate collisions. |
| Archive naming is deterministic and operation-owned | Currently decidable from the Repository | ZIP Packaging supplies the deterministic archive name to the Archive Locator. |
| Archive destination collisions use exclusive-create behavior | Currently decidable from the Repository | ZIP Packaging inspects and writes exclusively through its filesystem capability. |
| Locator invocation must not replace Adapter validation | Currently decidable from the Repository | Both Adapters validate public requests before calling Locators. |
| Locator failures must be normalized without raw details | Currently decidable from the Repository | Both Adapters convert Locator failures to safe decisions. |
| The authoritative owner of opaque Source-reference resolution | Not decidable from the Repository alone | No Production registry, reference vault, or source catalog is selected. |
| The authoritative owner of opaque Workspace-reference resolution | Not decidable from the Repository alone | Temporary Workspace and Input Materialization do not share a public location authority. |
| The authoritative owner of opaque Output-reference resolution | Not decidable from the Repository alone | No Production output catalog or execution manifest is selected. |
| The authoritative owner of opaque Archive-reference resolution | Not decidable from the Repository alone | No Production archive catalog or durable artifact authority is selected. |
| Source location policy | Additional Architecture Decision required | The Contract provides no mapping policy and this ADR does not choose one. |
| Workspace location policy | Additional Architecture Decision required | The Contract provides no mapping policy and this ADR does not choose one. |
| Output location policy | Additional Architecture Decision required | The Contract provides no mapping policy and this ADR does not choose one. |
| Archive location policy | Additional Architecture Decision required | The Contract provides no mapping policy and this ADR does not choose one. |
| Archive-entry filename policy | Additional Architecture Decision required | The Contract requires a safe name but does not define how Production derives it. |
| Workspace-root ownership | Additional Architecture Decision required | No public Contract selects or exposes a root owner. |
| Archive-root ownership | Additional Architecture Decision required | No public Contract selects or exposes a root owner. |
| Locator registry implementation | Additional Architecture Decision required | No registry implementation or lifecycle is selected. |
| Configuration and environment ownership | Additional Architecture Decision required | Existing contracts do not authorize environment lookup. |
| Filesystem implementation selection | Additional Architecture Decision required | Locators do not own filesystem operations and no implementation is selected here. |
| Reference lifetime, invalidation, and reuse | Additional Architecture Decision required | Opaque identity syntax does not define authoritative lifecycle semantics. |
| Tenant and ownership enforcement during resolution | Additional Architecture Decision required | Adapter request validation exists, but Locator authority and lookup authorization are unspecified. |
| Cross-process and durable resolution | Additional Architecture Decision required | Current execution is request-scoped and no durable lookup contract is selected. |

## Production policy required before implementation

A Production Locator Foundation requires explicit policy inputs for reference authority, resolution lifecycle, ownership enforcement, containment authority, and failure behavior. Those policies must be decided without leaking physical locations through public Adapter decisions.

Physical naming, roots, registry technology, environment sources, and filesystem technology remain outside this ADR.

## Assembly boundary

Server Runtime Assembly may receive already-constructed Locator capabilities and pass them to Input Materialization and ZIP Packaging Adapters. Assembly must not implement resolution logic, derive names, select roots, read environment configuration, or perform Locator lookups during construction.

Assembly validation may verify that required Locator methods exist. Behavioral validation and reference resolution begin only when the owning Adapter invokes the Locator during an execution attempt.

## Runtime Binding boundary

Media Execution Runtime Binding receives four completed capabilities: Workspace, Input Materialization, FFmpeg Process, and ZIP Packaging. It does not receive Locator capabilities and does not know how references resolve. Production Locator policy must not be added to Runtime Binding.

## Adapter boundary

Input Materialization owns request validation, Locator invocation order, source inspection, workspace containment, collision handling, and copy-result projection. ZIP Packaging owns Locator invocation order, output inspection, archive-entry validation, collision handling, archive construction, and exclusive write projection.

Locators own only resolution from their contracted logical input to the contracted internal result. They do not inspect files, create directories, copy artifacts, build archives, clean workspaces, execute processes, or project public results.

## Explicit non-decisions

This ADR does not select or describe:

- any physical path;
- any filename derivation;
- any workspace root;
- any archive root;
- any registry implementation;
- any environment or configuration source;
- any filesystem implementation.

## Required Architecture Decisions

Production Locator implementation may begin only after the following decisions are approved:

1. Opaque reference authority and lifecycle for Source, Workspace, Output, and Archive references.
2. Ownership and authorization enforcement at each resolution boundary.
3. Workspace relationship among Source, materialized input, generated Output, and Archive artifacts.
4. Production location policy for each Locator without exposing physical values publicly.
5. Production archive-entry naming policy consistent with existing safety and uniqueness validation.
6. Workspace-root ownership and lifecycle boundary.
7. Archive-root ownership and lifecycle boundary.
8. Registry or catalog ownership, persistence, concurrency, and recovery semantics.
9. Explicit configuration ownership without hidden environment lookup.
10. Filesystem implementation ownership and injection boundary.
11. Reference invalidation, replay, duplicate, and stale-reference behavior.
12. Request-scoped versus durable and cross-process resolution policy.

## Suggested implementation order

1. Decide reference authority, lifetime, ownership, and authorization.
2. Decide artifact-to-workspace relationships and containment authority.
3. Decide Production location and archive-entry naming policies.
4. Decide registry/catalog and concurrency semantics.
5. Decide configuration and filesystem injection ownership.
6. Add policy-specific Locator contracts only if the current contracts cannot express the approved decisions.
7. Implement and validate Production Locators independently.
8. Inject validated Locator instances through Server Runtime Assembly.
9. Integrate Route Migration only after Assembly and HTTP projection boundaries are independently complete.

## Decision outcome

The current Locator contracts are sufficient to define Adapter invocation boundaries but insufficient to define Production resolution policy. Production Locator implementation remains blocked pending the listed Architecture Decisions.
