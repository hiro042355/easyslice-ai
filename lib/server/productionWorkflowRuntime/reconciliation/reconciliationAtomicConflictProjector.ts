import type { ReconciliationAtomicConflictClass } from "../postgresqlReconciliationStores";

export type ReconciliationAtomicConflictAction = "authoritative-reread" | "stop-stale-worker" | "wait-for-writer-authority" | "reevaluate-state" | "fail-conflict" | "preserve-terminal";

export const projectReconciliationAtomicConflictV1 = (conflictClass: ReconciliationAtomicConflictClass): ReconciliationAtomicConflictAction => {
  switch (conflictClass) {
    case "stale-revision": return "authoritative-reread";
    case "stale-fence": return "stop-stale-worker";
    case "writer-epoch-mismatch": return "wait-for-writer-authority";
    case "wrong-prior-state": return "reevaluate-state";
    case "semantic-conflict": return "fail-conflict";
    case "terminal-preserved": return "preserve-terminal";
  }
};
