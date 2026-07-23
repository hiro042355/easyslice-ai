# Multi-cut Temporary Workspace Integration Requirements V1

## Requirement Checklist

1. **Current Route workspace responsibility:** The unchanged route currently discovers input, constructs temporary outputs, tracks them, and performs cleanup.
2. **os.tmpdir direct usage:** Direct `os.tmpdir` access currently selects both fixed input and output locations.
3. **Fixed input discovery relation:** Fixed downloaded-input discovery must later become opaque-reference materialization.
4. **Temporary output path construction:** Output path construction must move out of the Route and public contracts.
5. **Workspace reservation:** Reservation belongs to the Workspace Capability and rejects duplicates before filesystem mutation.
6. **Workspace preparation:** Directory creation belongs only to the Temporary Workspace Adapter.
7. **Workspace ownership:** Authenticated tenant and ownership references must match workspace projections before reservation.
8. **Workspace identity:** Caller-supplied workspace identity remains an opaque, validated identity.
9. **Opaque workspace reference:** Only the opaque workspace reference crosses the capability boundary.
10. **Safe reference validation:** Traversal, separators, drive syntax, nulls, absolute paths, and encoded separators are rejected before path composition.
11. **Workspace lifecycle:** The adapter owns reserved, prepared, active, cleanup-required, cleaned, and failed classifications.
12. **Workspace lookup:** Lookup returns safe lifecycle classification without filesystem location or metadata.
13. **Workspace cleanup:** Explicit cleanup owns directory removal and runs only from an eligible lifecycle state.
14. **Cleanup failure policy:** Failure preserves the preceding valid state and adds only a safe cleanup classification.
15. **Filesystem exception non-disclosure:** Exceptions, messages, causes, and stacks never cross the adapter boundary.
16. **Raw path non-disclosure:** Absolute and relative filesystem paths are internal implementation details.
17. **Directory name non-disclosure:** Directory and filename values are excluded from decisions and audit.
18. **Media Execution Workspace Capability boundary:** Media Execution receives the Workspace Capability through explicit composition and sees opaque references only.
19. **Input Materialization boundary:** Materialization consumes the opaque workspace reference but is not implemented by this adapter.
20. **Media Process Adapter boundary:** Process execution uses materialized artifacts and is outside Workspace ownership.
21. **Packaging Adapter boundary:** ZIP/archive generation and package artifacts remain outside Workspace ownership.
22. **Sensitive Boundary relation:** Sensitive scope and ownership validation precede Media Execution and workspace use.
23. **Auth ownership relation:** Auth establishes tenant/workspace ownership references used by Workspace validation.
24. **Route responsibility removal:** All workspace selection, creation, tracking, lookup, cleanup, and failure normalization move out of the Route.
25. **Migration prerequisites:** Infrastructure composition, materialization, process/package adapters, and leakage tests must exist first.
26. **Future composition ownership:** Server composition injects Workspace Capability; no default singleton or global registry is introduced.
27. **Regression prerequisites:** Ownership, traversal, lifecycle, cleanup failure, non-disclosure, and existing boundary regressions must pass.
28. **Commit slicing proposal:** Contract, runtime/tests, this document, composition, and Route migration remain separate commits.

## Responsibilities removed from the Route

- os.tmpdir direct access
- temporary directory selection
- workspace directory creation
- workspace path construction
- temporary output path construction
- workspace existence lookup
- workspace lifecycle tracking
- workspace cleanup
- raw filesystem exception normalization
- workspace ownership checks

## Responsibilities not owned by Temporary Workspace Adapter

- file copy
- input materialization
- binary read
- binary write
- FFmpeg
- ffprobe
- process execution
- command construction
- stdout handling
- stderr handling
- ZIP generation
- archive generation
- provider upload
- network
- HTTP projection
- Route response creation
- output artifact ingestion
- media result interpretation

## Information excluded from the public Contract

- absolute filesystem path
- relative filesystem path
- directory name
- filename
- os.tmpdir value
- drive letter
- path separator
- inode
- filesystem metadata
- command
- shell argument
- stdout
- stderr
- provider locator
- raw filesystem exception
- exception message
- stack
- Buffer
- stream
