import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createMultiCutReplayPostgresqlStatementExecutor,
} from "../../../lib/server/multiCutReplayPostgresqlStatementExecutor";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG,
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
} from "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog";
import type {
  MultiCutReplayPostgresqlStatementExecutionResult,
} from "../../../lib/server/multiCutReplayPostgresqlAdapterPort";
import type {
  MultiCutReplayPostgresqlStatementExecutorDependencies,
  MultiCutReplayPostgresqlStatementExecutorHooks,
} from "../../../lib/server/multiCutReplayPostgresqlStatementExecutor";

const executedResult = (
  statementId: (typeof MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS)[number],
): MultiCutReplayPostgresqlStatementExecutionResult =>
  Object.freeze({
    resultVersion: "1.0",
    status: "executed",
    statementId,
    affectedRowInterpretation: "not-applicable",
    opaquePayload: Object.freeze({ projected: true }),
    executionMetadata: Object.freeze({
      metadataVersion: "1.0",
      transactionScope: "required",
      affectedRowInterpretation: "not-applicable",
    }),
    commitUnknown: "not-unknown",
  });

const hooks = Object.freeze(
  Object.fromEntries(
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS.map((statementId) => [
      statementId,
      Object.freeze({
        expectedResult: Object.freeze({
          metadataVersion: "1.0",
          resultShape: "opaque",
          affectedRowMetadata: "available",
        }),
        parameterProjection: Object.freeze({
          project: (request: { parameters: Readonly<Record<string, unknown>> }) =>
            request.parameters,
        }),
        resultProjection: Object.freeze({
          project: () => executedResult(statementId),
        }),
        failureClassification: Object.freeze({
          classify: () =>
            Object.freeze({
              resultVersion: "1.0" as const,
              status: "commit-unknown" as const,
              statementId,
              affectedRowInterpretation: "not-applicable" as const,
              opaquePayload: undefined,
              executionMetadata: Object.freeze({
                metadataVersion: "1.0" as const,
                transactionScope: "required" as const,
                affectedRowInterpretation: "not-applicable" as const,
              }),
              commitUnknown: "commit-unknown" as const,
              retry: "reconcile-first" as const,
            }),
        }),
      }),
    ]),
  ),
) as unknown as MultiCutReplayPostgresqlStatementExecutorHooks;

const createDependencies = (
  execute: MultiCutReplayPostgresqlStatementExecutorDependencies["connection"]["query"]["execute"],
): MultiCutReplayPostgresqlStatementExecutorDependencies =>
  Object.freeze({
    connection: Object.freeze({
      connectionVersion: "1.0",
      opaqueConnectionReference: "connection:opaque",
      ownership: "connection-lifetime-capability",
      query: Object.freeze({ execute }),
    }),
    cancellation: Object.freeze({
      cancellationVersion: "1.0",
      requested: false,
      propagation: "client-boundary",
    }),
    hooks,
  });

const createRequest = (
  statementId: (typeof MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS)[number],
) =>
  Object.freeze({
    requestVersion: "1.0" as const,
    statementRequest: Object.freeze({
      requestVersion: "1.0" as const,
      statementId,
      parameters: Object.freeze({ opaque: "value" }),
      transactionContext: Object.freeze({
        contextVersion: "1.0" as const,
        scope: "required" as const,
      }),
    }),
    executionContext: Object.freeze({
      contextVersion: "1.0" as const,
      operationIdentifier:
        MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[statementId].operationKind,
      statementIdentifier: statementId,
      transactionScope: "required" as const,
      accessMode:
        MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[statementId].accessMode,
      mutationKind:
        MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[statementId]
          .mutationClassification,
      cancellation: Object.freeze({
        cancellationVersion: "1.0" as const,
        requested: false,
        propagated: true,
      }),
      connection: Object.freeze({
        connectionVersion: "1.0" as const,
        acquisition: "executor-boundary" as const,
        release: "executor-boundary" as const,
        transactionOwnership: "executor-boundary" as const,
      }),
      executionMetadata: Object.freeze({}),
    }),
  });

