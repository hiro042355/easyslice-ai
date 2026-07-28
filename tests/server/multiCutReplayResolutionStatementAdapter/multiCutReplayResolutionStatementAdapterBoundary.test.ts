import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMultiCutReplayResolutionStatementAdapter,
  MULTI_CUT_REPLAY_RESOLUTION_RUNTIME_REQUEST_BUILDER,
  MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS,
} from "../../../lib/server/multiCutReplayResolutionStatementAdapter";
import type {
  MultiCutReplayResolutionStatementAdapterRequest,
} from "../../../lib/server/multiCutReplayResolutionStatementAdapter";
import type {
  MultiCutReplayPostgresqlStatementExecutionResult,
} from "../../../lib/server/multiCutReplayPostgresqlAdapterPort";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG,
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
} from "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog";

const adapterRequest: MultiCutReplayResolutionStatementAdapterRequest =
  Object.freeze({
    requestVersion: "1.0",
    resolutionInput: Object.freeze({
      resolutionInputVersion: "3.0",
      scope: Object.freeze({
        scopeVersion: "1.0",
        replayNamespace: "multi-cut",
        tenant: Object.freeze({
          identityVersion: "1.0",
          protectedTenantIdentity: "tenant:protected",
        }),
        operationIdentity: "operation:one",
      }),
      identity: Object.freeze({
        identityVersion: "1.0",
        keyIdentity: "key:one",
        requestFingerprintIdentity: "fingerprint:one",
      }),
    }),
    transactionContext: Object.freeze({
      contextVersion: "1.0",
      scope: "required",
    }),
  });

const executed = (
  statementId: MultiCutReplayPostgresqlStatementExecutionResult["statementId"],
): MultiCutReplayPostgresqlStatementExecutionResult =>
  Object.freeze({
    resultVersion: "1.0",
    status: "executed",
    statementId,
    affectedRowInterpretation: "exactly-one",
    opaquePayload: Object.freeze({ opaque: "projection-input" }),
    executionMetadata: Object.freeze({
      metadataVersion: "1.0",
      transactionScope: "required",
      affectedRowInterpretation: "exactly-one",
    }),
    commitUnknown: "not-unknown",
  });

test("bindings select only the two resolution catalog statements", () => {
  const [newStatementId, existingStatementId] =
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS;

  assert.equal(
    MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS.newReservation.statementId,
    newStatementId,
  );
  assert.equal(
    MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS.existingReplay.statementId,
    existingStatementId,
  );
  assert.equal(
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[newStatementId]
      .operationKind,
    "resolve-new",
  );
  assert.equal(
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[existingStatementId]
      .operationKind,
    "resolve-existing",
  );
  assert.equal(
    new Set(
      Object.values(MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS).map(
        (binding) => binding.statementId,
      ),
    ).size,
    2,
  );
});

test("request builder keeps resolution input and immutable runtime shape", () => {
  const runtimeRequest =
    MULTI_CUT_REPLAY_RESOLUTION_RUNTIME_REQUEST_BUILDER.build(
      MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS.newReservation
        .statementId,
      adapterRequest,
    );

  assert.equal(Object.isFrozen(runtimeRequest), true);
  assert.equal(Object.isFrozen(runtimeRequest.parameters), true);
  assert.equal(
    runtimeRequest.parameters.resolutionInput,
    adapterRequest.resolutionInput,
  );
  assert.equal(
    runtimeRequest.transactionContext,
    adapterRequest.transactionContext,
  );
});

test("adapter wires both statements to the runtime projection hook", async () => {
  const invoked: string[] = [];
  const projected: string[] = [];
  const adapter = createMultiCutReplayResolutionStatementAdapter({
    executor: {
      executeStatement: async (request) => {
        invoked.push(request.statementId);
        return executed(request.statementId);
      },
    },
    projectionHook: {
      project: (context) => {
        projected.push(context.executionResult.statementId);
        return context.executionResult.affectedRowInterpretation;
      },
    },
    failureHook: {
      projectFailure: () => "failure",
    },
  });

  const newResult = await adapter.dispatchNewReservation(adapterRequest);
  const existingResult =
    await adapter.dispatchExistingReplay(adapterRequest);

  assert.equal(newResult.status, "projected");
  assert.equal(existingResult.status, "projected");
  assert.deepEqual(invoked, projected);
  assert.deepEqual(invoked, [
    MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS.newReservation.statementId,
    MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS.existingReplay.statementId,
  ]);
});

test("commit unknown preserves the authoritative lookup boundary", async () => {
  const failureStatuses: string[] = [];
  const adapter = createMultiCutReplayResolutionStatementAdapter({
    executor: {
      executeStatement: async (request) =>
        Object.freeze({
          resultVersion: "1.0",
          status: "commit-unknown",
          statementId: request.statementId,
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
    },
    projectionHook: {
      project: () => "projection",
    },
    failureHook: {
      projectFailure: (context) => {
        failureStatuses.push(context.executionResult.status);
        return context.executionResult.status;
      },
    },
  });

  const result = await adapter.dispatchNewReservation(adapterRequest);

  assert.equal(result.status, "failure-projected");
  assert.deepEqual(failureStatuses, ["commit-unknown"]);
  assert.equal(
    MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS.newReservation
      .commitUnknownFollowUp,
    "authoritative-lookup",
  );
  assert.equal(
    MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS.existingReplay
      .commitUnknownFollowUp,
    "authoritative-lookup",
  );
});

test("affected-row outcomes remain boundary metadata without interpretation", async () => {
  const boundary =
    MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS.newReservation
      .affectedRowBoundary;
  assert.deepEqual(boundary, {
    success: "exactly-one",
    absence: "zero",
    invariantFailure: "invariant-violation",
  });
  assert.equal(Object.isFrozen(boundary), true);

  const adapter = createMultiCutReplayResolutionStatementAdapter({
    executor: {
      executeStatement: async (request) =>
        Object.freeze({
          resultVersion: "1.0",
          status: "executed",
          statementId: request.statementId,
          affectedRowInterpretation: "zero",
          opaquePayload: Object.freeze({ opaque: "projection-input" }),
          executionMetadata: Object.freeze({
            metadataVersion: "1.0",
            transactionScope: "required",
            affectedRowInterpretation: "zero",
          }),
          commitUnknown: "not-unknown",
        }),
    },
    projectionHook: {
      project: (context) =>
        context.executionResult.affectedRowInterpretation,
    },
    failureHook: {
      projectFailure: () => "failure",
    },
  });

  const result = await adapter.dispatchNewReservation(adapterRequest);
  assert.equal(result.status, "projected");
  assert.equal(result.executionResult.affectedRowInterpretation, "zero");
});

test("package has one-way runtime imports and no infrastructure", async () => {
  const [typesSource, adapterSource, indexSource, runtimeSource, catalogSource] =
    await Promise.all([
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayResolutionStatementAdapter/types.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayResolutionStatementAdapter/adapter.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../lib/server/multiCutReplayResolutionStatementAdapter/index.ts",
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
          "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  const source = `${typesSource}\n${adapterSource}\n${indexSource}`;

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
    runtimeSource,
    /multiCutReplayResolutionStatementAdapter/,
  );
  assert.doesNotMatch(
    catalogSource,
    /multiCutReplayResolutionStatementAdapter/,
  );
  assert.match(adapterSource, /multiCutReplayPostgresqlAdapterRuntime/);
  assert.match(adapterSource, /multiCutReplayPostgresqlStatementCatalog/);
});
