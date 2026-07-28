import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMultiCutReplayPostgresqlAdapterRuntime,
} from "../../../lib/server/multiCutReplayPostgresqlAdapterRuntime";
import type {
  MultiCutReplayPostgresqlAdapterRuntimeRequest,
} from "../../../lib/server/multiCutReplayPostgresqlAdapterRuntime";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
} from "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog";
import type {
  MultiCutReplayPostgresqlStatementExecutionResult,
} from "../../../lib/server/multiCutReplayPostgresqlAdapterPort";

const request = (
  statementId: MultiCutReplayPostgresqlAdapterRuntimeRequest["statementId"],
): MultiCutReplayPostgresqlAdapterRuntimeRequest =>
  Object.freeze({
    requestVersion: "1.0",
    statementId,
    parameters: Object.freeze({ opaque: "parameter" }),
    transactionContext: Object.freeze({
      contextVersion: "1.0",
      scope: "required",
    }),
  });

const executed = (
  statementId: MultiCutReplayPostgresqlAdapterRuntimeRequest["statementId"],
): MultiCutReplayPostgresqlStatementExecutionResult =>
  Object.freeze({
    resultVersion: "1.0",
    status: "executed",
    statementId,
    affectedRowInterpretation: "exactly-one",
    opaquePayload: Object.freeze({ opaque: "payload" }),
    executionMetadata: Object.freeze({
      metadataVersion: "1.0",
      transactionScope: "required",
      affectedRowInterpretation: "exactly-one",
    }),
    commitUnknown: "not-unknown",
  });

test("runtime dispatches every catalog identifier through the port", async () => {
  const observed: string[] = [];
  const runtime = createMultiCutReplayPostgresqlAdapterRuntime({
    executor: {
      executeStatement: async (portRequest) => {
        observed.push(portRequest.statementId);
        assert.equal(portRequest.requestVersion, "1.0");
        return executed(portRequest.statementId);
      },
    },
    projectionHook: {
      project: (context) => context.executionResult.statementId,
    },
    failureHook: {
      projectFailure: () => "failure",
    },
  });

  for (const statementId of MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS) {
    const result = await runtime.dispatch(request(statementId));
    assert.equal(result.status, "projected");
    assert.equal(result.runtimeMetadata.statement.statementId, statementId);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.runtimeMetadata), true);
    assert.equal(Object.isFrozen(result.runtimeMetadata.statement), true);
  }

  assert.deepEqual(observed, MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS);
});

test("runtime exposes projection and failure boundaries without classification logic", async () => {
  const failures: MultiCutReplayPostgresqlStatementExecutionResult[] = [
    Object.freeze({
      resultVersion: "1.0",
      status: "failed",
      statementId: "renew-processing-reservation",
      affectedRowInterpretation: "zero",
      opaquePayload: undefined,
      executionMetadata: Object.freeze({
        metadataVersion: "1.0",
        transactionScope: "required",
        affectedRowInterpretation: "zero",
      }),
      failure: "invariant-violation",
      commitUnknown: "not-unknown",
      retry: "not-retryable",
    }),
    Object.freeze({
      resultVersion: "1.0",
      status: "commit-unknown",
      statementId: "renew-processing-reservation",
      affectedRowInterpretation: "not-applicable",
      opaquePayload: undefined,
      executionMetadata: Object.freeze({
        metadataVersion: "1.0",
        transactionScope: "required",
        affectedRowInterpretation: "not-applicable",
      }),
      commitUnknown: "commit-unknown",
      retry: "reconcile-first",
    }),
  ];
  let projectionCalls = 0;
  const failureContexts: unknown[] = [];
  const runtime = createMultiCutReplayPostgresqlAdapterRuntime({
    executor: {
      executeStatement: async () => failures.shift()!,
    },
    projectionHook: {
      project: () => {
        projectionCalls += 1;
        return "projected";
      },
    },
    failureHook: {
      projectFailure: (context) => {
        failureContexts.push(context);
        return context.executionResult.status;
      },
    },
  });

  const failed = await runtime.dispatch(
    request("renew-processing-reservation"),
  );
  const unknown = await runtime.dispatch(
    request("renew-processing-reservation"),
  );

  assert.equal(failed.status, "failure-projected");
  assert.equal(unknown.status, "failure-projected");
  assert.equal(projectionCalls, 0);
  assert.equal(failureContexts.length, 2);
  assert.equal(Object.isFrozen(failureContexts[0]), true);
  assert.equal(failed.executionResult.status, "failed");
  assert.equal(unknown.executionResult.status, "commit-unknown");
});

test("runtime forwards immutable request fields without cloning opaque values", async () => {
  const runtimeRequest = request("complete-processing-replay");
  let invocationCount = 0;
  const runtime = createMultiCutReplayPostgresqlAdapterRuntime({
    executor: {
      executeStatement: async (portRequest) => {
        invocationCount += 1;
        assert.equal(portRequest.parameters, runtimeRequest.parameters);
        assert.equal(
          portRequest.transactionContext,
          runtimeRequest.transactionContext,
        );
        assert.equal(Object.isFrozen(portRequest), true);
        return executed(portRequest.statementId);
      },
    },
    projectionHook: {
      project: (context) => {
        assert.equal(Object.isFrozen(context), true);
        return context.executionResult.affectedRowInterpretation;
      },
    },
    failureHook: {
      projectFailure: () => "failure",
    },
  });

  await runtime.dispatch(runtimeRequest);
  assert.equal(invocationCount, 1);
});

test("runtime source has isolated one-way imports and no infrastructure", async () => {
  const [typesSource, runtimeSource, indexSource, catalogSource, portSource] =
    await Promise.all([
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlAdapterRuntime/types.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlAdapterRuntime/runtime.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlAdapterRuntime/index.ts",
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
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayPostgresqlAdapterPort/types.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  const source = `${typesSource}\n${runtimeSource}\n${indexSource}`;

  assert.doesNotMatch(
    source,
    /(?:node:|next\/|react|node:fs|filesystem|process\.env|globalThis|Date\.now|Math\.random|fetch\s*\(|database client|query builder|transaction implementation|Workflow|Route|HTTP)/i,
  );
  assert.doesNotMatch(source, /from\s+["'](?:pg|postgres|postgresql)["']/);
  assert.doesNotMatch(
    source,
    /\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE|RETURNING|ROLLBACK)\b|ON\s+CONFLICT|\$\d+|::[a-z]/,
  );
  assert.doesNotMatch(
    catalogSource,
    /multiCutReplayPostgresqlAdapterRuntime/,
  );
  assert.doesNotMatch(
    portSource,
    /multiCutReplayPostgresqlAdapterRuntime/,
  );
  assert.match(runtimeSource, /multiCutReplayPostgresqlStatementCatalog/);
  assert.match(typesSource, /multiCutReplayPostgresqlAdapterPort/);
});
