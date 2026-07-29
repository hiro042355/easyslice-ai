import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMultiCutReplayPostgresqlClient,
  MULTI_CUT_REPLAY_POSTGRESQL_CLIENT_FACTORY,
  MULTI_CUT_REPLAY_POSTGRESQL_CLIENT_METADATA,
} from "../../../lib/server/multiCutReplayPostgresqlClient";
import type {
  MultiCutReplayPostgresqlClientTransactionScope,
  MultiCutReplayPostgresqlConnection,
  MultiCutReplayPostgresqlPreparedStatement,
  MultiCutReplayPostgresqlQueryResult,
} from "../../../lib/server/multiCutReplayPostgresqlClient";

const cancellation = Object.freeze({
  cancellationVersion: "1.0" as const,
  requested: false,
  propagation: "client-boundary" as const,
  opaqueSignalReference: "cancellation:opaque",
});

const queryResult: MultiCutReplayPostgresqlQueryResult = Object.freeze({
  resultVersion: "1.0",
  statementIdentifier: "lookup-authoritative-replay",
  opaqueResult: Object.freeze({ opaque: "result" }),
  metadata: Object.freeze({
    metadataVersion: "1.0",
    affectedRowCount: 1,
    cancellationPropagated: false,
  }),
});

const connection: MultiCutReplayPostgresqlConnection = Object.freeze({
  connectionVersion: "1.0",
  opaqueConnectionReference: "connection:opaque",
  ownership: "connection-lifetime-capability",
  query: Object.freeze({
    execute: async () => queryResult,
  }),
});

test("client exports immutable capability metadata and factory", () => {
  assert.equal(
    Object.isFrozen(MULTI_CUT_REPLAY_POSTGRESQL_CLIENT_METADATA),
    true,
  );
  assert.equal(
    Object.isFrozen(MULTI_CUT_REPLAY_POSTGRESQL_CLIENT_FACTORY),
    true,
  );
  assert.equal(
    MULTI_CUT_REPLAY_POSTGRESQL_CLIENT_METADATA.queryTextBoundary,
    "not-exposed",
  );
});

test("client delegates connection lifetime without implementation", async () => {
  const calls: string[] = [];
  const acquisitionRequest = Object.freeze({
    requestVersion: "1.0" as const,
    ownership: "connection-lifetime-capability" as const,
    cancellation,
  });
  const releaseRequest = Object.freeze({
    requestVersion: "1.0" as const,
    connection,
    ownership: "connection-lifetime-capability" as const,
  });
  const client = createMultiCutReplayPostgresqlClient({
    connectionLifetime: Object.freeze({
      acquire: async (request) => {
        calls.push("acquire");
        assert.equal(request, acquisitionRequest);
        return connection;
      },
      release: async (request) => {
        calls.push("release");
        assert.equal(request, releaseRequest);
      },
    }),
  });

  assert.equal(await client.acquire(acquisitionRequest), connection);
  await client.release(releaseRequest);
  assert.deepEqual(calls, ["acquire", "release"]);
  assert.equal(Object.isFrozen(client), true);
  assert.equal(client.metadata, MULTI_CUT_REPLAY_POSTGRESQL_CLIENT_METADATA);
});

test("transaction scopes and cancellation remain readonly metadata", () => {
  const scopes: readonly MultiCutReplayPostgresqlClientTransactionScope[] = [
    "read-consistent",
    "required",
    "workflow-completion",
  ];
  const transaction = Object.freeze({
    transactionVersion: "1.0" as const,
    scope: "workflow-completion" as const,
    ownership: "caller" as const,
    opaqueTransactionReference: "transaction:opaque",
  });

  assert.deepEqual(scopes, [
    "read-consistent",
    "required",
    "workflow-completion",
  ]);
  assert.equal(transaction.scope, "workflow-completion");
  assert.equal(cancellation.requested, false);
  assert.equal(cancellation.propagation, "client-boundary");
  assert.equal(Object.isFrozen(transaction), true);
  assert.equal(Object.isFrozen(cancellation), true);
});

test("prepared statement contains identity, parameters, and result metadata only", async () => {
  const preparedStatement: MultiCutReplayPostgresqlPreparedStatement =
    Object.freeze({
      preparedStatementVersion: "1.0",
      statementIdentifier: "lookup-authoritative-replay",
      parameters: Object.freeze({ opaque: "parameter" }),
      expectedResult: Object.freeze({
        metadataVersion: "1.0",
        resultShape: "opaque",
        affectedRowMetadata: "not-applicable",
      }),
    });

  const result = await connection.query.execute(
    Object.freeze({
      requestVersion: "1.0",
      preparedStatement,
      cancellation,
    }),
  );

  assert.equal(result, queryResult);
  assert.equal("sql" in preparedStatement, false);
  assert.equal("queryText" in preparedStatement, false);
  assert.equal(Object.isFrozen(preparedStatement), true);
  assert.equal(Object.isFrozen(preparedStatement.parameters), true);
});

test("client package contains abstractions only and no database library", async () => {
  const [typesSource, clientSource, indexSource, driverSource] =
    await Promise.all([
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlClient/types.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlClient/client.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlClient/index.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlExecutionDriver/types.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  const source = `${typesSource}\n${clientSource}\n${indexSource}`;

  assert.doesNotMatch(
    source,
    /(?:node:|next\/|react|node:fs|filesystem|process\.env|globalThis|Date\.now|Math\.random|fetch\s*\(|database protocol|pooling implementation|query builder|transaction implementation|logging)/i,
  );
  assert.doesNotMatch(
    source,
    /from\s+["'](?:pg|postgres|postgresql|postgres\.js|drizzle|prisma|knex)["']/i,
  );
  assert.doesNotMatch(
    source,
    /\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE|RETURNING|ROLLBACK|COMMIT|BEGIN)\b|ON\s+CONFLICT|\$\d+|::[a-z]/,
  );
  assert.doesNotMatch(source, /\b(?:sql|queryText)\s*:/i);
  assert.doesNotMatch(
    driverSource,
    /multiCutReplayPostgresqlClient/,
  );
});
