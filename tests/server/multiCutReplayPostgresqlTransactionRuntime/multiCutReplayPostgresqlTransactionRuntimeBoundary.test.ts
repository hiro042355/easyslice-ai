import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createMultiCutReplayPostgresqlTransactionRuntime,
  MULTI_CUT_REPLAY_POSTGRESQL_TRANSACTION_RUNTIME_FACTORY,
  MULTI_CUT_REPLAY_POSTGRESQL_TRANSACTION_RUNTIME_METADATA,
} from "../../../lib/server/multiCutReplayPostgresqlTransactionRuntime";
import type {
  MultiCutReplayPostgresqlExecutionDriver,
  MultiCutReplayPostgresqlExecutionDriverRequest,
  MultiCutReplayPostgresqlExecutionDriverResult,
} from "../../../lib/server/multiCutReplayPostgresqlExecutionDriver";
import type {
  MultiCutReplayPostgresqlTransactionRuntimeRequest,
} from "../../../lib/server/multiCutReplayPostgresqlTransactionRuntime";

const driverRequest: MultiCutReplayPostgresqlExecutionDriverRequest =
  Object.freeze({
    requestVersion: "1.0",
    statementRequest: Object.freeze({
      requestVersion: "1.0",
      statementId: "complete-processing-replay",
      parameters: Object.freeze({ opaque: "value" }),
      transactionContext: Object.freeze({
        contextVersion: "1.0",
        scope: "workflow-completion",
        opaqueContextReference: "transaction:opaque",
      }),
    }),
    executionContext: Object.freeze({
      contextVersion: "1.0",
      operationIdentifier: "complete",
      statementIdentifier: "complete-processing-replay",
      transactionScope: "workflow-completion",
      accessMode: "write",
      mutationKind: "terminal-transition",
      cancellation: Object.freeze({
        cancellationVersion: "1.0",
        requested: false,
        propagated: true,
      }),
      connection: Object.freeze({
        connectionVersion: "1.0",
        acquisition: "executor-boundary",
        release: "executor-boundary",
        transactionOwnership: "workflow-completion-boundary",
      }),
      executionMetadata: Object.freeze({ source: "fixture" }),
    }),
  });

const runtimeRequest: MultiCutReplayPostgresqlTransactionRuntimeRequest =
  Object.freeze({
    requestVersion: "1.0",
    driverRequest,
    runtimeContext: Object.freeze({
      contextVersion: "1.0",
      transactionScope: "workflow-completion",
      transactionOwnership: "workflow-completion-boundary",
      commitBoundary: "workflow-completion-owned",
      rollbackBoundary: "workflow-completion-owned",
      cancellation: Object.freeze({
        cancellationVersion: "1.0",
        requested: false,
        propagation: "client-boundary",
      }),
      connectionLifetime: Object.freeze({
        lifetimeVersion: "1.0",
        acquisition: "dependency-boundary",
        release: "dependency-boundary",
        ownership: "dependency",
      }),
      executionMetadata: Object.freeze({ attempt: "opaque" }),
    }),
  });

const executedResult: MultiCutReplayPostgresqlExecutionDriverResult =
  Object.freeze({
    resultVersion: "1.0",
    status: "executed",
    statementId: "complete-processing-replay",
    affectedRowInterpretation: "exactly-one",
    opaquePayload: Object.freeze({ result: "opaque" }),
    executionMetadata: Object.freeze({
      metadataVersion: "1.0",
      transactionScope: "workflow-completion",
      affectedRowInterpretation: "exactly-one",
    }),
    commitUnknown: "not-unknown",
  });

test("exports immutable runtime metadata and factory", () => {
  assert.deepEqual(
    MULTI_CUT_REPLAY_POSTGRESQL_TRANSACTION_RUNTIME_METADATA,
    {
      runtimeVersion: "1.0",
      requestBoundary: "passthrough",
      resultBoundary: "passthrough",
      transactionBoundary: "context-only",
      commitBoundary: "metadata-only",
      rollbackBoundary: "metadata-only",
      commitUnknownBoundary: "passthrough",
      cancellationBoundary: "context-only",
      connectionLifetimeBoundary: "metadata-only",
    },
  );
  assert.equal(
    Object.isFrozen(
      MULTI_CUT_REPLAY_POSTGRESQL_TRANSACTION_RUNTIME_METADATA,
    ),
    true,
  );
  assert.equal(
    Object.isFrozen(
      MULTI_CUT_REPLAY_POSTGRESQL_TRANSACTION_RUNTIME_FACTORY,
    ),
    true,
  );
});

