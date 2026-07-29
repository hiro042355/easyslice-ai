import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMultiCutReplayPostgresqlAdapter,
  MULTI_CUT_REPLAY_POSTGRESQL_ADAPTER_OPERATIONS,
} from "../../../lib/server/multiCutReplayPostgresqlAdapter";
import type {
  MultiCutReplayPostgresqlAdapterDependencies,
  MultiCutReplayPostgresqlAdapterRequest,
} from "../../../lib/server/multiCutReplayPostgresqlAdapter";

type Projection = Readonly<{ projection: string }>;
type FailureProjection = Readonly<{ failure: string }>;
type ReconciliationProjection = Readonly<{ reconciliation: string }>;

const projectedResult = Object.freeze({
  resultVersion: "1.0" as const,
  status: "projected" as const,
  projection: Object.freeze({ projection: "opaque" }),
  executionResult: Object.freeze({
    resultVersion: "1.0" as const,
    status: "executed" as const,
    statementId: "resolve-new-reservation" as const,
    affectedRowInterpretation: "exactly-one" as const,
    opaquePayload: Object.freeze({ opaque: true }),
    executionMetadata: Object.freeze({
      metadataVersion: "1.0" as const,
      transactionScope: "required" as const,
      affectedRowInterpretation: "exactly-one" as const,
    }),
    commitUnknown: "not-unknown" as const,
  }),
  runtimeMetadata: Object.freeze({
    metadataVersion: "1.0" as const,
    statement: Object.freeze({
      statementId: "resolve-new-reservation" as const,
      capabilityOwner: "resolution" as const,
      operationKind: "resolve-new" as const,
      accessMode: "write" as const,
      transactionRequirement: "required" as const,
      mutationClassification: "reservation-create" as const,
      commitUnknownStrategy: "authoritative-lookup" as const,
      authoritativeFollowUpRequirement: "conditional" as const,
      reconciliationRequirement: "none" as const,
    }),
  }),
});

const failedResult = Object.freeze({
  resultVersion: "1.0" as const,
  status: "failure-projected" as const,
  failureProjection: Object.freeze({ failure: "opaque" }),
  executionResult: Object.freeze({
    resultVersion: "1.0" as const,
    status: "failed" as const,
    statementId: "renew-processing-reservation" as const,
    affectedRowInterpretation: "zero" as const,
    opaquePayload: undefined,
    executionMetadata: Object.freeze({
      metadataVersion: "1.0" as const,
      transactionScope: "required" as const,
      affectedRowInterpretation: "zero" as const,
    }),
    failure: "invariant-violation" as const,
    commitUnknown: "not-unknown" as const,
    retry: "not-retryable" as const,
  }),
  runtimeMetadata: Object.freeze({
    metadataVersion: "1.0" as const,
    statement: Object.freeze({
      statementId: "renew-processing-reservation" as const,
      capabilityOwner: "lifecycle" as const,
      operationKind: "renew" as const,
      accessMode: "write" as const,
      transactionRequirement: "required" as const,
      mutationClassification: "reservation-refresh" as const,
      commitUnknownStrategy: "reservation-reconciliation" as const,
      authoritativeFollowUpRequirement: "conditional" as const,
      reconciliationRequirement: "reservation-mutation" as const,
    }),
  }),
});

