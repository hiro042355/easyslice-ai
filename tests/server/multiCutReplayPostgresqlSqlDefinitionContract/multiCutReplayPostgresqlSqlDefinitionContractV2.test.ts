import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2 } from "../../../lib/server/multiCutReplayPersistenceParameters";
import { MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2 } from "../../../lib/server/multiCutReplayPhysicalSchema/physicalSchemaV2";
import { MULTI_CUT_REPLAY_SQL_DEFINITION_CONTRACT_V2 as contract } from "../../../lib/server/multiCutReplayPostgresqlSqlDefinitionContract";
import { MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS } from "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog";

test("contract covers exactly the eight catalog statements", () => {
  assert.deepEqual(
    contract.statements.map(({ statementId }) => statementId),
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
  );
});

test("placeholder ordinals, casts, and physical bindings are canonical", () => {
  const columns = new Set(
    MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2.table.columns.map(({ name }) => name),
  );
  for (const statement of contract.statements) {
    assert.deepEqual(
      statement.placeholders.map(({ ordinal }) => ordinal),
      statement.placeholders.map((_, index) => index + 1),
      statement.statementId,
    );
    for (const placeholder of statement.placeholders) {
      assert.equal(placeholder.placeholder, `$${placeholder.ordinal}`);
      assert.ok(placeholder.postgresqlCast);
      assert.ok(
        columns.has(placeholder.physicalField) ||
          placeholder.parameterBinding === "lease_duration_milliseconds",
        `${statement.statementId}:${placeholder.physicalField}`,
      );
    }
  }
});

test("predicate and continuity order are fixed", () => {
  assert.deepEqual(contract.canonicalContinuityOrder, [
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
  ]);
  assert.deepEqual(contract.successorSources, {
    revision: "revision",
    last_fencing_token: "last_fencing_token",
    last_reservation_attempt: "last_reservation_attempt",
  });
  const released = contract.statements.find(
    ({ statementId }) => statementId === "resolve-existing-replay",
  );
  const positions = contract.canonicalContinuityOrder.map((field) =>
    released?.orderedPredicates.findIndex(
      ({ physicalField }) => physicalField === field,
    ),
  );
  assert.ok(positions.every((position) => position !== undefined && position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left! - right!));
});

test("mutation and projection matrices cover every physical field", () => {
  const physicalFields =
    MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2.table.columns.map(({ name }) => name);
  for (const statement of contract.statements) {
    assert.deepEqual(
      statement.mutations.map(({ physicalField }) => physicalField),
      physicalFields,
      statement.statementId,
    );
    assert.ok(statement.projections.length >= 2, statement.statementId);
    for (const projection of statement.projections) {
      for (const field of projection.orderedFields) {
        assert.ok(field.physicalField);
        assert.ok(field.logicalOutput);
        assert.equal(field.canonicalAlias, field.physicalField);
      }
    }
    assert.deepEqual(statement.cardinality, {
      success: "one",
      zeroAllowed: true,
      multiple: "invariant-violation",
    });
    assert.equal(statement.zeroRowContract.ambiguity, "not-single-cause");
  }
});

test("predicate authority is complete and source-explicit", () => {
  for (const statement of contract.statements) {
    for (const predicate of statement.orderedPredicates) {
      assert.ok(predicate.comparisonOperator, statement.statementId);
      assert.ok(predicate.comparisonSource, statement.statementId);
      assert.ok(predicate.sourceReference, statement.statementId);
      assert.ok(predicate.literalSource, statement.statementId);
      assert.ok(predicate.nullSemantics, statement.statementId);
      assert.ok(predicate.evaluationRole, statement.statementId);
    }
  }
  const released = contract.statements.find(
    ({ statementId }) => statementId === "resolve-existing-replay",
  );
  assert.deepEqual(
    released?.orderedPredicates.find(({ physicalField }) => physicalField === "state"),
    {
      physicalField: "state",
      comparisonOperator: "=",
      comparisonSource: "literal",
      sourceReference: "literal:released",
      literalSource: "statement-lifecycle-authority",
      nullSemantics: "null-never-matches",
      evaluationRole: "state",
    },
  );
});

