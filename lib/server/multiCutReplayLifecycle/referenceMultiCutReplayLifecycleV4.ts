import type {
  MultiCutReplayLifecycleCapabilityV4,
  MultiCutReplayLifecycleResultV4,
} from "./typesV4";

const preserveInputIdentity = (
  result: MultiCutReplayLifecycleResultV4,
  replayIdentity: Parameters<
    MultiCutReplayLifecycleCapabilityV4["transitionReplay"]
  >[0]["replayIdentity"],
): MultiCutReplayLifecycleResultV4 => {
  switch (result.status) {
    case "completed":
    case "failed":
    case "released":
    case "renewed":
      return Object.freeze({
        ...result,
        replayIdentity,
      });
    case "conflict":
    case "unavailable":
      return result;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
};

export const createReferenceMultiCutReplayLifecycleV4 = (
  dependency: MultiCutReplayLifecycleCapabilityV4,
): MultiCutReplayLifecycleCapabilityV4 =>
  Object.freeze({
    async transitionReplay(input) {
      try {
        const result = await dependency.transitionReplay(input);
        return preserveInputIdentity(result, input.replayIdentity);
      } catch {
        return Object.freeze({
          resultVersion: "4.0",
          status: "unavailable",
          failure: "internal-failure",
        });
      }
    },
  });
