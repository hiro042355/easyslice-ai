import type { DurableCommitUnknownResolution, DurableStoreFailureClass, DurableStoreFailureController, DurableStoreFailureOperation } from "./types";

export function createDurableStoreFailureController(): DurableStoreFailureController {
  const failures = new Map<DurableStoreFailureOperation, Readonly<{ failure: DurableStoreFailureClass; resolution: DurableCommitUnknownResolution }>>();
  return Object.freeze({
    controllerVersion: "1.0" as const,
    inject(operation: DurableStoreFailureOperation, failure: DurableStoreFailureClass, resolution: DurableCommitUnknownResolution = "still-unknown") {
      failures.set(operation, Object.freeze({ failure, resolution }));
      return "injected" as const;
    },
    consume(operation: DurableStoreFailureOperation) {
      const value = failures.get(operation);
      failures.delete(operation);
      return value;
    },
    reset() {
      failures.clear();
    },
  });
}
