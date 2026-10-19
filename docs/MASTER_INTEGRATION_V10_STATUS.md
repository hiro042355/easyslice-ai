# V10 quality remediation candidate

Baseline: `8823f32abab1837d2386a9a61ede4ee71848d96f`.
Development only; PR #2 must remain Draft. No merge or deployment authorization.

## Implemented

- Derive workflow entry query/cancel/poll contracts from their domain interfaces.
- Preserve readonly ready-asset collections through poll projection.
- Narrow persistence results by status before reading values; store pending references under their actual domain type.
- Reject validated requests for a different API command before authorization or runtime dispatch.
- Correlate operation pipeline request/materialization/transport/response types instead of erasing them with any.
- Reject a resolved request whose shape belongs to another operation before generation reservations.
- Fail closed when a post-cancellation reread unexpectedly returns a pending state.
- Remove four genuinely unused bindings without deleting features or changing lint configuration.

## Executing regressions

Twenty wrong-command combinations, two ownership/terminal replay cases, two cancellation-reread cases and one three-operation restore-mismatch test were added. These use synthetic fixtures, not production credentials or provider authority.

## Remaining release blockers

Full lint is not closed: last measured candidate has 85 errors and 31 warnings (baseline 156/35). No suppression, severity change or scope exclusion was added.

The remaining legacy workflow mappings include a substantive audit contract discrepancy: `ReferenceWorkflowEntryAudit` requires `auditVersion` and a nonoptional final persistence status, while the legacy mapper constructs a different audit shape. Its reason-code mappings and cancellation result shape also need an explicit compatibility decision. Replacing these assertions with another cast would conceal the mismatch.

Other remaining findings include confidential payload construction boundaries, unknown runtime validators, legacy async coordinator/result unions, unused omission bindings and existing UI handlers, and three image-element warnings. These have not been certified safe by this change.

Character upstream owner/Identity Lock/Casting/Scene/rights semantics remain unresolved; affected production integration stays disabled. Independent AI MV is preserved.
OpenRouter remains mock/offline/default-off and production-forbidden; durable cost accounting, custody, capability and recovery authority remain release gates.

Final command/exit evidence and the complete per-file diagnostic ledger are delivered separately as `MASTER_INTEGRATION_V10_FINAL_REPORT.md` and `V10_DIAGNOSTIC_LEDGER.json`.

MERGE_READINESS: BLOCKED.
PRODUCTION_READINESS: BLOCKED.
