import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  MultiCutReplayPostgresqlAdapterPort,
  MultiCutReplayPostgresqlCommitUnknownClassification,
  MultiCutReplayPostgresqlDatabaseFailureClassification,
  MultiCutReplayPostgresqlRetryClassification,
  MultiCutReplayPostgresqlStatementExecutionRequest,
  MultiCutReplayPostgresqlStatementExecutionResult,
  MultiCutReplayPostgresqlTransactionScope,
} from "../../../lib/server/multiCutReplayPostgresqlAdapterPort";

test("adapter port exports readonly request and result contracts", async () => {
  const request: MultiCutReplayPostgresqlStatementExecutionRequest =
    Object.freeze({
      requestVersion: "1.0",
      statementId: "renew-processing-reservation",
      parameters: Object.freeze({ intent: "opaque" }),
      transactionContext: Object.freeze({
        contextVersion: "1.0",
        scope: "required",
        opaqueContextReference: "context:boundary",
      }),
    });
  const result: MultiCutReplayPostgresqlStatementExecutionResult =
    Object.freeze({
      resultVersion: "1.0",
      status: "executed",
      statementId: request.statementId,
      affectedRowInterpretation: "exactly-one",
      opaquePayload: Object.freeze({ projection: "opaque" }),
      executionMetadata: Object.freeze({
        metadataVersion: "1.0",
        transactionScope: request.transactionContext.scope,
        affectedRowInterpretation: "exactly-one",
      }),
      commitUnknown: "not-unknown",
    });
  const port: MultiCutReplayPostgresqlAdapterPort = {
    executeStatement: async (input) => {
      assert.equal(input, request);
      return result;
    },
  };

  assert.equal((await port.executeStatement(request)).statementId, request.statementId);
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.parameters), true);
  assert.equal(Object.isFrozen(result), true);
});

test("transaction and failure classifications are exhaustive", () => {
  const scopes: readonly MultiCutReplayPostgresqlTransactionScope[] = [
    "none",
    "required",
    "workflow-completion",
  ];
  const failures: readonly MultiCutReplayPostgresqlDatabaseFailureClassification[] = [
    "retryable",
    "invariant-violation",
    "infrastructure",
    "unavailable",
  ];
  const commitUnknown: readonly MultiCutReplayPostgresqlCommitUnknownClassification[] = [
    "not-unknown",
    "commit-unknown",
  ];
  const retries: readonly MultiCutReplayPostgresqlRetryClassification[] = [
    "retryable",
    "not-retryable",
    "reconcile-first",
  ];

  assert.deepEqual(scopes, ["none", "required", "workflow-completion"]);
  assert.equal(failures.length, 4);
  assert.deepEqual(commitUnknown, ["not-unknown", "commit-unknown"]);
  assert.deepEqual(retries, ["retryable", "not-retryable", "reconcile-first"]);
});

test("commit unknown is classified without recovery implementation", () => {
  const result: MultiCutReplayPostgresqlStatementExecutionResult = {
    resultVersion: "1.0",
    status: "commit-unknown",
    statementId: "takeover-stale-processing-replay",
    affectedRowInterpretation: "not-applicable",
    opaquePayload: undefined,
    executionMetadata: {
      metadataVersion: "1.0",
      transactionScope: "required",
      affectedRowInterpretation: "not-applicable",
    },
    commitUnknown: "commit-unknown",
    retry: "reconcile-first",
  };

  assert.equal(result.status, "commit-unknown");
  assert.equal(result.retry, "reconcile-first");
  assert.equal("failure" in result, false);
});

test("port package is type-only and imports the catalog in one direction", async () => {
  const [typesSource, indexSource, catalogSource] = await Promise.all([
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayPostgresqlAdapterPort/types.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayPostgresqlAdapterPort/index.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const source = `${typesSource}\n${indexSource}`;

  assert.match(
    typesSource,
    /import\s+type\s*\{[\s\S]*MultiCutReplayPostgresqlStatementId/,
  );
  assert.doesNotMatch(typesSource, /import\s+(?!type\b)/);
  assert.doesNotMatch(indexSource, /export\s+(?!type\b)/);
  assert.doesNotMatch(
    catalogSource,
    /multiCutReplayPostgresqlAdapterPort/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:const|let|var|function|class|enum|namespace)\b/,
  );
  assert.doesNotMatch(
    source,
    /(?:node:|next\/|react|node:fs|filesystem|process\.env|globalThis|Date\.now|Math\.random|fetch\s*\(|console\.|postgresqlDriver|database client|query builder|Store|Adapter implementation)/i,
  );
  assert.doesNotMatch(
    source,
    /\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE|RETURNING|ROLLBACK)\b|ON\s+CONFLICT|\$\d+|::[a-z]/,
  );
});