test("resolution gate v3 reaches one exact placeholder for every placeholder predicate", () => {
  const expectedCompletedBindings = new Set([
    "renew-processing-reservation:last_fencing_token",
    "renew-processing-reservation:last_reservation_attempt",
    "complete-processing-replay:last_fencing_token",
    "complete-processing-replay:last_reservation_attempt",
    "fail-processing-replay:last_fencing_token",
    "fail-processing-replay:last_reservation_attempt",
    "release-processing-replay:last_fencing_token",
    "release-processing-replay:last_reservation_attempt",
  ]);
  const completedBindings = new Set<string>();
  const predicateIds = new Set<string>();
  for (const statement of contract.statements) {
    const placeholderPredicates = statement.orderedPredicates.filter(
      ({ comparisonSource }) => comparisonSource === "placeholder",
    );
    assert.equal(
      statement.predicateBindings.length,
      placeholderPredicates.length,
      statement.statementId,
    );
    const placeholdersById = new Map(
      statement.placeholders.map((placeholder) => [
        `${statement.statementId}:placeholder:${placeholder.ordinal}`,
        placeholder,
      ]),
    );
    for (const binding of statement.predicateBindings) {
      assert.equal(predicateIds.has(binding.predicateId), false);
      predicateIds.add(binding.predicateId);
      const predicate = statement.orderedPredicates.find(
        ({ physicalField, sourceReference }) =>
          physicalField === binding.physicalField &&
          sourceReference === binding.bindingReference,
      );
      assert.ok(predicate, binding.predicateId);
      const placeholder = placeholdersById.get(binding.placeholderId);
      assert.ok(placeholder, binding.placeholderId);
      assert.equal(binding.placeholderOrdinal, placeholder.ordinal);
      assert.equal(binding.placeholderToken, placeholder.placeholder);
      assert.equal(binding.postgresqlCast, placeholder.postgresqlCast);
      assert.equal(binding.bindingId, placeholder.parameterBinding);
      assert.equal(binding.comparisonRole, predicate.evaluationRole);
      if (
        binding.resolutionRule ===
        "persistent-continuity-from-active-evidence-placeholder"
      ) {
        completedBindings.add(
          `${statement.statementId}:${binding.physicalField}`,
        );
        assert.equal(
          binding.physicalField === "last_fencing_token"
            ? placeholder.physicalField
            : placeholder.physicalField,
          binding.physicalField === "last_fencing_token"
            ? "fencing_token"
            : "reservation_attempt",
        );
      } else {
        assert.equal(binding.bindingReference, binding.placeholderToken);
      }
    }
  }
  assert.deepEqual(completedBindings, expectedCompletedBindings);
});

test("assignment and successor authorities are complete", () => {
  for (const statement of contract.statements) {
    for (const mutation of statement.mutations) {
      assert.ok(mutation.assignmentSource, statement.statementId);
      assert.ok(mutation.sourceReference, statement.statementId);
    }
    for (const field of contract.canonicalContinuityOrder) {
      const reference = statement.successorReferences[field];
      assert.ok(
        reference === "not-used" ||
          reference === `successor:${statement.statementId}:${field}:checked` ||
          reference === `successor:${statement.statementId}:${field}:retain`,
      );
    }
  }
});

test("reference registry is unique and resolves every assignment and successor", () => {
  const ids = contract.referenceRegistry.map(({ referenceId }) => referenceId);
  assert.equal(new Set(ids).size, ids.length);
  const registry = new Map(
    contract.referenceRegistry.map((entry) => [entry.referenceId, entry]),
  );
  for (const required of [
    "parameter-successor:revision",
    "parameter-successor:last_fencing_token",
    "parameter-successor:last_reservation_attempt",
    "initial:revision",
    "initial:last_fencing_token",
    "initial:last_reservation_attempt",
    "initial:state",
    "initial:schema_version",
    "projection:lookup",
    "projection:returning",
    "projection:reconciliation",
  ]) {
    assert.ok(registry.has(required), required);
  }
  for (const statement of contract.statements) {
    const updateMutations =
      statement.statementId === "resolve-new-reservation" ||
      statement.statementId === "lookup-authoritative-replay"
        ? []
        : statement.mutations;
    for (const mutation of updateMutations) {
      const resolution = registry.get(mutation.sourceReference);
      assert.ok(resolution, mutation.sourceReference);
      assert.equal(resolution.targetMetadata.physicalFields.length, 1);
      assert.equal(
        resolution.targetMetadata.physicalFields[0],
        mutation.physicalField,
      );
      assert.doesNotMatch(resolution.targetMetadata.valueReference, /^projection:/);
    }
    for (const reference of Object.values(statement.successorReferences)) {
      assert.ok(reference === "not-used" || registry.has(reference), reference);
    }
  }
});

