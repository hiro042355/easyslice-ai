import type { ReconciliationExpectedPriorStates, ReconciliationRequestNonTerminalState } from "./types";

const NON_TERMINAL_STATES = Object.freeze(["pending-observation", "claimed", "observing", "retry-wait"] as const);

export const isReconciliationRequestNonTerminalState = (value: unknown): value is ReconciliationRequestNonTerminalState =>
  typeof value === "string" && NON_TERMINAL_STATES.some(state => state === value);

export const normalizeExpectedPriorStates = (value: unknown): ReconciliationExpectedPriorStates | undefined => {
  const source = Array.isArray(value) ? value : [value];
  if (source.length === 0 || source.some(item => !isReconciliationRequestNonTerminalState(item))) return undefined;
  const normalized = source.filter((state, index) => source.indexOf(state) === index);
  if (normalized.length !== source.length) return undefined;
  const [first, ...rest] = normalized as ReconciliationRequestNonTerminalState[];
  return first === undefined ? undefined : Object.freeze([first, ...rest]);
};
