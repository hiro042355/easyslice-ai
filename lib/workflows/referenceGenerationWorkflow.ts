import type {
  OperationPipelineInput,
  OperationPipelineResult,
  OperationPipelineRetryRecommendation,
} from "../operationPipelines/types";
import type {
  WorkflowAudit,
  WorkflowAuditEntry,
  WorkflowCancellationMarker,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowInput,
  WorkflowPipelineReference,
  WorkflowReconciliationRecommendation,
  WorkflowResult,
  WorkflowRetryRecommendation,
  WorkflowStageDefinition,
} from "./types";

export type ReferenceWorkflowValue =
  | null
  | boolean
  | number
  | string
  | readonly ReferenceWorkflowValue[]
  | Readonly<{ [key: string]: ReferenceWorkflowValue }>;

export type ReferenceWorkflowPipelineCapability = Readonly<{
  execute(
    input: OperationPipelineInput<Readonly<{ [key: string]: ReferenceWorkflowValue }>>,
  ): Promise<OperationPipelineResult<Readonly<{ [key: string]: ReferenceWorkflowValue }>>>;
}>;

export type ReferenceWorkflowPipelineResolver = Readonly<{
  resolve(reference: WorkflowPipelineReference): ReferenceWorkflowPipelineCapability | undefined;
}>;

export type ReferenceWorkflowCancellation = Readonly<{
  check(input: Readonly<{
    point: "before-workflow" | "before-stage" | "after-stage";
    stageId?: string;
  }>): boolean;
}>;

export type ReferenceWorkflowRuntimeDependencies = Readonly<{
  definition: WorkflowDefinition;
  pipelines: ReferenceWorkflowPipelineResolver;
  cancellation: ReferenceWorkflowCancellation;
}>;

export type ReferenceWorkflowExecutionSnapshot = Readonly<{
  snapshotVersion: "1.0";
  status: "completed" | "partial";
  stageOutputs: readonly Readonly<{
    stageId: string;
    output: Readonly<{ [key: string]: ReferenceWorkflowValue }>;
  }>[];
  failedStageIds: readonly string[];
  skippedStageIds: readonly string[];
}>;

export type ReferenceGenerationWorkflowResult = WorkflowResult<ReferenceWorkflowExecutionSnapshot>;

const copyValue = (value: ReferenceWorkflowValue): ReferenceWorkflowValue => {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyValue(child)]));
  }
  return value;
};

const copyRecord = (
  value: Readonly<{ [key: string]: ReferenceWorkflowValue }>,
): Readonly<{ [key: string]: ReferenceWorkflowValue }> =>
  Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyValue(child)]));

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const validDefinition = (definition: WorkflowDefinition): boolean => {
  if (definition.contractVersion !== "1.0" || definition.stages.length === 0) return false;
  const ids = definition.stages.map((stage) => stage.identity.stageId);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) return false;
  if (definition.stages.some((stage) =>
    stage.identity.workflow.workflowId !== definition.identity.workflowId ||
    stage.identity.workflow.workflowVersion !== definition.identity.workflowVersion ||
    !Number.isSafeInteger(stage.order) ||
    stage.order < 0 ||
    stage.pipeline.referenceVersion !== "1.0" ||
    [stage.pipeline.pipelineId, stage.pipeline.pipelineVersion, stage.pipeline.operationId,
      stage.pipeline.operationVersion, stage.pipeline.bindingId, stage.pipeline.bindingVersion]
      .some((value) => value.length === 0)
  )) return false;
  const orderSet = new Set(definition.stages.map((stage) => stage.order));
  if (orderSet.size !== definition.stages.length) return false;
  const indegree = new Map(ids.map((id) => [id, 0]));
  const successors = new Map(ids.map((id) => [id, [] as string[]]));
  const edges = new Set<string>();
  for (const dependency of definition.dependencies) {
    if (!idSet.has(dependency.predecessorStageId) || !idSet.has(dependency.successorStageId)) return false;
    const key = `${dependency.predecessorStageId.length}:${dependency.predecessorStageId}${dependency.successorStageId.length}:${dependency.successorStageId}`;
    if (edges.has(key)) return false;
    edges.add(key);
    successors.get(dependency.predecessorStageId)?.push(dependency.successorStageId);
    indegree.set(dependency.successorStageId, (indegree.get(dependency.successorStageId) ?? 0) + 1);
  }
  const ready = ids.filter((id) => indegree.get(id) === 0).sort();
  let visited = 0;
  for (let index = 0; index < ready.length; index += 1) {
    const id = ready[index];
    if (id === undefined) continue;
    visited += 1;
    for (const successor of successors.get(id) ?? []) {
      const next = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, next);
      if (next === 0) ready.push(successor);
    }
  }
  return visited === ids.length;
};

