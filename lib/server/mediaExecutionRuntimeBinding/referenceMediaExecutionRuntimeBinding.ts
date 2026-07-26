import { ReferenceMediaExecutionComposition } from "../mediaExecutionComposition/referenceMediaExecutionComposition";
import type { MediaExecutionCompositionDependencies } from "../mediaExecutionComposition/types";
import type {
  MediaExecutionRuntimeBindingAuditEntry,
  MediaExecutionRuntimeBindingFailureClassification,
  MediaExecutionRuntimeBindingResult,
} from "./types";

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" &&
    !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const methodSet = {
  workspace: ["reserve", "prepare", "lookup", "cleanup"],
  materialization: ["materialize"],
  ffmpeg: ["execute"],
  packaging: ["package"],
} as const;

type DependencyKey = keyof typeof methodSet;

const missingClassification: Readonly<Record<DependencyKey,
  MediaExecutionRuntimeBindingFailureClassification>> = {
  workspace: "missing-workspace",
  materialization: "missing-materialization",
  ffmpeg: "missing-ffmpeg",
  packaging: "missing-packaging",
};

const dependencyRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;

const rejection = (
  classification: MediaExecutionRuntimeBindingFailureClassification,
  entries: readonly MediaExecutionRuntimeBindingAuditEntry[],
): MediaExecutionRuntimeBindingResult => deepFreeze({
  resultVersion: "1.0",
  status: "rejected",
  classification,
  audit: {
    auditVersion: "1.0",
    entries: entries.map((entry) => ({ ...entry })),
  },
});

export class ReferenceMediaExecutionRuntimeBinding {
  createComposition(dependencies: unknown): MediaExecutionRuntimeBindingResult {
    const entries: MediaExecutionRuntimeBindingAuditEntry[] = [];
    const audit = (
      stage: MediaExecutionRuntimeBindingAuditEntry["stage"],
      outcome: MediaExecutionRuntimeBindingAuditEntry["outcome"],
      reasonCode: string,
    ): void => {
      entries.push({
        entryVersion: "1.0",
        sequence: entries.length,
        stage,
        outcome,
        reasonCode,
      });
    };

    try {
      const source = dependencyRecord(dependencies);
      if (!source) {
        audit("dependency-validation", "rejected", "invalid-dependency");
        return rejection("invalid-dependency", entries);
      }

      const validated: Partial<Record<DependencyKey, object>> = {};
      for (const key of Object.keys(methodSet) as DependencyKey[]) {
        const candidate = source[key];
        if (candidate === null || candidate === undefined) {
          audit("dependency-validation", "rejected", missingClassification[key]);
          return rejection(missingClassification[key], entries);
        }
        const record = dependencyRecord(candidate);
        if (!record || methodSet[key].some((method) => typeof record[method] !== "function")) {
          audit("dependency-validation", "rejected", "invalid-dependency");
          return rejection("invalid-dependency", entries);
        }
        validated[key] = candidate as object;
      }
      audit("dependency-validation", "accepted", "dependencies-valid");

      let composition: ReferenceMediaExecutionComposition;
      try {
        composition = new ReferenceMediaExecutionComposition(
          validated as MediaExecutionCompositionDependencies,
        );
      } catch {
        audit("composition-construction", "rejected", "construction-failed");
        return rejection("construction-failed", entries);
      }
      audit("composition-construction", "bound", "composition-constructed");
      audit("capability-projection", "bound", "composition-capability-bound");

      return deepFreeze({
        resultVersion: "1.0",
        status: "bound",
        composition,
        audit: {
          auditVersion: "1.0",
          entries: entries.map((entry) => ({ ...entry })),
        },
      });
    } catch {
      audit("dependency-validation", "rejected", "unexpected-failure");
      return rejection("unexpected-failure", entries);
    }
  }
}
