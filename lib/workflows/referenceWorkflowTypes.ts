import type { AssetReference } from "@/lib/mvContracts";
import type { ReferenceMusicAdapterInput } from "@/lib/providers/referenceMusicAdapter";
import type { ReferenceMVAdapterInput } from "@/lib/providers/referenceMVAdapter";
import type { ReferenceVocalAdapterInput } from "@/lib/providers/referenceVocalAdapter";
import type { ReferenceWorkflowContext } from "./types";

type ReferenceWorkflowInputBase = Readonly<{
  contractVersion: "1.0";
  providerId: string;
  providerApiVersion: string;
  durationSeconds: number;
  context: ReferenceWorkflowContext;
  assets: readonly AssetReference[];
}>;

export type ReferenceVocalWorkflowInput = ReferenceWorkflowInputBase & Readonly<{
  operation: "generate-vocal";
  adapterInput: ReferenceVocalAdapterInput;
}>;

export type ReferenceMusicWorkflowInput = ReferenceWorkflowInputBase & Readonly<{
  operation: "generate-music";
  adapterInput: ReferenceMusicAdapterInput;
}>;

export type ReferenceMVWorkflowInput = ReferenceWorkflowInputBase & Readonly<{
  operation: "generate-mv";
  adapterInput: ReferenceMVAdapterInput;
}>;

export type ReferenceWorkflowInput =
  | ReferenceVocalWorkflowInput
  | ReferenceMusicWorkflowInput
  | ReferenceMVWorkflowInput;
