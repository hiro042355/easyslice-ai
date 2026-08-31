import type { Sensitive } from "@/lib/assets/types";
import type { DirectorPreset } from "@/lib/emotionEngine";
import type {
  ReferenceMusicWorkflowInput,
  ReferenceMVWorkflowInput,
  ReferenceVocalWorkflowInput,
} from "@/lib/workflows/types";

export type CanonicalWorkflowFixtureSeed = {
  fixtureVersion: "1.0";
  story: string;
  theme: string;
  mood: string;
  lyrics: string;
  language: string;
  durationSeconds: number;
  directorPreset: DirectorPreset;
};
export type CanonicalWorkflowFixtureId =
  | "canonical-vocal-success-v1"
  | "canonical-music-success-v1"
  | "canonical-mv-success-v1";
export type CanonicalWorkflowFixtureMetadata = {
  fixtureId: CanonicalWorkflowFixtureId;
  fixtureVersion: "1.0";
  directorPreset: DirectorPreset;
  durationClass: "standard";
};
export type CanonicalWorkflowFixtureIssue = {
  reasonCode: "canonical-fixture-invalid" | "canonical-fixture-unsupported";
};
export type CanonicalWorkflowFixtureResult =
  | { status: "ready"; operation: "generate-vocal"; input: Sensitive<ReferenceVocalWorkflowInput>; metadata: CanonicalWorkflowFixtureMetadata }
  | { status: "ready"; operation: "generate-music"; input: Sensitive<ReferenceMusicWorkflowInput>; metadata: CanonicalWorkflowFixtureMetadata }
  | { status: "ready"; operation: "generate-mv"; input: Sensitive<ReferenceMVWorkflowInput>; metadata: CanonicalWorkflowFixtureMetadata }
  | { status: "invalid" | "unsupported"; issues: readonly CanonicalWorkflowFixtureIssue[] };
export type CanonicalWorkflowFixtureDescriptor = CanonicalWorkflowFixtureMetadata & {
  operation: "generate-vocal" | "generate-music" | "generate-mv";
  availability: "available";
};
