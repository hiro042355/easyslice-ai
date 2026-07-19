import type { DurableWorkflowTransactionContext } from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import type { PostgreSQLSliceAStatementCatalogRegistrar } from "@/lib/server/productionWorkflowRuntime/postgresqlStores";
import type { ProtectedIdentity } from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";

export const MANUAL_REPAIR_LIFECYCLE_FIXTURE_DESCRIPTOR = Object.freeze({
  id: "manual-repair-deletion-lifecycle-fixture",
  fixtureVersion: "1.0",
  mode: "test-only",
  productionReady: false,
  runtimeComposable: false,
  arbitrarySqlSupported: false,
  allowedTransition: "active-to-deleted",
} as const);

const catalog = Object.freeze({
  catalogVersion: "1.0" as const,
  statements: Object.freeze([Object.freeze({
    statementId: "test.reconciliation.repair.lifecycle.delete",
    sql: "UPDATE workflow.workflow_reconciliation_manual_repairs SET deletion_state='deleted', revision=revision+1, updated_at=transaction_timestamp() WHERE identity_digest_version=$1 AND identity_digest=$2 AND revision=$3 AND writer_epoch=$4 AND COALESCE(fencing_revision,0)=$5 AND deletion_state='active' AND legal_hold_state='none' RETURNING revision, updated_at",
    parameterCount: 5,
    cardinality: "single" as const,
    accessMode: "write" as const,
  })]),
});

export type ManualRepairDeletionFixtureInput = Readonly<{ identity: ProtectedIdentity<"manual-repair">; expectedRevision: string; expectedWriterEpoch: string; expectedFencingRevision: string }>;
export type ManualRepairDeletionFixtureResult = Readonly<{ status: "deleted"; revision: string; updatedAt: string } | { status: "lifecycle-conflict" | "unavailable" }>;

export const registerManualRepairLifecycleFixture = (registrar: PostgreSQLSliceAStatementCatalogRegistrar) => registrar.register(catalog);

export const createManualRepairLifecycleFixtureAdapter = () => Object.freeze({
  descriptor: MANUAL_REPAIR_LIFECYCLE_FIXTURE_DESCRIPTOR,
  async markDeleted(context: DurableWorkflowTransactionContext, input: ManualRepairDeletionFixtureInput): Promise<ManualRepairDeletionFixtureResult> {
    const result = await context.database.execute(Object.freeze({ commandVersion: "1.0", statementId: "test.reconciliation.repair.lifecycle.delete", parameters: Object.freeze([input.identity.algorithmVersion, Uint8Array.from(input.identity.digest), input.expectedRevision, input.expectedWriterEpoch, input.expectedFencingRevision]), expectedResult: "single" }));
    if (result.status === "not-found" || result.status === "cardinality-conflict") return Object.freeze({ status: "lifecycle-conflict" });
    if (result.status === "failure") return Object.freeze({ status: "unavailable" });
    const revision = result.rows[0]?.revision; const updatedAt = result.rows[0]?.updated_at;
    if ((typeof revision !== "string" && typeof revision !== "number") || typeof updatedAt !== "string") return Object.freeze({ status: "unavailable" });
    return Object.freeze({ status: "deleted", revision: String(revision), updatedAt });
  },
});
