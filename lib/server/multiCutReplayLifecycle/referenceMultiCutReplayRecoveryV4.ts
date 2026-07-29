import type {
  MultiCutReplayRecoveryCapabilityV4,
  MultiCutReplayRecoveryLookupResultV4,
  MultiCutReplayRecoveryTakeoverResultV4,
  MultiCutReplayReservationMutationReconciliationResultV4,
} from "./typesV4";

type RecoveryIdentity = Parameters<
  MultiCutReplayRecoveryCapabilityV4["lookupReplay"]
>[0]["replayIdentity"];

const preserveLookupIdentity = (
  result: MultiCutReplayRecoveryLookupResultV4,
  replayIdentity: RecoveryIdentity,
): MultiCutReplayRecoveryLookupResultV4 => {
  if (result.status !== "authoritative") return result;

  return Object.freeze({
    ...result,
    record: Object.freeze({
      ...result.record,
      replayIdentity,
    }),
  });
};

const preserveTakeoverIdentity = (
  result: MultiCutReplayRecoveryTakeoverResultV4,
  replayIdentity: RecoveryIdentity,
): MultiCutReplayRecoveryTakeoverResultV4 => {
  if (result.status !== "taken-over") return result;

  return Object.freeze({
    ...result,
    replayIdentity,
  });
};

const preserveReconciliationIdentity = (
  result: MultiCutReplayReservationMutationReconciliationResultV4,
  replayIdentity: RecoveryIdentity,
): MultiCutReplayReservationMutationReconciliationResultV4 => {
  switch (result.status) {
    case "confirmed":
    case "not-applied":
    case "terminal":
      return Object.freeze({
        ...result,
        replayIdentity,
      });
    case "conflict":
    case "not-found":
    case "corrupted":
    case "unavailable":
    case "reconciliation-required":
      return result;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
};

export const createReferenceMultiCutReplayRecoveryV4 = (
  dependency: MultiCutReplayRecoveryCapabilityV4,
): MultiCutReplayRecoveryCapabilityV4 =>
  Object.freeze({
    async lookupReplay(input) {
      try {
        const result = await dependency.lookupReplay(input);
        return preserveLookupIdentity(result, input.replayIdentity);
      } catch {
        return Object.freeze({
          resultVersion: "4.0",
          status: "unavailable",
          failure: "internal-failure",
        });
      }
    },
    async takeoverReplay(input) {
      try {
        const result = await dependency.takeoverReplay(input);
        return preserveTakeoverIdentity(result, input.replayIdentity);
      } catch {
        return Object.freeze({
          resultVersion: "4.0",
          status: "unavailable",
          failure: "internal-failure",
        });
      }
    },
    async reconcileReservationMutation(input) {
      try {
        const result =
          await dependency.reconcileReservationMutation(input);
        return preserveReconciliationIdentity(
          result,
          input.replayIdentity,
        );
      } catch {
        return Object.freeze({
          resultVersion: "4.0",
          status: "unavailable",
        });
      }
    },
  });