test("exports exactly eight immutable catalog-derived bindings", () => {
  const executor = createMultiCutReplayPostgresqlStatementExecutor(
    createDependencies(async (request) =>
      Object.freeze({
        resultVersion: "1.0",
        statementIdentifier: request.preparedStatement.statementIdentifier,
        opaqueResult: undefined,
        metadata: Object.freeze({
          metadataVersion: "1.0",
          cancellationPropagated: false,
        }),
      }),
    ),
  );
  const ids = Object.keys(executor.bindings);

  assert.deepEqual(ids, [...MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS]);
  assert.equal(new Set(ids).size, 8);
  assert.equal(
    ids.filter((id) => executor.bindings[id as keyof typeof executor.bindings].statementIdentifier === id).length,
    8,
  );
  assert.equal(
    Object.values(executor.bindings).filter(
      (binding) =>
        MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[
          binding.statementIdentifier
        ].capabilityOwner === "resolution",
    ).length,
    2,
  );
  assert.equal(
    Object.values(executor.bindings).filter(
      (binding) =>
        MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[
          binding.statementIdentifier
        ].capabilityOwner === "lifecycle",
    ).length,
    4,
  );
  assert.equal(
    Object.values(executor.bindings).filter(
      (binding) =>
        MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[
          binding.statementIdentifier
        ].capabilityOwner === "recovery",
    ).length,
    2,
  );
  assert.equal(Object.isFrozen(executor), true);
  assert.equal(Object.isFrozen(executor.bindings), true);
  assert.equal(Object.values(executor.bindings).every(Object.isFrozen), true);
});

test("retains catalog transaction and mutation metadata without query text", () => {
  const executor = createMultiCutReplayPostgresqlStatementExecutor(
    createDependencies(async () => {
      throw new Error("not invoked");
    }),
  );

  assert.equal(
    executor.bindings["complete-processing-replay"].transactionRequirement,
    "workflow-completion-transaction",
  );
  assert.equal(
    executor.bindings["lookup-authoritative-replay"].transactionRequirement,
    "read-consistent",
  );
  assert.equal(
    executor.bindings["takeover-stale-processing-replay"].mutationKind,
    "ownership-takeover",
  );
  const descriptor = executor.describe(
    createRequest("lookup-authoritative-replay"),
  );
  assert.equal(descriptor.statementIdentifier, "lookup-authoritative-replay");
  assert.deepEqual(descriptor.parameters, { opaque: "value" });
  assert.equal(Object.isFrozen(descriptor), true);
  assert.equal(Object.isFrozen(descriptor.parameters), true);
  assert.equal("sql" in descriptor, false);
  assert.equal("text" in descriptor, false);
  assert.equal("query" in descriptor, false);
});

test("uses projection hooks and transparently returns projected results", async () => {
  let invocations = 0;
  const executor = createMultiCutReplayPostgresqlStatementExecutor(
    createDependencies(async (request) => {
      invocations += 1;
      return Object.freeze({
        resultVersion: "1.0",
        statementIdentifier: request.preparedStatement.statementIdentifier,
        opaqueResult: Object.freeze({ raw: true }),
        metadata: Object.freeze({
          metadataVersion: "1.0",
          affectedRowCount: 1,
          cancellationPropagated: false,
        }),
      });
    }),
  );

  const result = await executor.execute(
    createRequest("complete-processing-replay"),
  );
  assert.equal(invocations, 1);
  assert.equal(result.status, "executed");
  assert.equal(result.statementId, "complete-processing-replay");
});

test("delegates thrown failures, including commit-unknown, to the failure hook", async () => {
  const executor = createMultiCutReplayPostgresqlStatementExecutor(
    createDependencies(async () => {
      throw new Error("opaque client failure");
    }),
  );

  const result = await executor.execute(
    createRequest("renew-processing-reservation"),
  );
  assert.equal(result.status, "commit-unknown");
  assert.equal(result.commitUnknown, "commit-unknown");
});

test("package preserves import isolation and has no SQL or dynamic registry", async () => {
  const base =
    "../../../lib/server/multiCutReplayPostgresqlStatementExecutor/";
  const sources = await Promise.all(
    ["types.ts", "executor.ts", "index.ts"].map((file) =>
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
    /(?:statementAdapters|AdapterShell|ReplayContract|Workflow)/i,
  );
  assert.doesNotMatch(source, /\b(?:register|unregister|replace)\s*\(/);
  assert.doesNotMatch(source, /\b(?:sql|queryText|placeholder|fragment)\s*:/i);
  assert.doesNotMatch(source, /import\s+.*ExecutionDriver.*from\s+["'][^"']+executor/i);
});
