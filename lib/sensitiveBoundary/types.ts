import type { Sensitive } from "@/lib/assets/types";
import type {
  ReferenceMusicWorkflowInput,
  ReferenceMVWorkflowInput,
  ReferenceVocalWorkflowInput,
} from "@/lib/workflows/types";

export type SensitiveConstructionIssue = {
  reasonCode: "sensitive-construction-invalid";
};

export type SensitiveConstructionResult<T> =
  | { status: "created"; value: Sensitive<T> }
  | { status: "invalid"; issues: readonly SensitiveConstructionIssue[] };

export type SensitiveVocalWorkflowFixtureInputResult =
  SensitiveConstructionResult<ReferenceVocalWorkflowInput>;
export type SensitiveMusicWorkflowFixtureInputResult =
  SensitiveConstructionResult<ReferenceMusicWorkflowInput>;
export type SensitiveMVWorkflowFixtureInputResult =
  SensitiveConstructionResult<ReferenceMVWorkflowInput>;