test("resolution gate v2 reaches exactly one terminal for every registered reference", () => {
  const references = contract.referenceRegistry.map(({ referenceId }) => referenceId);
  const terminals = contract.terminalResolutionRegistry;
  assert.equal(new Set(references).size, references.length);
  assert.equal(
    new Set(terminals.map(({ referenceId }) => referenceId)).size,
    terminals.length,
  );
  assert.deepEqual(
    terminals.map(({ referenceId }) => referenceId),
    references,
  );
  const forbidden = /contract-defined|authority-defined|parameter-defined|implementation-defined|renderer-choice|projection-fallback|generated-elsewhere/;
  for (const terminal of terminals) {
    assert.ok(terminal.terminalTarget, terminal.referenceId);
    assert.ok(terminal.deterministicResolutionRule, terminal.referenceId);
    assert.ok(terminal.authoritySource, terminal.referenceId);
    assert.ok(terminal.postgresqlCast, terminal.referenceId);
    assert.doesNotMatch(terminal.terminalTarget, forbidden);
    assert.equal(terminal.recursiveResolutionPath[0], terminal.referenceId);
    assert.equal(
      new Set(terminal.recursiveResolutionPath).size,
      terminal.recursiveResolutionPath.length,
      terminal.referenceId,
    );
    if (terminal.targetReferenceId) {
      assert.ok(references.includes(terminal.targetReferenceId));
      assert.equal(
        terminal.recursiveResolutionPath.at(-1),
        terminal.targetReferenceId,
      );
    }
  }
});

test("all logical predicate and insert references are registered and terminal", () => {
  const references = new Set(
    contract.referenceRegistry.map(({ referenceId }) => referenceId),
  );
  const terminals = new Set(
    contract.terminalResolutionRegistry.map(({ referenceId }) => referenceId),
  );
  const used: string[] = [];
  for (const statement of contract.statements) {
    for (const predicate of statement.orderedPredicates) {
      if (/^(literal|postgresql-expression):/.test(predicate.sourceReference)) {
        used.push(predicate.sourceReference);
      }
    }
    for (const source of statement.insertSources) {
      if (source.source === "generated") {
        used.push(source.expressionReference);
      }
    }
    if (
      statement.statementId !== "resolve-new-reservation" &&
      statement.statementId !== "lookup-authoritative-replay"
    ) {
      used.push(...statement.mutations.map(({ sourceReference }) => sourceReference));
    }
    used.push(
      ...Object.values(statement.successorReferences).filter(
        (reference) => reference !== "not-used",
      ),
    );
  }
  for (const reference of new Set(used)) {
    assert.ok(references.has(reference), reference);
    assert.ok(terminals.has(reference), reference);
  }
});

