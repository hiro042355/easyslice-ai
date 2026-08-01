import { projectMultiCutReplayPostgresqlParameter } from "../multiCutReplayPostgresqlProductionBridge";
import type {
  MultiCutReplayCompleteExecutionRequestV2,
  MultiCutReplayCompleteQueryExecutionPortV2,
} from "../multiCutReplayPostgresqlTransactionParticipation";
import type {
  PostgreSQLJsonValue,
  PostgreSQLRow,
  PostgreSQLValue,
} from "../productionWorkflowRuntime/postgresqlDriver";
import type {
  DurableWorkflowSameSessionQueryCapability,
  DurableWorkflowTransactionContextV3,
} from "../productionWorkflowRuntime/durableTransaction";
import type {
  WorkflowCompletionReplayBindingDependenciesV1,
  WorkflowCompletionReplayBindingV1,
  WorkflowCompletionReplayAuthorityV1,
} from "./types";

const copyAuthoritativeIdentity = (
  identity: WorkflowCompletionReplayAuthorityV1["authoritativeReplayIdentity"],
) => Object.freeze({
  identityVersion: identity.identityVersion,
  protectedScope: Object.freeze({
    scopeVersion: identity.protectedScope.scopeVersion,
    replayNamespace: identity.protectedScope.replayNamespace,
    tenant: Object.freeze({ ...identity.protectedScope.tenant }),
    operationIdentity: identity.protectedScope.operationIdentity,
  }),
  resolvedIdentity: Object.freeze({ ...identity.resolvedIdentity }),
});

const copyLifecycleInput = (
  input: Parameters<WorkflowCompletionReplayBindingV1["executeReplayCompletion"]>[0]["lifecycleInput"],
) => Object.freeze({
  inputVersion: input.inputVersion,
  transition: input.transition,
  replayIdentity: copyAuthoritativeIdentity(input.replayIdentity),
  reservationEvidence: Object.freeze({
    evidenceVersion: input.reservationEvidence.evidenceVersion,
    reservation: Object.freeze({ ...input.reservationEvidence.reservation }),
    expectedRevision: Object.freeze({ ...input.reservationEvidence.expectedRevision }),
    fencing: Object.freeze({ ...input.reservationEvidence.fencing }),
    lease: Object.freeze({ ...input.reservationEvidence.lease }),
    leaseExpiresAt: input.reservationEvidence.leaseExpiresAt,
    reservationAttempt: input.reservationEvidence.reservationAttempt,
  }),
  resultReference: Object.freeze({ ...input.resultReference }),
  metadata: Object.freeze({ ...input.metadata }),
});

const copyJson = (value: PostgreSQLJsonValue): PostgreSQLJsonValue => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(copyJson));
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, copyJson(entry)]),
    ),
  );
};

const copyValue = (value: PostgreSQLValue): PostgreSQLValue =>
  value instanceof Uint8Array
    ? Uint8Array.from(value)
    : value !== null && typeof value === "object"
      ? copyJson(value)
      : value;

const copyRow = (row: PostgreSQLRow): Readonly<Record<string, unknown>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, copyValue(value)]),
    ),
  );

const assertContextV3 = (
  context: DurableWorkflowTransactionContextV3,
): DurableWorkflowSameSessionQueryCapability => {
  if (
    context.contextVersion !== "3.0" ||
    context.sameSessionQuery.capabilityVersion !== "1.0" ||
    context.sameSessionQuery.evidence.transactionOwnership !== "workflow-owner" ||
    context.sameSessionQuery.evidence.sessionAffinity !== "same-session-required" ||
    context.sameSessionQuery.evidence.separateConnectionPermitted !== false ||
    context.sameSessionQuery.evidence.capabilityOwnsLifecycle !== false
  ) {
    throw new Error("invalid-workflow-completion-transaction-context-v3");
  }
  return context.sameSessionQuery;
};

const createQueryPortV2 = (
  capability: DurableWorkflowSameSessionQueryCapability,
): MultiCutReplayCompleteQueryExecutionPortV2 => Object.freeze({
  async execute(request: MultiCutReplayCompleteExecutionRequestV2) {
    if (
      request.parameters.length !== request.values.length ||
      request.parameters.some(
        ({ value }, index) => !Object.is(value, request.values[index]),
      )
    ) {
      throw new Error("invalid-replay-completion-query-request");
    }
    const result = await capability.executeQuery(Object.freeze({
      statementId: request.statementId,
      text: request.sql,
      values: Object.freeze(
        request.parameters.map(projectMultiCutReplayPostgresqlParameter),
      ),
      expectedResult: "many",
    }));
    if (result.status === "success") {
      return Object.freeze({
        kind: "success",
        rows: Object.freeze(result.rows.map(copyRow)),
        rowCount: result.rowCount,
        command: result.command,
      });
    }
    return Object.freeze({
      kind: "execution-failure",
      failureVersion: "2.0",
      classification: "execution-failure",
      issue: result.classification,
      safeReason: result.safeReason,
      ...(result.sqlStateClass !== undefined
        ? { sqlStateClass: result.sqlStateClass }
        : {}),
      ...(result.queryConnectionDisposition !== undefined
        ? { queryConnectionDisposition: result.queryConnectionDisposition }
        : {}),
    });
  },
});

export const createWorkflowCompletionReplayBinding = (
  dependencies: WorkflowCompletionReplayBindingDependenciesV1,
): WorkflowCompletionReplayBindingV1 => {
  const lifecycleCompleteAdapter = dependencies.lifecycleCompleteAdapter;
  return Object.freeze({
    bindingVersion: "1.0",
    async executeReplayCompletion(request) {
      const capability = assertContextV3(request.transactionContext);
      const lifecycleInput = copyLifecycleInput(request.lifecycleInput);
      const authoritativeReplayIdentity = copyAuthoritativeIdentity(
        request.authority.authoritativeReplayIdentity,
      );
      return lifecycleCompleteAdapter.complete(Object.freeze({
        inputVersion: "1.0",
        input: lifecycleInput,
        authority: Object.freeze({
          authorityVersion: request.authority.authorityVersion,
          authoritativeReplayIdentity,
          completionTimestamp: request.authority.completionTimestamp,
          parameterVersionAuthority: Object.freeze({
            ...request.authority.parameterVersionAuthority,
          }),
          queryPort: createQueryPortV2(capability),
        }),
      }));
    },
  });
};
