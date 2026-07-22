import {
  createOperationBindingFoundation,
  type OperationBindingEdge,
  type OperationBindingFoundation,
} from "./operationBindings";
import type {
  OperationPipelineAudit,
  OperationPipelineContext,
  OperationPipelineDefinition,
  OperationPipelineInput,
  OperationPipelineResult,
  OperationPipelineRetryRecommendation,
  OperationPipelineStageId,
} from "./types";

export type ReferenceOperationValue =
  | null
  | boolean
  | number
  | string
  | readonly ReferenceOperationValue[]
  | Readonly<{ [key: string]: ReferenceOperationValue }>;

export type ReferenceOperationResult =
  | Readonly<{
      status: "completed";
      output: Readonly<{ [key: string]: ReferenceOperationValue }>;
      retry: OperationPipelineRetryRecommendation;
      reasonCodes: readonly string[];
    }>
  | Readonly<{
      status: "failed";
      retry: OperationPipelineRetryRecommendation;
      reasonCodes: readonly string[];
    }>;

export type ReferenceOperation = Readonly<{
  stageId: OperationPipelineStageId;
  requirement: "required" | "optional";
  execute(input: Readonly<{
    value: Readonly<{ [key: string]: ReferenceOperationValue }>;
    context: OperationPipelineContext;
  }>): Promise<ReferenceOperationResult>;
}>;

export type ReferenceOperationCancellation = Readonly<{
  check(input: Readonly<{
    point: "before-pipeline" | "before-operation" | "after-operation";
    stageId?: OperationPipelineStageId;
  }>): boolean;
}>;

export type ReferenceOperationPipelineDependencies = Readonly<{
  definition: OperationPipelineDefinition;
  bindingEdges: readonly OperationBindingEdge[];
  operations: readonly ReferenceOperation[];
  cancellation: ReferenceOperationCancellation;
}>;

export type ReferenceOperationExecutionSnapshot = Readonly<{
  snapshotVersion: "1.0";
  status: "completed" | "degraded";
  stageOutputs: readonly Readonly<{
    stageId: OperationPipelineStageId;
    output: Readonly<{ [key: string]: ReferenceOperationValue }>;
  }>[];
  optionalFailureStageIds: readonly OperationPipelineStageId[];
}>;

export type ReferenceOperationPipelineResult = OperationPipelineResult<ReferenceOperationExecutionSnapshot>;

const copyValue = (value: ReferenceOperationValue): ReferenceOperationValue => {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyValue(child)]));
  }
  return value;
};

const copyRecord = (
  value: Readonly<{ [key: string]: ReferenceOperationValue }>,
): Readonly<{ [key: string]: ReferenceOperationValue }> =>
  Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyValue(child)]));

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const retryRank = (value: OperationPipelineRetryRecommendation): number => {
  if (value.recommendation === "reconcile") return 3;
  if (value.recommendation === "wait") return 2;
  if (value.recommendation === "retry") return 1;
  return 0;
};

const aggregateRetry = (
  current: OperationPipelineRetryRecommendation,
  candidate: OperationPipelineRetryRecommendation,
): OperationPipelineRetryRecommendation => retryRank(candidate) > retryRank(current) ? candidate : current;

const isValueRecord = (
  value: ReferenceOperationValue,
): value is Readonly<{ [key: string]: ReferenceOperationValue }> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readPath = (
  value: Readonly<{ [key: string]: ReferenceOperationValue }>,
  path: readonly string[],
): ReferenceOperationValue | undefined => {
  let current: ReferenceOperationValue | undefined = value;
  for (const part of path) {
    if (current === undefined || !isValueRecord(current)) return undefined;
    current = current[part];
  }
  return current;
};

const writePath = (
  target: { [key: string]: ReferenceOperationValue },
  path: readonly string[],
  value: ReferenceOperationValue,
): void => {
  let current = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const part = path[index];
    if (part === undefined) return;
    const child: { [key: string]: ReferenceOperationValue } = {};
    current[part] = child;
    current = child;
  }
  const finalPart = path[path.length - 1];
  if (finalPart !== undefined) current[finalPart] = copyValue(value);
};

const projectInput = (
  stageId: OperationPipelineStageId,
  foundation: OperationBindingFoundation,
  outputs: ReadonlyMap<OperationPipelineStageId, Readonly<{ [key: string]: ReferenceOperationValue }>>,
): Readonly<{ [key: string]: ReferenceOperationValue }> => {
  const projected: { [key: string]: ReferenceOperationValue } = {};
  for (const edge of foundation.edges.filter((candidate) => candidate.successorStageId === stageId)) {
    const source = outputs.get(edge.predecessorStageId);
    if (source === undefined) continue;
    for (const mapping of edge.mappings) {
      const value = readPath(source, mapping.source.path);
      if (value !== undefined) writePath(projected, mapping.target.path, value);
    }
  }
  return deepFreeze(projected);
};

