import type {
  MediaExecutionCleanupClassification,
  MediaExecutionCompositionAuditEntry,
  MediaExecutionCompositionClassification,
  MediaExecutionCompositionDependencies,
  MediaExecutionCompositionDecision,
  MediaExecutionCompositionInput,
  MediaExecutionCompositionReasonCode,
  MediaExecutionCompositionStage,
} from "./types";

type PrimaryDecision = Readonly<{
  classification: MediaExecutionCompositionClassification;
  reasonCode: MediaExecutionCompositionReasonCode;
  responseArchive?: Uint8Array;
}>;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" &&
    !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export class ReferenceMediaExecutionComposition {
  readonly #dependencies: Partial<MediaExecutionCompositionDependencies>;

  constructor(dependencies: Partial<MediaExecutionCompositionDependencies>) {
    this.#dependencies = dependencies;
  }

  async execute(
    input: MediaExecutionCompositionInput,
  ): Promise<MediaExecutionCompositionDecision> {
    const audit: MediaExecutionCompositionAuditEntry[] = [];
    const missing = this.#missingDependency();
    if (missing || !input || input.inputVersion !== "1.0") {
      const primary: PrimaryDecision = {
        classification: "invalid",
        reasonCode: missing ? "dependency-missing" : "dependency-failure",
      };
      this.#audit(audit, "dependency-validation", primary, "not-required");
      return this.#decision(primary, "not-required", audit);
    }

    const dependencies = this.#dependencies as MediaExecutionCompositionDependencies;
    let workspaceAcquired = false;
    let primary: PrimaryDecision = {
      classification: "unavailable",
      reasonCode: "dependency-failure",
    };
    let cleanupClassification: MediaExecutionCleanupClassification = "not-required";

    try {
      const reserved = await dependencies.workspace.reserve(input.workspaceRequest);
      if (reserved.classification !== "available") {
        primary = {
          classification: reserved.classification === "rejected" ? "failed" : "unavailable",
          reasonCode: "workspace-unavailable",
        };
        this.#audit(audit, "workspace-reservation", primary, cleanupClassification);
        return this.#decision(primary, cleanupClassification, audit);
      }
      workspaceAcquired = true;

      const prepared = await dependencies.workspace.prepare(input.workspaceRequest);
      if (prepared.classification !== "available") {
        primary = {
          classification: prepared.classification === "rejected" ? "failed" : "unavailable",
          reasonCode: "workspace-unavailable",
        };
        this.#audit(audit, "workspace-reservation", primary, cleanupClassification);
      } else {
        this.#audit(audit, "workspace-reservation", {
          classification: "completed", reasonCode: "execution-completed",
        }, cleanupClassification);
        primary = await this.#executePrimary(input, dependencies, audit);
      }
    } catch {
      primary = {
        classification: "unavailable",
        reasonCode: "dependency-failure",
      };
      this.#audit(audit, this.#nextStage(audit), primary, cleanupClassification);
    } finally {
      if (workspaceAcquired) {
        try {
          const cleanup = await dependencies.workspace.cleanup(input.workspaceRequest);
          cleanupClassification =
            cleanup.cleanupClassification === "completed" ? "completed" :
            cleanup.cleanupClassification === "failed" ? "failed" : "unavailable";
        } catch {
          cleanupClassification = "unavailable";
        }
        this.#audit(audit, "workspace-cleanup", primary, cleanupClassification);
      }
    }

    this.#audit(audit, "final-decision", primary, cleanupClassification);
    return this.#decision(primary, cleanupClassification, audit);
  }

  async #executePrimary(
    input: MediaExecutionCompositionInput,
    dependencies: MediaExecutionCompositionDependencies,
    audit: MediaExecutionCompositionAuditEntry[],
  ): Promise<PrimaryDecision> {
    const materialized = await dependencies.materialization.materialize(
      input.materializationRequest,
      input.materializationContext,
    );
    if (materialized.classification !== "materialized") {
      const primary: PrimaryDecision = {
        classification: materialized.classification === "unavailable" ? "unavailable" : "failed",
        reasonCode: "materialization-failed",
      };
      this.#audit(audit, "input-materialization", primary, "not-required");
      return primary;
    }
    this.#audit(audit, "input-materialization", {
      classification: "completed", reasonCode: "execution-completed",
    }, "not-required");

    const process = await dependencies.ffmpeg.execute(input.ffmpegRequest);
    if (process.classification !== "success") {
      const primary: PrimaryDecision = {
        classification:
          process.classification === "timeout" ? "timed-out" :
          process.classification === "cancelled" ? "cancelled" :
          process.classification === "dependency-failure" ||
            process.classification === "spawn-failure" ? "unavailable" : "failed",
        reasonCode: "ffmpeg-failed",
      };
      this.#audit(audit, "ffmpeg-execution", primary, "not-required");
      return primary;
    }
    this.#audit(audit, "ffmpeg-execution", {
      classification: "completed", reasonCode: "execution-completed",
    }, "not-required");

    const packaged = await dependencies.packaging.package(input.packagingRequest);
    if (packaged.classification !== "packaged" || !packaged.archive) {
      const primary: PrimaryDecision = {
        classification: packaged.classification === "unavailable" ? "unavailable" : "failed",
        reasonCode: "packaging-failed",
      };
      this.#audit(audit, "zip-packaging", primary, "not-required");
      return primary;
    }
    this.#audit(audit, "zip-packaging", {
      classification: "completed", reasonCode: "execution-completed",
    }, "not-required");

    try {
      const content = await dependencies.responseRepresentation.readArchive(packaged.archive);
      const primary: PrimaryDecision = {
        classification: "completed",
        reasonCode: "execution-completed",
        responseArchive: new Uint8Array(content),
      };
      this.#audit(audit, "response-representation", primary, "not-required");
      return primary;
    } catch {
      const primary: PrimaryDecision = {
        classification: "unavailable",
        reasonCode: "response-representation-failed",
      };
      this.#audit(audit, "response-representation", primary, "not-required");
      return primary;
    }
  }

  #missingDependency(): boolean {
    return !this.#dependencies.workspace ||
      !this.#dependencies.materialization ||
      !this.#dependencies.ffmpeg ||
      !this.#dependencies.packaging ||
      !this.#dependencies.responseRepresentation;
  }

  #nextStage(audit: readonly MediaExecutionCompositionAuditEntry[]): MediaExecutionCompositionStage {
    const completed = new Set(audit.map((entry) => entry.stage));
    if (!completed.has("workspace-reservation")) return "workspace-reservation";
    if (!completed.has("input-materialization")) return "input-materialization";
    if (!completed.has("ffmpeg-execution")) return "ffmpeg-execution";
    if (!completed.has("zip-packaging")) return "zip-packaging";
    return "response-representation";
  }

  #audit(
    entries: MediaExecutionCompositionAuditEntry[],
    stage: MediaExecutionCompositionStage,
    primary: PrimaryDecision,
    cleanupClassification: MediaExecutionCleanupClassification,
  ): void {
    entries.push({
      entryVersion: "1.0",
      sequence: entries.length,
      stage,
      classification: primary.classification,
      reasonCode: primary.reasonCode,
      cleanupClassification,
    });
  }

  #decision(
    primary: PrimaryDecision,
    cleanupClassification: MediaExecutionCleanupClassification,
    entries: readonly MediaExecutionCompositionAuditEntry[],
  ): MediaExecutionCompositionDecision {
    return deepFreeze({
      decisionVersion: "1.0",
      classification: primary.classification,
      reasonCode: primary.reasonCode,
      cleanupClassification,
      ...(primary.responseArchive
        ? { responseArchive: new Uint8Array(primary.responseArchive) }
        : {}),
      audit: {
        auditVersion: "1.0",
        entries: entries.map((entry) => ({ ...entry })),
      },
    });
  }
}