test("passes the exact driver request and result through", async () => {
  let captured:
    | MultiCutReplayPostgresqlExecutionDriverRequest
    | undefined;
  const driver: MultiCutReplayPostgresqlExecutionDriver = Object.freeze({
    metadata: Object.freeze({
      driverVersion: "1.0",
      requestBoundary: "passthrough",
      resultBoundary: "passthrough",
      commitBoundary: "executor-owned",
      rollbackBoundary: "executor-owned",
      commitUnknownBoundary: "passthrough",
      cancellationBoundary: "context-only",
      connectionLifetimeBoundary: "executor-owned",
    }),
    async execute(request) {
      captured = request;
      return executedResult;
    },
  });
  const runtime =
    createMultiCutReplayPostgresqlTransactionRuntime({ driver });

  const result = await runtime.execute(runtimeRequest);

  assert.equal(captured, driverRequest);
  assert.equal(result, executedResult);
  assert.equal(Object.isFrozen(runtime), true);
});

test("retains scope, ownership, connection, and cancellation context", () => {
  const context = runtimeRequest.runtimeContext;

  assert.equal(context.transactionScope, "workflow-completion");
  assert.equal(
    context.transactionOwnership,
    "workflow-completion-boundary",
  );
  assert.equal(context.commitBoundary, "workflow-completion-owned");
  assert.equal(
    context.rollbackBoundary,
    "workflow-completion-owned",
  );
  assert.equal(context.connectionLifetime.acquisition, "dependency-boundary");
  assert.equal(context.connectionLifetime.release, "dependency-boundary");
  assert.equal(context.connectionLifetime.ownership, "dependency");
  assert.equal(context.cancellation.propagation, "client-boundary");
  assert.equal(Object.isFrozen(context), true);
});

test("passes commit unknown through without reclassification", async () => {
  const commitUnknown: MultiCutReplayPostgresqlExecutionDriverResult =
    Object.freeze({
      resultVersion: "1.0",
      status: "commit-unknown",
      statementId: "complete-processing-replay",
      affectedRowInterpretation: "not-applicable",
      opaquePayload: undefined,
      executionMetadata: Object.freeze({
        metadataVersion: "1.0",
        transactionScope: "workflow-completion",
        affectedRowInterpretation: "not-applicable",
      }),
      commitUnknown: "commit-unknown",
      retry: "reconcile-first",
    });
  const driver = Object.freeze({
    metadata: Object.freeze({
      driverVersion: "1.0" as const,
      requestBoundary: "passthrough" as const,
      resultBoundary: "passthrough" as const,
      commitBoundary: "executor-owned" as const,
      rollbackBoundary: "executor-owned" as const,
      commitUnknownBoundary: "passthrough" as const,
      cancellationBoundary: "context-only" as const,
      connectionLifetimeBoundary: "executor-owned" as const,
    }),
    async execute() {
      return commitUnknown;
    },
  });
  const runtime =
    MULTI_CUT_REPLAY_POSTGRESQL_TRANSACTION_RUNTIME_FACTORY.create({
      driver,
    });

  assert.equal(await runtime.execute(runtimeRequest), commitUnknown);
});

test("package has one-way imports and no transaction implementation", async () => {
  const base =
    "../../../lib/server/multiCutReplayPostgresqlTransactionRuntime/";
  const sources = await Promise.all(
    ["types.ts", "runtime.ts", "index.ts"].map((file) =>
      readFile(new URL(`${base}${file}`, import.meta.url), "utf8"),
    ),
  );
  const source = sources.join("\n");

  assert.doesNotMatch(
    source,
    /(?:\bpg\b|postgres\.js|drizzle|prisma|knex|next\/|react|node:fs|filesystem|process\.env|globalThis|Date\.now|Math\.random|fetch\s*\()/i,
  );
  assert.doesNotMatch(
    source,
    /\b(?:begin|commit|rollback|acquire|release)\s*\(/i,
  );
  assert.doesNotMatch(
    source,
    /\b(?:sql|queryText|queryBuilder)\s*:/i,
  );
  assert.doesNotMatch(
    source,
    /multiCutReplayPostgresqlStatementExecutor/,
  );
});