const createAudit = (
  definition: OperationPipelineDefinition,
  initialStageId: OperationPipelineStageId,
  finalStageId: OperationPipelineStageId,
  visitedStageIds: readonly OperationPipelineStageId[],
  reasonCodes: readonly string[],
): OperationPipelineAudit => deepFreeze({
  auditVersion: "1.0",
  operation: { ...definition.operation },
  pipelineId: definition.pipelineId,
  pipelineVersion: definition.pipelineVersion,
  initialStageId,
  finalStageId,
  visitedStageIds: [...visitedStageIds],
  transitionCount: Math.max(visitedStageIds.length - 1, 0),
  reasonCodes: [...reasonCodes],
});

export class ReferenceOperationPipeline {
  readonly #definition: OperationPipelineDefinition;
  readonly #foundation: OperationBindingFoundation | undefined;
  readonly #operations: ReadonlyMap<OperationPipelineStageId, ReferenceOperation>;
  readonly #cancellation: ReferenceOperationCancellation;

  constructor(dependencies: ReferenceOperationPipelineDependencies) {
    this.#definition = deepFreeze({
      ...dependencies.definition,
      operation: { ...dependencies.definition.operation },
      stages: dependencies.definition.stages.map((stage) => ({ ...stage })),
      dependencies: dependencies.definition.dependencies.map((dependency) => ({ ...dependency })),
    });
    const bindings = createOperationBindingFoundation(this.#definition, dependencies.bindingEdges);
    this.#foundation = bindings.status === "created" ? bindings.foundation : undefined;
    this.#operations = new Map(dependencies.operations.map((operation) => [operation.stageId, operation]));
    this.#cancellation = dependencies.cancellation;
  }

  async execute(
    input: OperationPipelineInput<Readonly<{ [key: string]: ReferenceOperationValue }>>,
  ): Promise<ReferenceOperationPipelineResult> {
    const stages = [...this.#definition.stages]
      .sort((left, right) => left.order - right.order || left.stageId.localeCompare(right.stageId));
    const initialStageId = stages[0]?.stageId ?? input.initialStageId;
    const visited: OperationPipelineStageId[] = [];
    const reasons: string[] = [];
    let retry: OperationPipelineRetryRecommendation = { recommendation: "do-not-retry" };
    const outputs = new Map<OperationPipelineStageId, Readonly<{ [key: string]: ReferenceOperationValue }>>();
    const optionalFailures: OperationPipelineStageId[] = [];

    const terminal = (
      status: "cancelled" | "failed" | "reconciliation-required",
      finalStageId: OperationPipelineStageId,
    ): ReferenceOperationPipelineResult => deepFreeze({
      status,
      finalStageId,
      retry,
      audit: createAudit(this.#definition, initialStageId, finalStageId, visited, reasons),
    });

    if (this.#foundation === undefined || stages.length === 0) {
      reasons.push("operation-binding-invalid");
      return terminal("failed", initialStageId);
    }
    if (this.#cancellation.check({ point: "before-pipeline" }) || input.context.cancellation.status === "cancelled") {
      reasons.push("operation-cancelled");
      return terminal("cancelled", initialStageId);
    }

    for (const [index, stage] of stages.entries()) {
      if (this.#cancellation.check({ point: "before-operation", stageId: stage.stageId })) {
        reasons.push("operation-cancelled");
        return terminal("cancelled", stage.stageId);
      }
      const operation = this.#operations.get(stage.stageId);
      if (operation === undefined) {
        reasons.push("operation-binding-missing");
        return terminal("failed", stage.stageId);
      }
      const value = index === 0 ? deepFreeze(copyRecord(input.payload)) : projectInput(stage.stageId, this.#foundation, outputs);
      const result = await operation.execute({ value, context: input.context });
      retry = aggregateRetry(retry, result.retry);
      reasons.push(...result.reasonCodes);
      visited.push(stage.stageId);
      if (result.status === "completed") outputs.set(stage.stageId, deepFreeze(copyRecord(result.output)));
      if (result.status === "failed") {
        if (operation.requirement === "required") return terminal("failed", stage.stageId);
        optionalFailures.push(stage.stageId);
        outputs.set(stage.stageId, deepFreeze({}));
      }
      if (this.#cancellation.check({ point: "after-operation", stageId: stage.stageId })) {
        reasons.push("operation-cancelled");
        return terminal("cancelled", stage.stageId);
      }
    }

    const finalStageId = stages.at(-1)?.stageId ?? initialStageId;
    const snapshot: ReferenceOperationExecutionSnapshot = deepFreeze({
      snapshotVersion: "1.0",
      status: optionalFailures.length === 0 ? "completed" : "degraded",
      stageOutputs: stages.flatMap((stage) => {
        const output = outputs.get(stage.stageId);
        return output === undefined ? [] : [{ stageId: stage.stageId, output: copyRecord(output) }];
      }),
      optionalFailureStageIds: [...optionalFailures],
    });
    return deepFreeze({
      status: "completed",
      output: {
        outputVersion: "1.0",
        operation: { ...this.#definition.operation },
        finalStageId,
        payload: snapshot,
        retry,
        audit: createAudit(this.#definition, initialStageId, finalStageId, visited, reasons),
      },
    });
  }
}
