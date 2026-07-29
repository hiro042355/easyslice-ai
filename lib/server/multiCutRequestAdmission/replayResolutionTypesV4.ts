import type {
  MultiCutReplayAuthoritativeIdentity,
  MultiCutReplayReservationEvidence,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";

export type MultiCutReplayResolutionContractVersionV4 = "4.0";

export type MultiCutReplayResolutionInputV4 = Readonly<{
  resolutionInputVersion: MultiCutReplayResolutionContractVersionV4;
  identity: MultiCutReplayAuthoritativeIdentity;
}>;

export type MultiCutReplayResolutionResultV4 =
  | Readonly<{
      resultVersion: MultiCutReplayResolutionContractVersionV4;
      status: "new";
      identity: MultiCutReplayAuthoritativeIdentity;
      reservationEvidence: MultiCutReplayReservationEvidence;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayResolutionContractVersionV4;
      status: "replay";
      identity: MultiCutReplayAuthoritativeIdentity;
      resultReference: MultiCutReplayResultReference;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayResolutionContractVersionV4;
      status:
        | "duplicate-in-flight"
        | "semantic-conflict"
        | "unavailable";
    }>
  | Readonly<{
      resultVersion: MultiCutReplayResolutionContractVersionV4;
      status: "authoritative-failed";
    }>;

export type MultiCutReplayResolutionCapabilityV4 = Readonly<{
  resolveReplay(
    input: MultiCutReplayResolutionInputV4,
  ): Promise<MultiCutReplayResolutionResultV4>;
}>;
