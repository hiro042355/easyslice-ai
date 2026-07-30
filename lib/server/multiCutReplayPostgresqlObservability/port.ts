import type {
  ReplayPostgresqlObservabilityEvent,
  ReplayPostgresqlObservabilityPort,
} from "./types";

const isPromiseLike = (
  value: unknown,
): value is PromiseLike<unknown> =>
  typeof value === "object" &&
  value !== null &&
  "then" in value &&
  typeof value.then === "function";

export const emitReplayPostgresqlEvent = (
  port: ReplayPostgresqlObservabilityPort,
  event: ReplayPostgresqlObservabilityEvent,
): void => {
  try {
    const emitted: unknown = port.emit(event);
    if (isPromiseLike(emitted)) {
      void Promise.resolve(emitted).catch(() => undefined);
    }
  } catch {
    // Observability is never authoritative for execution outcomes.
  }
};
