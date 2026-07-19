import type { ReconciliationRequestState } from "./types";

const ALLOWED: Readonly<Record<ReconciliationRequestState, readonly ReconciliationRequestState[]>> = Object.freeze({
  "pending-observation": Object.freeze(["claimed"] as ReconciliationRequestState[]),
  claimed: Object.freeze(["observing", "retry-wait"] as ReconciliationRequestState[]),
  observing: Object.freeze(["retry-wait", "resolved", "still-unknown", "corrupted", "manual-repair-required"] as ReconciliationRequestState[]),
  "retry-wait": Object.freeze(["claimed"] as ReconciliationRequestState[]),
  resolved: Object.freeze([]),
  "still-unknown": Object.freeze([]),
  corrupted: Object.freeze([]),
  "manual-repair-required": Object.freeze([]),
  cancelled: Object.freeze([]),
});

export const canTransitionReconciliation = (from: ReconciliationRequestState, to: ReconciliationRequestState): boolean => ALLOWED[from].includes(to);
export const listReconciliationTransitions = (): Readonly<Record<ReconciliationRequestState, readonly ReconciliationRequestState[]>> => Object.freeze(Object.fromEntries(Object.entries(ALLOWED).map(([key, values]) => [key, Object.freeze([...values])]))) as Readonly<Record<ReconciliationRequestState, readonly ReconciliationRequestState[]>>;