const retryRank = (value: WorkflowRetryRecommendation): number => {
  if (value.recommendation === "wait") return 2;
  if (value.recommendation === "retry") return 1;
  return 0;
};

const aggregateRetry = (
  current: WorkflowRetryRecommendation,
  candidate: WorkflowRetryRecommendation,
): WorkflowRetryRecommendation => retryRank(candidate) > retryRank(current) ? candidate : current;

const mapPipelineAdvice = (
  retry: OperationPipelineRetryRecommendation,
): Readonly<{
  retry: WorkflowRetryRecommendation;
  reconciliation: WorkflowReconciliationRecommendation;
}> => {
  if (retry.recommendation === "reconcile") {
    return {
      retry: { recommendation: "do-not-retry" },
      reconciliation: { recommendation: "reconcile", reasonCode: "outcome-unknown" },
    };
  }
  if (retry.recommendation === "wait") {
    return {
      retry: { recommendation: "wait", retryClass: "external-state" },
      reconciliation: { recommendation: "none" },
    };
  }
  if (retry.recommendation === "retry") {
    return {
      retry: { recommendation: "retry", retryClass: "transient" },
      reconciliation: { recommendation: "none" },
    };
  }
  return { retry: { recommendation: "do-not-retry" }, reconciliation: { recommendation: "none" } };
};

const createAudit = (
  definition: WorkflowDefinition,
  stages: readonly WorkflowStageDefinition[],
  entries: readonly WorkflowAuditEntry[],
  reasonCodes: readonly string[],
): WorkflowAudit => deepFreeze({
  auditVersion: "1.0",
  workflow: { ...definition.identity },
  initialStageId: stages[0]?.identity.stageId ?? "unavailable",
  finalStageId: entries.at(-1)?.stageId ?? stages[0]?.identity.stageId ?? "unavailable",
  entries: entries.map((entry) => ({ ...entry })),
  reasonCodes: [...reasonCodes],
});

const pipelineInput = (
  stage: WorkflowStageDefinition,
  value: Readonly<{ [key: string]: ReferenceWorkflowValue }>,
  context: WorkflowContext,
): OperationPipelineInput<Readonly<{ [key: string]: ReferenceWorkflowValue }>> => ({
  inputVersion: "1.0",
  operation: {
    operationId: stage.pipeline.operationId,
    operationVersion: stage.pipeline.operationVersion,
  },
  initialStageId: stage.identity.stageId,
  payload: copyRecord(value),
  context: {
    contextVersion: "1.0",
    operationRef: context.workflowRef,
    attempt: context.attempt,
    baselineTime: context.baselineTime,
    cancellation: context.cancellation.status === "requested"
      ? { status: "cancelled", reasonCode: "operation-cancelled" }
      : { status: "active" },
  },
});

export class ReferenceGenerationWorkflow {
  readonly #definition: WorkflowDefinition;
  readonly #pipelines: ReferenceWorkflowPipelineResolver;
  readonly #cancellation: ReferenceWorkflowCancellation;