const commitUnknownResult = Object.freeze({
  resultVersion: "1.0" as const,
  status: "failure-projected" as const,
  failureProjection: Object.freeze({ reconciliation: "opaque" }),
  executionResult: Object.freeze({
    resultVersion: "1.0" as const,
    status: "commit-unknown" as const,
    statementId: "takeover-stale-processing-replay" as const,
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
  runtimeMetadata: Object.freeze({
    metadataVersion: "1.0" as const,
    statement: Object.freeze({
      statementId: "takeover-stale-processing-replay" as const,
      capabilityOwner: "recovery" as const,
      operationKind: "takeover" as const,
      accessMode: "write" as const,
      transactionRequirement: "required" as const,
      mutationClassification: "ownership-takeover" as const,
      commitUnknownStrategy: "reservation-reconciliation" as const,
      authoritativeFollowUpRequirement: "conditional" as const,
      reconciliationRequirement: "reservation-mutation" as const,
    }),
  }),
});

const createDependencies = (
  calls: Array<Readonly<{ route: string; request: unknown }>>,
): MultiCutReplayPostgresqlAdapterDependencies<
  Projection,
  FailureProjection,
  ReconciliationProjection
> => Object.freeze({
  resolution: Object.freeze({
    dispatchNewReservation: async (request: unknown) => {
      calls.push({ route: "resolution:new", request });
      return projectedResult;
    },
    dispatchExistingReplay: async (request: unknown) => {
      calls.push({ route: "resolution:existing", request });
      return projectedResult;
    },
  }),
  lifecycle: Object.freeze({
    dispatchRenew: async (request: unknown) => {
      calls.push({ route: "lifecycle:renew", request });
      return failedResult;
    },
    dispatchComplete: async (request: unknown) => {
      calls.push({ route: "lifecycle:complete", request });
      return projectedResult;
    },
    dispatchFail: async (request: unknown) => {
      calls.push({ route: "lifecycle:fail", request });
      return failedResult;
    },
    dispatchRelease: async (request: unknown) => {
      calls.push({ route: "lifecycle:release", request });
      return projectedResult;
    },
  }),
  recovery: Object.freeze({
    dispatchLookup: async (request: unknown) => {
      calls.push({ route: "recovery:lookup", request });
      return projectedResult;
    },
    dispatchTakeover: async (request: unknown) => {
      calls.push({ route: "recovery:takeover", request });
      return commitUnknownResult;
    },
  }),
});

test("shell exports exactly eight stable operations", () => {
  assert.deepEqual(MULTI_CUT_REPLAY_POSTGRESQL_ADAPTER_OPERATIONS, [
    "resolve-new-reservation",
    "resolve-existing-replay",
    "renew-processing-reservation",
    "complete-processing-replay",
    "fail-processing-replay",
    "release-processing-replay",
    "lookup-authoritative-replay",
    "takeover-stale-processing-replay",
  ]);
  assert.equal(MULTI_CUT_REPLAY_POSTGRESQL_ADAPTER_OPERATIONS.length, 8);
  assert.equal(
    new Set(MULTI_CUT_REPLAY_POSTGRESQL_ADAPTER_OPERATIONS).size,
    8,
  );
});

test("named methods route to only their owning capability adapter", async () => {
  const calls: Array<Readonly<{ route: string; request: unknown }>> = [];
  const adapter = createMultiCutReplayPostgresqlAdapter(
    createDependencies(calls),
  );
  const requests = Array.from(
    { length: 8 },
    (_, index) => Object.freeze({ requestIdentity: index }),
  );

  await adapter.resolveNewReservation(requests[0] as never);
  await adapter.resolveExistingReplay(requests[1] as never);
  await adapter.renewProcessingReservation(requests[2] as never);
  await adapter.completeProcessingReplay(requests[3] as never);
  await adapter.failProcessingReplay(requests[4] as never);
  await adapter.releaseProcessingReplay(requests[5] as never);
  await adapter.lookupAuthoritativeReplay(requests[6] as never);
  await adapter.takeoverStaleProcessingReplay(requests[7] as never);

  assert.deepEqual(
    calls.map((call) => call.route),
    [
      "resolution:new",
      "resolution:existing",
      "lifecycle:renew",
      "lifecycle:complete",
      "lifecycle:fail",
      "lifecycle:release",
      "recovery:lookup",
      "recovery:takeover",
    ],
  );
  assert.deepEqual(
    calls.map((call) => call.request),
    requests,
  );
});

test("typed dispatch is exhaustive and passes requests unchanged", async () => {
  const calls: Array<Readonly<{ route: string; request: unknown }>> = [];
  const adapter = createMultiCutReplayPostgresqlAdapter(
    createDependencies(calls),
  );
  const innerRequests = Array.from(
    { length: 8 },
    (_, index) => Object.freeze({ requestIdentity: index }),
  );
  const shellRequests = [
    {
      operation: "resolve-new-reservation",
      request: innerRequests[0] as never,
    },
    {
      operation: "resolve-existing-replay",
      request: innerRequests[1] as never,
    },
    {
      operation: "renew-processing-reservation",
      request: innerRequests[2] as never,
    },
    {
      operation: "complete-processing-replay",
      request: innerRequests[3] as never,
    },
    {
      operation: "fail-processing-replay",
      request: innerRequests[4] as never,
    },
    {
      operation: "release-processing-replay",
      request: innerRequests[5] as never,
    },
    {
      operation: "lookup-authoritative-replay",
      request: innerRequests[6] as never,
    },
    {
      operation: "takeover-stale-processing-replay",
      request: innerRequests[7] as never,
    },
  ] as const satisfies readonly MultiCutReplayPostgresqlAdapterRequest[];

  for (const shellRequest of shellRequests) {
    await adapter.dispatch(shellRequest);
  }

  assert.equal(calls.length, 8);
  assert.deepEqual(
    calls.map((call) => call.request),
    innerRequests,
  );
});

test("results, failures, and commit unknown are returned unchanged", async () => {
  const adapter = createMultiCutReplayPostgresqlAdapter(
    createDependencies([]),
  );

  assert.equal(
    await adapter.resolveNewReservation(Object.freeze({}) as never),
    projectedResult,
  );
  assert.equal(
    await adapter.renewProcessingReservation(Object.freeze({}) as never),
    failedResult,
  );
  assert.equal(
    await adapter.takeoverStaleProcessingReplay(
      Object.freeze({}) as never,
    ),
    commitUnknownResult,
  );
});

test("composition is immutable and has no registration surface", () => {
  const dependencies = createDependencies([]);
  const adapter = createMultiCutReplayPostgresqlAdapter(dependencies);

  assert.equal(Object.isFrozen(dependencies), true);
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal("register" in adapter, false);
  assert.equal("unregister" in adapter, false);
  assert.equal("replace" in adapter, false);
  assert.equal(Object.keys(adapter).length, 9);
});

test("shell imports only capability adapters and no infrastructure", async () => {
  const [
    typesSource,
    adapterSource,
    indexSource,
    resolutionSource,
    lifecycleSource,
    recoverySource,
  ] = await Promise.all([
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayPostgresqlAdapter/types.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayPostgresqlAdapter/adapter.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayPostgresqlAdapter/index.ts",
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
        "../../../lib/server/multiCutReplayLifecycleStatementAdapter/adapter.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayRecoveryStatementAdapter/adapter.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const source = `${typesSource}\n${adapterSource}\n${indexSource}`;

  assert.match(typesSource, /multiCutReplayResolutionStatementAdapter/);
  assert.match(typesSource, /multiCutReplayLifecycleStatementAdapter/);
  assert.match(typesSource, /multiCutReplayRecoveryStatementAdapter/);
  assert.doesNotMatch(
    source,
    /(?:multiCutRequestAdmission|multiCutReplayLifecycle\/types|multiCutReplayShared)/,
  );
  assert.doesNotMatch(
    source,
    /(?:node:|next\/|react|node:fs|filesystem|process\.env|globalThis|Date\.now|Math\.random|fetch\s*\(|database client|query builder|transaction implementation)/i,
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
  assert.doesNotMatch(adapterSource, /\b(?:Map|register|unregister)\b/);
  for (const upstream of [
    resolutionSource,
    lifecycleSource,
    recoverySource,
  ]) {
    assert.doesNotMatch(
      upstream,
      /from\s+["'][^"']*\/multiCutReplayPostgresqlAdapter["']/,
    );
  }
});
