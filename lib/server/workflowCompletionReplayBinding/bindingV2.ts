import { projectMultiCutReplayPostgresqlParameter } from "../multiCutReplayPostgresqlProductionBridge";
import type {
  MultiCutReplayCompleteExecutionRequestV2,
  MultiCutReplayCompleteQueryExecutionPortV3,
} from "../multiCutReplayPostgresqlTransactionParticipation";
import type {
  PostgreSQLJsonValue,
  PostgreSQLRow,
  PostgreSQLValue,
} from "../productionWorkflowRuntime/postgresqlDriver";
import type { DurableWorkflowManyOnlySameSessionQueryCapabilityV3 } from "../productionWorkflowRuntime/durableTransaction";
import type {
  WorkflowCompletionReplayAuthorityV1,
  WorkflowCompletionReplayBindingDependenciesV2,
  WorkflowCompletionReplayBindingInputV2,
  WorkflowCompletionReplayBindingV2,
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
  input: WorkflowCompletionReplayBindingInputV2["lifecycleInput"],
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

const createQueryPortV3 = (
  capability: DurableWorkflowManyOnlySameSessionQueryCapabilityV3,
): MultiCutReplayCompleteQueryExecutionPortV3 => Object.freeze({
  async execute(request: MultiCutReplayCompleteExecutionRequestV2) {
    if (
      request.parameters.length !== request.values.length
      || request.parameters.some(
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
      failureVersion: "3.0",
      classification: "execution-failure",
      issue: result.issue,
      safeReason: result.safeReason,
      retryable: result.diagnostic.retryable,
      ...(result.diagnostic.sqlStateClass === undefined
        ? {}
        : { sqlStateClass: result.diagnostic.sqlStateClass }),
      queryConnectionDisposition: result.diagnostic.queryConnectionDisposition,
    });
  },
});

export const createWorkflowCompletionReplayBindingV2 = (
  dependencies: WorkflowCompletionReplayBindingDependenciesV2,
): WorkflowCompletionReplayBindingV2 => Object.freeze({
  bindingVersion: "2.0",
  async executeReplayCompletion(request) {
    if (request.transactionContext.contextVersion !== "4.0") {
      throw new TypeError("invalid-workflow-completion-transaction-context-v4");
    }
    return dependencies.lifecycleCompleteAdapter.complete(Object.freeze({
      inputVersion: "1.0",
      input: copyLifecycleInput(request.lifecycleInput),
      authority: Object.freeze({
        authorityVersion: request.authority.authorityVersion,
        authoritativeReplayIdentity: copyAuthoritativeIdentity(
          request.authority.authoritativeReplayIdentity,
        ),
        completionTimestamp: request.authority.completionTimestamp,
        parameterVersionAuthority: Object.freeze({
          ...request.authority.parameterVersionAuthority,
        }),
        queryPort: createQueryPortV3(request.transactionContext.sameSessionQuery),
      }),
    }));
  },
});
