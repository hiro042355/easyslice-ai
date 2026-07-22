import type {
  WorkflowDefinition,
  WorkflowIdentity,
  WorkflowValidationIssue,
  WorkflowValidationResult,
} from "./types";

export type WorkflowRegistrationResult =
  | Readonly<{ status: "registered"; definition: WorkflowDefinition }>
  | Readonly<{ status: "duplicate"; identity: WorkflowIdentity }>
  | Readonly<{ status: "invalid"; validation: WorkflowValidationResult }>;

export type WorkflowRegistrySnapshot = Readonly<{
  snapshotVersion: "1.0";
  definitions: readonly WorkflowDefinition[];
}>;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const copyDefinition = (definition: WorkflowDefinition): WorkflowDefinition => ({
  contractVersion: definition.contractVersion,
  identity: {
    workflowId: definition.identity.workflowId,
    workflowVersion: definition.identity.workflowVersion,
  },
  stages: definition.stages.map((stage) => ({
    identity: {
      workflow: {
        workflowId: stage.identity.workflow.workflowId,
        workflowVersion: stage.identity.workflow.workflowVersion,
      },
      stageId: stage.identity.stageId,
      stageVersion: stage.identity.stageVersion,
    },
    order: stage.order,
    requirement: stage.requirement,
    terminal: stage.terminal,
    pipeline: {
      referenceVersion: stage.pipeline.referenceVersion,
      pipelineId: stage.pipeline.pipelineId,
      pipelineVersion: stage.pipeline.pipelineVersion,
      operationId: stage.pipeline.operationId,
      operationVersion: stage.pipeline.operationVersion,
      bindingId: stage.pipeline.bindingId,
      bindingVersion: stage.pipeline.bindingVersion,
    },
  })),
  dependencies: definition.dependencies.map((dependency) => ({
    predecessorStageId: dependency.predecessorStageId,
    successorStageId: dependency.successorStageId,
  })),
});

const identityKey = (workflowId: string, workflowVersion: string): string =>
  `${workflowId.length}:${workflowId}${workflowVersion.length}:${workflowVersion}`;

const issue = (
  issues: WorkflowValidationIssue[],
  reasonCode: WorkflowValidationIssue["reasonCode"],
  field: WorkflowValidationIssue["field"],
): void => {
  issues.push({ reasonCode, field, sequence: issues.length });
};

export function validateWorkflowDefinition(definition: WorkflowDefinition): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = [];
  if (definition.contractVersion !== "1.0" ||
    definition.identity.workflowId.length === 0 ||
    definition.identity.workflowVersion.length === 0) {
    issue(issues, "invalid-workflow", "workflow");
  }
  const ids = definition.stages.map((stage) => stage.identity.stageId);
  const idSet = new Set(ids);
  if (definition.stages.length === 0) issue(issues, "invalid-stage", "stage");
  if (idSet.size !== ids.length) issue(issues, "duplicate-stage", "stage");
  const orders = new Set<number>();
  for (const stage of definition.stages) {
    if (stage.identity.workflow.workflowId !== definition.identity.workflowId ||
      stage.identity.workflow.workflowVersion !== definition.identity.workflowVersion ||
      stage.identity.stageId.length === 0 ||
      stage.identity.stageVersion.length === 0) {
      issue(issues, "invalid-stage", "stage");
    }
    if (!Number.isSafeInteger(stage.order) || stage.order < 0 || orders.has(stage.order)) {
      issue(issues, "invalid-order", "order");
    }
    orders.add(stage.order);
    if (stage.pipeline.referenceVersion !== "1.0" ||
      [stage.pipeline.pipelineId, stage.pipeline.pipelineVersion, stage.pipeline.operationId,
        stage.pipeline.operationVersion, stage.pipeline.bindingId, stage.pipeline.bindingVersion]
        .some((value) => value.length === 0)) {
      issue(issues, "invalid-pipeline-reference", "pipeline-reference");
    }
  }
  const indegree = new Map(ids.map((id) => [id, 0]));
  const successors = new Map(ids.map((id) => [id, [] as string[]]));
  const edges = new Set<string>();
  for (const dependency of definition.dependencies) {
    const key = identityKey(dependency.predecessorStageId, dependency.successorStageId);
    if (!idSet.has(dependency.predecessorStageId) ||
      !idSet.has(dependency.successorStageId) ||
      dependency.predecessorStageId === dependency.successorStageId ||
      edges.has(key)) {
      issue(issues, "invalid-dependency", "dependency");
      continue;
    }
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
      if (next === 0) {
        ready.push(successor);
        ready.sort();
      }
    }
  }
  if (ids.length > 0 && visited !== ids.length) issue(issues, "dependency-cycle", "dependency");
  return issues.length === 0
    ? deepFreeze({ status: "valid" })
    : deepFreeze({ status: "invalid", issues });
}

export class ReferenceWorkflowRegistry {
  readonly #definitions = new Map<string, WorkflowDefinition>();

  register(definition: WorkflowDefinition): WorkflowRegistrationResult {
    const validation = validateWorkflowDefinition(definition);
    if (validation.status === "invalid") return deepFreeze({ status: "invalid", validation });
    const key = identityKey(definition.identity.workflowId, definition.identity.workflowVersion);
    if (this.#definitions.has(key)) {
      return deepFreeze({ status: "duplicate", identity: { ...definition.identity } });
    }
    const stored = deepFreeze(copyDefinition(definition));
    this.#definitions.set(key, stored);
    return deepFreeze({ status: "registered", definition: copyDefinition(stored) });
  }

  getByIdentity(identity: WorkflowIdentity): WorkflowDefinition | undefined {
    const found = this.#definitions.get(identityKey(identity.workflowId, identity.workflowVersion));
    return found === undefined ? undefined : deepFreeze(copyDefinition(found));
  }

  getVersion(workflowId: string, workflowVersion: string): WorkflowDefinition | undefined {
    const found = this.#definitions.get(identityKey(workflowId, workflowVersion));
    return found === undefined ? undefined : deepFreeze(copyDefinition(found));
  }

  snapshot(): WorkflowRegistrySnapshot {
    const definitions = [...this.#definitions.values()]
      .map(copyDefinition)
      .sort((left, right) =>
        left.identity.workflowId.localeCompare(right.identity.workflowId) ||
        left.identity.workflowVersion.localeCompare(right.identity.workflowVersion));
    return deepFreeze({ snapshotVersion: "1.0", definitions });
  }
}