test("literal, generated, successor, binding, retain, clear, and projection terminals are exact", () => {
  const byId = new Map(
    contract.terminalResolutionRegistry.map((entry) => [entry.referenceId, entry]),
  );
  for (const [referenceId, target] of [
    ["literal:processing", "processing"],
    ["literal:completed", "completed"],
    ["literal:failed", "failed"],
    ["literal:released", "released"],
    ["initial:revision", "1"],
    ["initial:last_fencing_token", "1"],
    ["initial:last_reservation_attempt", "1"],
    ["initial:fencing_token", "1"],
    ["initial:reservation_attempt", "1"],
    ["initial:schema_version", "2.0"],
  ]) {
    assert.equal(byId.get(referenceId)?.terminalTarget, target, referenceId);
    assert.equal(
      byId.get(referenceId)?.terminalResolutionKind,
      "exact-literal",
      referenceId,
    );
  }
  assert.equal(
    byId.get("postgresql-expression:authoritative-current-time")?.terminalTarget,
    "transaction_timestamp()",
  );
  for (const entry of contract.terminalResolutionRegistry.filter(
    ({ referenceId }) => referenceId.includes("lease-expiry"),
  )) {
    assert.equal(
      entry.terminalTarget,
      "transaction_timestamp()+validated-lease-duration-milliseconds",
    );
    assert.equal(entry.postgresqlCast, "timestamptz");
  }
  for (const entry of contract.terminalResolutionRegistry.filter(
    ({ referenceId }) => referenceId.startsWith("parameter-successor:"),
  )) {
    assert.equal(
      entry.terminalResolutionKind,
      "exact-checked-successor-definition",
    );
    assert.match(entry.deterministicResolutionRule, /exactly-one/);
  }
  assert.ok(
    contract.terminalResolutionRegistry.some(
      ({ terminalResolutionKind }) =>
        terminalResolutionKind === "exact-placeholder-binding",
    ),
  );
  assert.ok(
    contract.terminalResolutionRegistry.some(
      ({ terminalResolutionKind }) =>
        terminalResolutionKind === "exact-retained-field",
    ),
  );
  assert.ok(
    contract.terminalResolutionRegistry.some(
      ({ terminalResolutionKind }) =>
        terminalResolutionKind === "exact-cleared-field",
    ),
  );
  assert.ok(
    contract.terminalResolutionRegistry.some(
      ({ terminalResolutionKind }) =>
        terminalResolutionKind === "exact-projection-field-and-alias",
    ),
  );
});

test("resolution gate v4 classifies every assignment terminal without renderer inference", () => {
  const assignments = contract.terminalResolutionRegistry.filter(
    ({ referenceId }) => referenceId.startsWith("assignment:"),
  );
  assert.ok(assignments.length > 0);
  const states = new Set(["processing", "completed", "failed", "released"]);
  for (const assignment of assignments) {
    assert.ok(assignment.terminalResolutionKind, assignment.referenceId);
    assert.ok(assignment.terminalTarget, assignment.referenceId);
    if (states.has(assignment.terminalTarget)) {
      assert.equal(
        assignment.terminalResolutionKind,
        "exact-literal",
        assignment.referenceId,
      );
    }
    if (assignment.terminalTarget === "1.0") {
      assert.equal(
        assignment.terminalResolutionKind,
        "exact-literal",
        assignment.referenceId,
      );
    }
    if (assignment.targetReferenceId?.startsWith("successor:")) {
      assert.equal(
        assignment.terminalResolutionKind,
        "exact-checked-successor-definition",
        assignment.referenceId,
      );
    }
    if (
      assignment.terminalResolutionKind ===
      "exact-postgresql-generated-expression-authority"
    ) {
      assert.match(
        assignment.terminalTarget,
        /transaction_timestamp|lease-duration/,
        assignment.referenceId,
      );
    }
    if (
      assignment.terminalResolutionKind === "exact-literal" ||
      assignment.terminalResolutionKind ===
        "exact-checked-successor-definition"
    ) {
      assert.doesNotMatch(
        assignment.terminalTarget,
        /lease-duration/,
        assignment.referenceId,
      );
    }
    assert.doesNotMatch(
      assignment.deterministicResolutionRule,
      /renderer|infer|implementation-defined/,
      assignment.referenceId,
    );
  }
});

test("checked successors share one authoritative expression per reference", () => {
  const checked = contract.referenceRegistry.filter(
    ({ referenceId }) =>
      referenceId.startsWith("successor:") && referenceId.endsWith(":checked"),
  );
  assert.ok(checked.length > 0);
  for (const resolution of checked) {
    assert.equal(
      resolution.expressionSharing,
      "same-reference-same-authoritative-expression",
    );
    assert.match(
      resolution.targetMetadata.valueReference,
      /^parameter-successor:/,
    );
  }
});

