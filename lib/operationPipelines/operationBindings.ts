import type {
  OperationPipelineDefinition,
  OperationPipelineRetryRecommendation,
  OperationPipelineStageId,
} from "./types";

export type OperationBindingFieldPath = readonly [string, ...string[]];

export type OperationBindingFieldMapping = Readonly<{
  mappingVersion: "1.0";
  source: Readonly<{
    kind: "operation-output";
    path: OperationBindingFieldPath;
  }>;
  target: Readonly<{
    kind: "operation-input";
    path: OperationBindingFieldPath;
  }>;
  required: boolean;
}>;

export type OperationBindingEdge = Readonly<{
  bindingVersion: "1.0";
  bindingId: string;
  order: number;
  predecessorStageId: OperationPipelineStageId;
  successorStageId: OperationPipelineStageId;
  mappings: readonly OperationBindingFieldMapping[];
  cancellation: "propagate";
  retryRecommendation: "propagate";
}>;

export type OperationBindingValidationIssue = Readonly<{
  reasonCode:
    | "invalid-binding"
    | "missing-dependency"
    | "duplicate-edge"
    | "dependency-cycle";
  bindingId?: string;
}>;

export type OperationBindingFoundation = Readonly<{
  foundationVersion: "1.0";
  pipelineId: string;
  pipelineVersion: string;
  edges: readonly OperationBindingEdge[];
}>;

export type OperationBindingBuildResult =
  | Readonly<{
      status: "created";
      foundation: OperationBindingFoundation;
    }>
  | Readonly<{
      status: "invalid";
      issues: readonly OperationBindingValidationIssue[];
    }>;

export type OperationBindingPropagation = Readonly<{
  cancellation: "propagate";
  retry: OperationPipelineRetryRecommendation;
}>;

const copyPath = (path: OperationBindingFieldPath): OperationBindingFieldPath =>
  [...path] as [string, ...string[]];

const copyEdge = (edge: OperationBindingEdge): OperationBindingEdge => ({
  bindingVersion: edge.bindingVersion,
  bindingId: edge.bindingId,
  order: edge.order,
  predecessorStageId: edge.predecessorStageId,
  successorStageId: edge.successorStageId,
  mappings: edge.mappings.map((mapping) => ({
    mappingVersion: mapping.mappingVersion,
    source: { kind: mapping.source.kind, path: copyPath(mapping.source.path) },
    target: { kind: mapping.target.kind, path: copyPath(mapping.target.path) },
    required: mapping.required,
  })),
  cancellation: edge.cancellation,
  retryRecommendation: edge.retryRecommendation,
});

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const edgeKey = (from: OperationPipelineStageId, to: OperationPipelineStageId): string =>
  `${from.length}:${from}${to.length}:${to}`;

const hasCycle = (stageIds: readonly OperationPipelineStageId[], edges: readonly OperationBindingEdge[]): boolean => {
  const successors = new Map(stageIds.map((stageId) => [stageId, [] as OperationPipelineStageId[]]));
  const indegree = new Map(stageIds.map((stageId) => [stageId, 0]));
  for (const edge of edges) {
    successors.get(edge.predecessorStageId)?.push(edge.successorStageId);
    indegree.set(edge.successorStageId, (indegree.get(edge.successorStageId) ?? 0) + 1);
  }
  const ready = stageIds.filter((stageId) => indegree.get(stageId) === 0).sort();
  let visited = 0;
  while (ready.length > 0) {
    const stageId = ready.shift();
    if (stageId === undefined) break;
    visited += 1;
    for (const successor of successors.get(stageId) ?? []) {
      const next = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, next);
      if (next === 0) {
        ready.push(successor);
        ready.sort();
      }
    }
  }
  return visited !== stageIds.length;
};

export function createOperationBindingFoundation(
  pipeline: OperationPipelineDefinition,
  candidateEdges: readonly OperationBindingEdge[],
): OperationBindingBuildResult {
  const stageIds = pipeline.stages.map((stage) => stage.stageId);
  const stageSet = new Set(stageIds);
  const issues: OperationBindingValidationIssue[] = [];
  const seenEdges = new Set<string>();

  for (const edge of candidateEdges) {
    const key = edgeKey(edge.predecessorStageId, edge.successorStageId);
    const valid =
      edge.bindingVersion === "1.0" &&
      edge.bindingId.length > 0 &&
      Number.isSafeInteger(edge.order) &&
      edge.order >= 0 &&
      stageSet.has(edge.predecessorStageId) &&
      stageSet.has(edge.successorStageId) &&
      edge.predecessorStageId !== edge.successorStageId &&
      edge.cancellation === "propagate" &&
      edge.retryRecommendation === "propagate" &&
      edge.mappings.length > 0 &&
      edge.mappings.every(
        (mapping) =>
          mapping.mappingVersion === "1.0" &&
          mapping.source.kind === "operation-output" &&
          mapping.target.kind === "operation-input" &&
          mapping.source.path.length > 0 &&
          mapping.target.path.length > 0 &&
          mapping.source.path.every((part) => part.length > 0) &&
          mapping.target.path.every((part) => part.length > 0),
      );
    if (!valid) issues.push({ reasonCode: "invalid-binding", bindingId: edge.bindingId });
    if (seenEdges.has(key)) issues.push({ reasonCode: "duplicate-edge", bindingId: edge.bindingId });
    seenEdges.add(key);
  }

  const expected = new Set(
    pipeline.dependencies.map((dependency) =>
      edgeKey(dependency.predecessorStageId, dependency.successorStageId),
    ),
  );
  for (const dependencyKey of expected) {
    if (!seenEdges.has(dependencyKey)) issues.push({ reasonCode: "missing-dependency" });
  }
  for (const candidateKey of seenEdges) {
    if (!expected.has(candidateKey)) issues.push({ reasonCode: "invalid-binding" });
  }
  if (hasCycle(stageIds, candidateEdges)) issues.push({ reasonCode: "dependency-cycle" });

  if (issues.length > 0) return deepFreeze({ status: "invalid", issues });

  const edges = candidateEdges
    .map(copyEdge)
    .sort((left, right) => left.order - right.order || left.bindingId.localeCompare(right.bindingId));
  return deepFreeze({
    status: "created",
    foundation: {
      foundationVersion: "1.0",
      pipelineId: pipeline.pipelineId,
      pipelineVersion: pipeline.pipelineVersion,
      edges,
    },
  });
}

export function listOperationBindingEdges(
  foundation: OperationBindingFoundation,
): readonly OperationBindingEdge[] {
  return deepFreeze(foundation.edges.map(copyEdge));
}
