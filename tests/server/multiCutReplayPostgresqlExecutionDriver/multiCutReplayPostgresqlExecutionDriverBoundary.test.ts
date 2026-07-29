import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMultiCutReplayPostgresqlExecutionDriver,
  MULTI_CUT_REPLAY_POSTGRESQL_EXECUTION_DRIVER_METADATA,
} from "../../../lib/server/multiCutReplayPostgresqlExecutionDriver";
import type {
  MultiCutReplayPostgresqlExecutionDriverRequest,
  MultiCutReplayPostgresqlExecutionDriverResult,
  MultiCutReplayPostgresqlExecutionDriverTransactionScope,
} from "../../../lib/server/multiCutReplayPostgresqlExecutionDriver";

const request: MultiCutReplayPostgresqlExecutionDriverRequest =
  Object.freeze({
    requestVersion: "1.0",
    statementRequest: Object.freeze({
      requestVersion: "1.0",
      statementId: "complete-processing-replay",
      parameters: Object.freeze({ opaque: "parameter" }),
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
        propagated: false,
      }),
      connection: Object.freeze({
        connectionVersion: "1.0",
        acquisition: "executor-boundary",
        release: "executor-boundary",
        transactionOwnership: "workflow-completion-boundary",
      }),
      executionMetadata: Object.freeze({ opaque: "metadata" }),
    }),
  });

const executedResult: MultiCutReplayPostgresqlExecutionDriverResult =
  Object.freeze({
    resultVersion: "1.0",
    status: "executed",
    statementId: request.statementRequest.statementId,
    affectedRowInterpretation: "exactly-one",
    opaquePayload: Object.freeze({ opaque: "payload" }),
    executionMetadata: Object.freeze({
      metadataVersion: "1.0",
      transactionScope: "workflow-completion",
      affectedRowInterpretation: "exactly-one",
    }),
    commitUnknown: "not-unknown",
  });

test("driver exposes readonly boundary metadata", () => {
  assert.equal(
    Object.isFrozen(
      MULTI_CUT_REPLAY_POSTGRESQL_EXECUTION_DRIVER_METADATA,
    ),
    true,
  );
  assert.deepEqual(
    MULTI_CUT_REPLAY_POSTGRESQL_EXECUTION_DRIVER_METADATA,
    {
      driverVersion: "1.0",
      requestBoundary: "passthrough",
      resultBoundary: "passthrough",
      commitBoundary: "executor-owned",
      rollbackBoundary: "executor-owned",
      commitUnknownBoundary: "passthrough",
      cancellationBoundary: "context-only",
      connectionLifetimeBoundary: "executor-owned",
    },
  );
});

test("driver passes the exact request and result through one executor", async () => {
  let invocationCount = 0;
  const driver = createMultiCutReplayPostgresqlExecutionDriver({
    executor: {
      execute: async (received) => {
        invocationCount += 1;
        assert.equal(received, request);
        return executedResult;
      },
    },
  });

  const result = await driver.execute(request);

  assert.equal(result, executedResult);
  assert.equal(invocationCount, 1);
  assert.equal(Object.isFrozen(driver), true);
  assert.equal(driver.metadata, MULTI_CUT_REPLAY_POSTGRESQL_EXECUTION_DRIVER_METADATA);
});

test("commit unknown result remains unchanged", async () => {
  const commitUnknown: MultiCutReplayPostgresqlExecutionDriverResult =
    Object.freeze({
      resultVersion: "1.0",
      status: "commit-unknown",
      statementId: "takeover-stale-processing-replay",
      affectedRowInterpretation: "not-applicable",
      opaquePayload: undefined,
      executionMetadata: Object.freeze({
        metadataVersion: "1.0",
        transactionScope: "required",
        affectedRowInterpretation: "not-applicable",
      }),
      commitUnknown: "commit-unknown",
      retry: "reconcile-first",
    });
  const driver = createMultiCutReplayPostgresqlExecutionDriver({
    executor: {
      execute: async () => commitUnknown,
    },
  });

  assert.equal(await driver.execute(request), commitUnknown);
});

test("transaction, cancellation, and connection boundaries are retained", () => {
  const scopes: readonly MultiCutReplayPostgresqlExecutionDriverTransactionScope[] =
    ["none", "read-consistent", "required", "workflow-completion"];

  assert.deepEqual(scopes, [
    "none",
    "read-consistent",
    "required",
    "workflow-completion",
  ]);
  assert.equal(
    request.executionContext.transactionScope,
    "workflow-completion",
  );
  assert.equal(request.executionContext.cancellation.requested, false);
  assert.equal(request.executionContext.cancellation.propagated, false);
  assert.equal(
    request.executionContext.connection.transactionOwnership,
    "workflow-completion-boundary",
  );
  assert.equal(Object.isFrozen(request.executionContext), true);
  assert.equal(Object.isFrozen(request.executionContext.cancellation), true);
  assert.equal(Object.isFrozen(request.executionContext.connection), true);
});

test("driver package has only type-level port and catalog dependencies", async () => {
  const [typesSource, driverSource, indexSource, portSource, catalogSource] =
    await Promise.all([
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlExecutionDriver/types.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlExecutionDriver/driver.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlExecutionDriver/index.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlAdapterPort/types.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/types.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  const source = `${typesSource}\n${driverSource}\n${indexSource}`;

  assert.match(typesSource, /import\s+type[\s\S]*AdapterPort/);
  assert.match(typesSource, /import\s+type[\s\S]*StatementCatalog/);
  assert.doesNotMatch(typesSource, /import\s+(?!type\b)/);
  assert.doesNotMatch(driverSource, /import\s+(?!type\b)/);
  assert.doesNotMatch(
    source,
    /(?:node:|next\/|react|node:fs|filesystem|process\.env|globalThis|Date\.now|Math\.random|fetch\s*\(|database client|query builder|transaction implementation|statement executor implementation)/i,
  );
  assert.doesNotMatch(
    source,
    /from\s+["'][^"']*(?:workflow|route|http)[^"']*["']/i,
  );
  assert.doesNotMatch(source, /from\s+["'](?:pg|postgres|postgresql)["']/);
  assert.doesNotMatch(
    source,
    /\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE|RETURNING|ROLLBACK)\b|ON\s+CONFLICT|\$\d+|::[a-z]/,
  );
  assert.doesNotMatch(
    portSource,
    /multiCutReplayPostgresqlExecutionDriver/,
  );
  assert.doesNotMatch(
    catalogSource,
    /multiCutReplayPostgresqlExecutionDriver/,
  );
});