test("lookup projection registry is complete and absence is explicit", () => {
  assert.deepEqual(
    contract.lookupProjectionRegistry.map(({ group }) => group),
    [
      "identity",
      "protected-scope",
      "semantic-fingerprint",
      "replay-state",
      "persistent-continuity",
      "active-processing-evidence",
      "terminal-metadata",
      "result-metadata",
      "reconciliation-metadata",
      "created-metadata",
      "updated-metadata",
    ],
  );
  const projected = new Set(
    contract.lookupProjectionRegistry
      .filter(({ availability }) => availability === "projected")
      .flatMap(({ physicalFields }) => physicalFields),
  );
  const physicalFields =
    MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2.table.columns.map(({ name }) => name);
  assert.equal(projected.size, physicalFields.length);
  assert.ok(physicalFields.every((field) => projected.has(field)));
  for (const group of contract.lookupProjectionRegistry.filter(
    ({ group }) => group === "created-metadata" || group === "updated-metadata",
  )) {
    assert.equal(group.availability, "not-present-in-physical-schema");
    assert.equal(group.resolutionRule, "explicitly-omit");
  }
  const lookup = contract.statements.find(
    ({ statementId }) => statementId === "lookup-authoritative-replay",
  );
  assert.deepEqual(
    lookup?.projections[0]?.orderedFields.map(({ physicalField }) => physicalField),
    physicalFields,
  );
});

test("zero-row contracts define logical-attempt reuse by statement responsibility", () => {
  const lookup = contract.statements.find(
    ({ statementId }) => statementId === "lookup-authoritative-replay",
  );
  assert.equal(lookup?.zeroRowContract.logicalAttemptReuse, "repeat-authoritative-read");
  for (const statement of contract.statements) {
    assert.ok(statement.zeroRowContract.logicalAttemptReuse);
    if (
      [
        "complete-processing-replay",
        "fail-processing-replay",
        "release-processing-replay",
      ].includes(statement.statementId)
    ) {
      assert.equal(
        statement.zeroRowContract.logicalAttemptReuse,
        "reuse-terminal-intent",
      );
    }
  }
});

test("insert literals and generated values identify their authority", () => {
  const insert = contract.statements.find(
    ({ statementId }) => statementId === "resolve-new-reservation",
  );
  for (const source of insert?.insertSources ?? []) {
    if (source.source === "literal") {
      assert.ok(source.exactLiteral);
      assert.ok(source.sourceAuthority);
    }
    if (source.source === "generated") {
      assert.equal(source.generatedAuthority, "postgresql");
      assert.ok(source.expressionReference);
    }
  }
});

test("resolve-new insert source matrix is complete", () => {
  const insert = contract.statements.find(
    ({ statementId }) => statementId === "resolve-new-reservation",
  );
  assert.equal(
    insert?.insertSources.length,
    MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2.table.columns.length,
  );
  for (const field of [
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
  ]) {
    assert.equal(
      insert?.insertSources.find(({ physicalField }) => physicalField === field)
        ?.source,
      "generated",
      field,
    );
  }
});