  constructor(dependencies: ReferenceWorkflowRuntimeDependencies) {
    this.#definition = deepFreeze({
      ...dependencies.definition,
      identity: { ...dependencies.definition.identity },
      stages: dependencies.definition.stages.map((stage) => ({
        ...stage,
        identity: { ...stage.identity, workflow: { ...stage.identity.workflow } },
        pipeline: { ...stage.pipeline },
      })),
      dependencies: dependencies.definition.dependencies.map((dependency) => ({ ...dependency })),
    });
    this.#pipelines = dependencies.pipelines;
    this.#cancellation = dependencies.cancellation;
  }

  async execute(
    input: WorkflowInput<Readonly<{ [key: string]: ReferenceWorkflowValue }>>,
  ): Promise<ReferenceGenerationWorkflowResult> {
    const stages = [...this.#definition.stages]
      .sort((left, right) => left.order - right.order || left.identity.stageId.localeCompare(right.identity.stageId));
    const entries: WorkflowAuditEntry[] = [];
    const reasons: string[] = [];
    const failedStageIds: string[] = [];
    const skippedStageIds: string[] = [];
    const stageOutputs: { stageId: string; output: Readonly<{ [key: string]: ReferenceWorkflowValue }> }[] = [];
    let value = deepFreeze(copyRecord(input.payload));
    let retry: WorkflowRetryRecommendation = { recommendation: "do-not-retry" };
    let reconciliation: WorkflowReconciliationRecommendation = { recommendation: "none" };

    const addEntry = (stageId: string, state: WorkflowAuditEntry["state"], reasonCode: string): void => {
      entries.push({ entryVersion: "1.0", sequence: entries.length, stageId, state, reasonCode });
      reasons.push(reasonCode);
    };
    const audit = (): WorkflowAudit => createAudit(this.#definition, stages, entries, reasons);
    const base = () => ({
      resultVersion: "1.0" as const,
      workflow: { ...this.#definition.identity },
      retry,
      reconciliation,
      audit: audit(),
    });

    if (!validDefinition(this.#definition) ||
      input.workflow.workflowId !== this.#definition.identity.workflowId ||
      input.workflow.workflowVersion !== this.#definition.identity.workflowVersion) {
      const stageId = stages[0]?.identity.stageId ?? "unavailable";
      addEntry(stageId, "failed", "workflow-definition-invalid");
      return deepFreeze({ ...base(), status: "failed", failedStageId: stageId });
    }
    if (this.#cancellation.check({ point: "before-workflow" }) || input.context.cancellation.status === "requested") {
      const stageId = stages[0]?.identity.stageId;
      addEntry(stageId ?? "unavailable", "cancelled", "workflow-cancelled");
      return deepFreeze({ ...base(), status: "cancelled", ...(stageId === undefined ? {} : { cancelledStageId: stageId }) });
    }

    for (const stage of stages) {
      const stageId = stage.identity.stageId;
      if (this.#cancellation.check({ point: "before-stage", stageId })) {
        addEntry(stageId, "cancelled", "workflow-cancelled");
        return deepFreeze({ ...base(), status: "cancelled", cancelledStageId: stageId });
      }
      const pipeline = this.#pipelines.resolve(stage.pipeline);
      if (pipeline === undefined) {
        addEntry(stageId, "failed", "pipeline-reference-unresolved");
        if (stage.requirement === "required") return deepFreeze({ ...base(), status: "failed", failedStageId: stageId });
        failedStageIds.push(stageId);
        continue;
      }
      const result = await pipeline.execute(pipelineInput(stage, value, input.context));
      const advice = mapPipelineAdvice(result.status === "completed" ? result.output.retry : result.retry);
      retry = aggregateRetry(retry, advice.retry);
      if (advice.reconciliation.recommendation !== "none") reconciliation = advice.reconciliation;

      if (result.status === "completed") {
        value = deepFreeze(copyRecord(result.output.payload));
        stageOutputs.push({ stageId, output: value });
        addEntry(stageId, "completed", "workflow-stage-completed");
      } else if (result.status === "cancelled") {
        addEntry(stageId, "cancelled", "workflow-cancelled");
        return deepFreeze({ ...base(), status: "cancelled", cancelledStageId: stageId });
      } else if (result.status === "reconciliation-required" || reconciliation.recommendation !== "none") {
        addEntry(stageId, "recovery-required", "workflow-recovery-required");
        return deepFreeze({ ...base(), status: "recovery-required", recoveryStageId: stageId });
      } else {
        addEntry(stageId, "failed", "workflow-stage-failed");
        if (stage.requirement === "required") return deepFreeze({ ...base(), status: "failed", failedStageId: stageId });
        failedStageIds.push(stageId);
      }
      if (this.#cancellation.check({ point: "after-stage", stageId })) {
        addEntry(stageId, "cancelled", "workflow-cancelled");
        return deepFreeze({ ...base(), status: "cancelled", cancelledStageId: stageId });
      }
    }

    const snapshot: ReferenceWorkflowExecutionSnapshot = deepFreeze({
      snapshotVersion: "1.0",
      status: failedStageIds.length === 0 ? "completed" : "partial",
      stageOutputs: stageOutputs.map((entry) => ({ stageId: entry.stageId, output: copyRecord(entry.output) })),
      failedStageIds: [...failedStageIds],
      skippedStageIds: [...skippedStageIds],
    });
    const output = { outputVersion: "1.0" as const, workflow: { ...this.#definition.identity }, payload: snapshot };
    if (failedStageIds.length > 0) {
      return deepFreeze({ ...base(), status: "partial", output, failedStageIds: [...failedStageIds], skippedStageIds: [...skippedStageIds] });
    }
    return deepFreeze({ ...base(), status: "completed", output });
  }
}
