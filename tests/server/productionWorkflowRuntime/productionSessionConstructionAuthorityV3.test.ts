import assert from "node:assert/strict";
import test from "node:test";
import {
  constructProductionTransactionSessionCapabilitiesV3,
  constructProductionTransactionSessionCompleteCapabilitiesV2,
  type DurableWorkflowDatabaseCommand,
  type DurableWorkflowDatabaseExecutionResult,
  type DurableWorkflowTransactionContext,
} from "../../../lib/server/productionWorkflowRuntime/durableTransaction";
import type {
  PostgreSQLQueryRequest,
  PostgreSQLQueryResult,
  PostgreSQLTransactionConnectionV2,
  PostgreSQLTransactionConnectionV3,
} from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver";

function context(): DurableWorkflowTransactionContext {
  const database = Object.freeze({
    capabilityVersion: "1.0" as const,
    execute: async (_command: DurableWorkflowDatabaseCommand): Promise<DurableWorkflowDatabaseExecutionResult> =>
      Object.freeze({ status: "success", rows: Object.freeze([]), rowCount: 0 }),
  });
  return Object.freeze({
    contextVersion: "2.0",
    scope: "opaque-production-durable-transaction-scope",
    startedAt: "2026-08-08T00:00:00.000Z",
    deadlineMonotonicMilliseconds: 100,
    externalIoAllowed: false,
    database,
    state: () => "active" as const,
    registerAfterCommit: () => "registered" as const,
  });
}

function connection(calls: PostgreSQLQueryRequest[]): PostgreSQLTransactionConnectionV2 {
  return Object.freeze({
    lifecycleVersion: "2.0",
    state: () => "active" as const,
    query: async (request): Promise<PostgreSQLQueryResult> => {
      calls.push(request);
      return Object.freeze({ status: "success", rows: Object.freeze([]), rowCount: 0, command: "SELECT" });
    },
    commit: async () => Object.freeze({ status: "committed" as const }),
    rollback: async () => Object.freeze({ status: "rolled-back" as const }),
    release: () => "transaction-active" as const,
    discard: () => Object.freeze({ status: "discarded" as const }),
  });
}

test("constructs immutable V3-ready capabilities from one active connection", async () => {
  const calls: PostgreSQLQueryRequest[] = [];
  const source = connection(calls);
  const result = constructProductionTransactionSessionCapabilitiesV3(Object.freeze({
    constructionVersion: "1.0",
    transactionConnection: source,
    transactionContextV2: context(),
    transactionOwnerEvidence: Object.freeze({
      evidenceVersion: "1.0",
      transactionOwner: "workflow-owner",
      transactionState: "active",
    }),
  }));

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.sameSessionEvidence), true);
  assert.equal(result.contextV3.contextVersion, "3.0");
  assert.equal(result.contextV3.sameSessionQuery, result.manyOnlySameSessionQueryCapability);
  assert.equal(result.workflowCompletionStateParticipantDependency.sameSessionQueryCapability.capabilityVersion, "2.0");
  assert.deepEqual(result.sameSessionEvidence, {
    version: "1.0",
    source: "single-postgresql-transaction-connection",
    transactionOwner: "workflow-owner",
  });
  assert.equal("transactionConnection" in result, false);
  assert.equal("client" in result, false);

  await result.generalSameSessionQueryCapability.executeQuery(Object.freeze({
    statementId: "test.general",
    text: "SELECT 1",
    values: Object.freeze([]),
    expectedResult: "many",
  }));
  await result.manyOnlySameSessionQueryCapability.executeQuery(Object.freeze({
    statementId: "test.many",
    text: "SELECT 1",
    values: Object.freeze([]),
    expectedResult: "many",
  }));
  assert.equal(calls.length, 2);
});

test("does not own transaction lifecycle and rejects inactive authority", () => {
  const calls: PostgreSQLQueryRequest[] = [];
  const inactive = Object.freeze({ ...connection(calls), state: () => "committed" as const });
  assert.throws(() => constructProductionTransactionSessionCapabilitiesV3(Object.freeze({
    constructionVersion: "1.0",
    transactionConnection: inactive,
    transactionContextV2: context(),
    transactionOwnerEvidence: Object.freeze({
      evidenceVersion: "1.0",
      transactionOwner: "workflow-owner",
      transactionState: "active",
    }),
  })), /invalid-production-session-construction-input/);
  assert.equal(calls.length, 0);
});

test("constructs complete context from the same V3 connection without fallback", async () => {
  const requests: PostgreSQLQueryRequest[] = [];
  let queryV2Calls = 0;
  const source: PostgreSQLTransactionConnectionV3 = Object.freeze({
    ...connection(requests),
    queryContractVersion: "2.0",
    async queryV2(request) {
      queryV2Calls += 1;
      requests.push(request);
      return Object.freeze({
        status: "failure",
        resultVersion: "2.0",
        issue: "connection-unavailable",
        safeReason: "postgresql-connection-unavailable",
        diagnostic: Object.freeze({
          stage: "query",
          issue: "connection-unavailable",
          retryable: true,
          queryConnectionDisposition: "must-discard",
        }),
      });
    },
  });
  const result = constructProductionTransactionSessionCompleteCapabilitiesV2(
    Object.freeze({
      constructionVersion: "2.0",
      transactionConnection: source,
      transactionContextV2: context(),
      transactionOwnerEvidence: Object.freeze({
        evidenceVersion: "1.0",
        transactionOwner: "workflow-owner",
        transactionState: "active",
      }),
    }),
  );
  const query = await result.completeContext.sameSessionQuery.executeQuery(
    Object.freeze({
      statementId: "complete-processing-replay",
      text: "SELECT 1",
      values: Object.freeze([]),
      expectedResult: "many",
    }),
  );
  assert.equal(result.completeContext.contextVersion, "4.0");
  assert.equal(result.completeContext.sameSessionQuery, result.manyOnlySameSessionQueryComplete);
  assert.equal(result.completeContext.generalSameSessionQuery, result.generalSameSessionQueryComplete);
  assert.equal(result.legacy.contextV3.contextVersion, "3.0");
  assert.equal(query.status, "failure");
  assert.equal(queryV2Calls, 1);
  assert.equal(requests.length, 1);
  assert.equal("transactionConnection" in result.completeContext, false);
});