test("contract remains aligned with parameter bindings and contains no SQL body", async () => {
  const parameterIds =
    MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2.statementBindings.map(
      ({ statementId }) => statementId,
    );
  assert.deepEqual(
    contract.statements.map(({ statementId }) => statementId),
    parameterIds,
  );
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutReplayPostgresqlSqlDefinitionContract/contractV2.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\b(?:SELECT|INSERT|UPDATE|DELETE)\s+/i);
  assert.doesNotMatch(source, /(?:Runtime|Adapter|Executor|Client|node:pg|from\s+["']pg["'])/);
});

test("takeover assigns new ownership and predicates existing ownership", () => {
  const statement = contract.statements.find(
    ({ statementId }) => statementId === "takeover-stale-processing-replay",
  );
  assert.ok(statement);
  const assignmentTarget = (
    field: "reservation_identity" | "lease_identity",
  ) =>
    contract.terminalResolutionRegistry.find(
      ({ referenceId }) =>
        referenceId ===
        `assignment:takeover-stale-processing-replay:${field}`,
    )?.terminalTarget;
  assert.equal(
    assignmentTarget("reservation_identity"),
    "takeover_reservation_identity",
  );
  assert.equal(assignmentTarget("lease_identity"), "takeover_lease_identity");
  const predicate = (field: "reservation_identity" | "lease_identity") =>
    statement.predicateBindings.find(
      ({ physicalField }) => physicalField === field,
    );
  assert.equal(
    predicate("reservation_identity")?.bindingId,
    "expected_ownership_evidence",
  );
  assert.equal(predicate("reservation_identity")?.placeholderOrdinal, 13);
  assert.equal(
    predicate("lease_identity")?.bindingId,
    "expected_ownership_evidence",
  );
  assert.equal(predicate("lease_identity")?.placeholderOrdinal, 14);
});

test("terminal version assignments consume their published parameter bindings", () => {
  for (const statementId of [
    "complete-processing-replay",
    "fail-processing-replay",
    "release-processing-replay",
  ] as const) {
    const terminal = contract.terminalResolutionRegistry.find(
      ({ referenceId }) =>
        referenceId === `assignment:${statementId}:terminal_metadata_version`,
    );
    assert.equal(terminal?.terminalResolutionKind, "exact-placeholder-binding");
    assert.equal(terminal?.terminalTarget, "terminal_metadata_version");
  }
  const resultVersion = contract.terminalResolutionRegistry.find(
    ({ referenceId }) =>
      referenceId ===
      "assignment:complete-processing-replay:result_reference_version",
  );
  assert.equal(
    resultVersion?.terminalResolutionKind,
    "exact-placeholder-binding",
  );
  assert.equal(resultVersion?.terminalTarget, "result_reference_version");
});

test("released re-reservation assigns new ownership without predicating it", () => {
  const statement = contract.statements.find(
    ({ statementId }) => statementId === "resolve-existing-replay",
  );
  assert.ok(statement);
  assert.equal(
    statement.orderedPredicates.some(({ physicalField }) =>
      ["reservation_identity", "lease_identity"].includes(physicalField),
    ),
    false,
  );
  assert.equal(
    statement.orderedPredicates.find(
      ({ physicalField }) => physicalField === "state",
    )?.sourceReference,
    "literal:released",
  );
  for (const [
    field,
    binding,
  ] of [
    ["reservation_identity", "reservation_identity"],
    ["lease_identity", "lease_identity"],
  ] as const) {
    const terminal = contract.terminalResolutionRegistry.find(
      ({ referenceId }) =>
        referenceId === `assignment:resolve-existing-replay:${field}`,
    );
    assert.equal(terminal?.terminalTarget, binding);
    assert.equal(terminal?.terminalResolutionKind, "exact-placeholder-binding");
  }
});

test("takeover assignment authority prefers checked successors over predicate inputs", () => {
  for (const [
    field,
    target,
  ] of [
    ["fencing_token", "checked-exactly-one-successor:fencing_token"],
    [
      "reservation_attempt",
      "checked-exactly-one-successor:reservation_attempt",
    ],
  ] as const) {
    const terminal = contract.terminalResolutionRegistry.find(
      ({ referenceId }) =>
        referenceId ===
        `assignment:takeover-stale-processing-replay:${field}`,
    );
    assert.equal(
      terminal?.terminalResolutionKind,
      "exact-checked-successor-definition",
    );
    assert.equal(terminal?.terminalTarget, target);
  }
  const statement = contract.statements.find(
    ({ statementId }) => statementId === "takeover-stale-processing-replay",
  );
  assert.ok(statement);
  assert.equal(
    statement.predicateBindings.find(
      ({ physicalField }) => physicalField === "fencing_token",
    )?.placeholderOrdinal,
    16,
  );
  assert.equal(
    statement.predicateBindings.find(
      ({ physicalField }) => physicalField === "reservation_attempt",
    )?.placeholderOrdinal,
    15,
  );
});
