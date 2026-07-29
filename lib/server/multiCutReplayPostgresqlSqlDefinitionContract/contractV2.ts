import {
  MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2 as parameters,
} from "../multiCutReplayPersistenceParameters";
import {
  MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2 as physical,
} from "../multiCutReplayPhysicalSchema/physicalSchemaV2";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG as catalog,
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS as statementIds,
} from "../multiCutReplayPostgresqlStatementCatalog/catalog";
import type {
  MultiCutReplaySqlDefinitionContractV2,
  MultiCutReplaySqlDefinitionFieldMutationV2,
  MultiCutReplaySqlDefinitionPlaceholderV2,
  MultiCutReplaySqlDefinitionStatementV2,
} from "./types";

const castByPhysicalType = Object.freeze({
  uuid: "uuid",
  text: "text",
  integer: "integer",
  "timestamp-with-time-zone": "timestamptz",
} as const);

const columnByName = new Map(
  physical.table.columns.map((column) => [column.name, column]),
);
const parameterByBinding = new Map(
  parameters.parameters.map((parameter) => [parameter.sqlBindingName, parameter]),
);
const identityFields = parameters.parameters.find(
  ({ name }) => name === "replay_identity",
)?.physicalBindings ?? [];
const fingerprintFields = ["request_fingerprint_identity"] as const;
const continuityFields = [
  "revision",
  "last_fencing_token",
  "last_reservation_attempt",
] as const;
const processingFields = [
  "reservation_evidence_version",
  "reservation_version",
  "reservation_identity",
  "expected_revision_version",
  "expected_revision",
  "fencing_version",
  "fencing_token",
  "lease_version",
  "lease_identity",
  "lease_expires_at",
  "reservation_attempt",
] as const;

const flattenInput = (binding: string): readonly string[] => {
  const parameter = parameterByBinding.get(binding);
  if (!parameter || parameter.physicalBindings.length === 0) {
    return [binding];
  }
  return parameter.physicalBindings;
};

const castFor = (
  physicalField: string,
  parameterBinding: string,
): MultiCutReplaySqlDefinitionPlaceholderV2["postgresqlCast"] => {
  if (parameterBinding === "lease_duration_milliseconds") {
    return "bigint";
  }
  return castByPhysicalType[columnByName.get(physicalField)?.type ?? "text"];
};

const comparisonRole = (
  field: string,
): MultiCutReplaySqlDefinitionPlaceholderV2["comparisonRole"] =>
  identityFields.includes(field)
    ? "identity"
    : fingerprintFields.includes(field as never)
      ? "fingerprint"
      : field === "state"
        ? "state"
        : continuityFields.includes(field as never)
          ? "concurrency"
          : processingFields.includes(field as never)
            ? "processing"
            : "none";

const makePlaceholders = (
  inputBindings: readonly string[],
): readonly MultiCutReplaySqlDefinitionPlaceholderV2[] => {
  const flattened = inputBindings.flatMap((binding) =>
    flattenInput(binding).map((physicalField) => ({
      physicalField,
      parameterBinding: binding,
    })),
  );
  return Object.freeze(
    flattened.map(({ physicalField, parameterBinding }, index) =>
      Object.freeze({
        ordinal: index + 1,
        placeholder: `$${index + 1}` as const,
        postgresqlCast: castFor(physicalField, parameterBinding),
        physicalField,
        logicalField:
          columnByName.get(physicalField)?.logicalSource ?? parameterBinding,
        parameterBinding,
        comparisonRole: comparisonRole(physicalField),
        mutationRole: "binding" as const,
        projectionDependency: true,
      }),
    ),
  );
};

const projectionFields = (bindings: readonly string[]): readonly string[] =>
  Object.freeze([...new Set(bindings.flatMap(flattenInput))]);

const projectionAuthority = (fields: readonly string[]) =>
  Object.freeze(
    fields.map((physicalField) =>
      Object.freeze({
        physicalField,
        logicalOutput:
          columnByName.get(physicalField)?.logicalSource ?? physicalField,
        canonicalAlias: physicalField,
      }),
    ),
  );

const makeStatement = (
  statementId: (typeof statementIds)[number],
): MultiCutReplaySqlDefinitionStatementV2 => {
  const binding = parameters.statementBindings.find(
    (candidate) => candidate.statementId === statementId,
  );
  const semantics = parameters.statementSemantics.find(
    (candidate) => candidate.statementId === statementId,
  );
  if (!binding || !semantics) {
    throw new Error("incomplete-sql-definition-contract-authority");
  }
  const entry = catalog[statementId];
  const actionByField = new Map<
    string,
    "replace" | "successor" | "clear" | "generated"
  >();
  semantics.activeProcessingEvidence.replace.forEach((field) =>
    actionByField.set(field, "replace"),
  );
  semantics.activeProcessingEvidence.clear.forEach((field) =>
    actionByField.set(field, "clear"),
  );
  semantics.persistentContinuity.advance.forEach((field) =>
    actionByField.set(field, "successor"),
  );
  if (statementId === "resolve-new-reservation") {
    [
      ...continuityFields,
      "fencing_token",
      "reservation_attempt",
      "lease_expires_at",
    ].forEach((field) => actionByField.set(field, "generated"));
  }
  if (statementId === "resolve-existing-replay") {
    parameters.releasedRereservation.mutation.update.forEach((field) =>
      actionByField.set(
        field,
        continuityFields.includes(field as never) ? "successor" : "replace",
      ),
    );
    parameters.releasedRereservation.mutation.clear.forEach((field) =>
      actionByField.set(field, "clear"),
    );
  }
  if (["complete-processing-replay", "fail-processing-replay", "release-processing-replay"].includes(statementId)) {
    ["state", "terminal_metadata_version", "terminal_at", "terminal_classification"]
      .forEach((field) => actionByField.set(field, "replace"));
    if (statementId === "complete-processing-replay") {
      ["result_reference_version", "result_reference_identity"]
        .forEach((field) => actionByField.set(field, "replace"));
    } else {
      ["result_reference_version", "result_reference_identity"]
        .forEach((field) => actionByField.set(field, "clear"));
    }
  }
  if (statementId === "takeover-stale-processing-replay") {
    actionByField.set("state", "replace");
  }
  const inputBindingByField = new Map<string, string>();
  binding.inputBindings.forEach((input) =>
    flattenInput(input).forEach((field) => inputBindingByField.set(field, input)),
  );
  const literalByStatement: Readonly<Record<string, string>> = Object.freeze({
    "resolve-existing-replay": "processing",
    "complete-processing-replay": "completed",
    "fail-processing-replay": "failed",
    "release-processing-replay": "released",
    "takeover-stale-processing-replay": "processing",
  });
  const mutations = physical.table.columns.map(({ name }) => {
    const action = actionByField.get(name) ?? "retain";
    const assignment: readonly [
      MultiCutReplaySqlDefinitionFieldMutationV2["assignmentSource"],
      string,
    ] =
      action === "retain"
        ? ["physical-field", name]
        : action === "clear"
          ? ["null-reference", "null"]
          : action === "successor"
            ? ["successor-reference", `successor:${name}`]
            : action === "generated"
              ? ["generated-expression-reference", `initial:${name}`]
              : name === "state"
                ? ["literal-reference", `literal:${literalByStatement[statementId]}`]
                : ["parameter-binding", inputBindingByField.get(name) ?? `projection:${name}`];
    return Object.freeze({
      physicalField: name,
      action,
      assignmentSource: assignment[0],
      sourceReference: assignment[1],
    });
  });
  const returning = projectionFields(binding.returningBindings);
  const isLookup = entry.accessMode === "read";
  const orderedPredicateFields = [
    ...identityFields,
    ...(binding.inputBindings.includes("request_fingerprint_identity")
      ? fingerprintFields
      : []),
    ...(
      statementId === "resolve-existing-replay" ||
      [
        "renew-processing-reservation",
        "complete-processing-replay",
        "fail-processing-replay",
        "release-processing-replay",
        "takeover-stale-processing-replay",
      ].includes(statementId)
        ? ["state"]
        : []
    ),
    ...continuityFields.filter((field) =>
      semantics.persistentContinuity.expected.includes(field),
    ),
    ...processingFields.filter((field) =>
      binding.inputBindings.some((input) => flattenInput(input).includes(field)),
    ),
    ...(statementId === "takeover-stale-processing-replay"
      ? ["lease_expires_at"]
      : []),
  ];
  const stateLiteral =
    statementId === "resolve-existing-replay" ? "released" : "processing";
  const placeholders = makePlaceholders(binding.inputBindings);
  const placeholderByField = new Map(
    placeholders.map((placeholder) => [
      placeholder.physicalField,
      placeholder.placeholder,
    ]),
  );
  const orderedPredicates = orderedPredicateFields.map((physicalField) => {
    const role =
      physicalField === "lease_expires_at"
        ? "stale"
        : comparisonRole(physicalField);
    const isState = physicalField === "state";
    const isStale = role === "stale";
    return Object.freeze({
      physicalField,
      comparisonOperator: isStale ? "<=" : "=",
      comparisonSource:
        isState ? "literal" : isStale ? "expression-reference" : "placeholder",
      sourceReference:
        isState
          ? `literal:${stateLiteral}`
          : isStale
            ? "postgresql-expression:authoritative-current-time"
            : placeholderByField.get(physicalField) ?? `binding:${physicalField}`,
      literalSource: isState ? "statement-lifecycle-authority" : "none",
      nullSemantics: isStale ? "null-is-ineligible" : "null-never-matches",
      evaluationRole: role,
    } as const);
  });
  const insertBindingByField = new Map<string, string>();
  binding.inputBindings.forEach((input) =>
    flattenInput(input).forEach((field) => insertBindingByField.set(field, input)),
  );
  const insertSources = statementId === "resolve-new-reservation"
    ? physical.table.columns.map(({ name }) => {
        const inputBinding = insertBindingByField.get(name);
        if (inputBinding) {
          return { physicalField: name, source: "binding", binding: inputBinding } as const;
        }
        const literalValues: Readonly<Record<string, string>> = Object.freeze({
          state: "processing",
          reservation_evidence_version: "1.0",
          reservation_version: "1.0",
          expected_revision_version: "1.0",
          fencing_version: "1.0",
          lease_version: "1.0",
        });
        if (literalValues[name]) {
          return {
            physicalField: name,
            source: "literal",
            exactLiteral: literalValues[name],
            sourceAuthority:
              name === "state" ? "logical-schema-v2" : "replay-contracts-v4",
          } as const;
        }
        if ([
          ...continuityFields,
          "expected_revision",
          "fencing_token",
          "reservation_attempt",
        ].includes(name as never)) {
          return { physicalField: name, source: "generated", generatedAuthority: "postgresql", expressionReference: `initial:${name}` } as const;
        }
        if (name === "lease_expires_at") {
          return { physicalField: name, source: "generated", generatedAuthority: "postgresql", expressionReference: "postgresql-expression:initial-lease-expiry" } as const;
        }
        return { physicalField: name, source: "null", nullAuthority: "physical-state-nullability" } as const;
      })
    : [];
  const successor = (field: typeof continuityFields[number]) =>
    semantics.persistentContinuity.advance.includes(field)
      ? `parameter-successor:${field}`
      : "not-used";
  return Object.freeze({
    statementId,
    operationClass: entry.operationKind,
    transactionClass: entry.transactionRequirement,
    cardinality: Object.freeze({
      success: "one",
      zeroAllowed: true,
      multiple: "invariant-violation",
    }),
    retryClass: binding.retryRule,
    reconciliationClass: entry.reconciliationRequirement,
    successContract: "project-ordered-authoritative-row",
    zeroRowContract: Object.freeze({
      ambiguity: "not-single-cause",
      lookupRequired: binding.cardinality.zeroRowNextAction !== "not-found-or-authoritative-read",
      reconciliationRequired:
        binding.cardinality.zeroRowNextAction === "authoritative-reconciliation",
      commitUnknown: binding.cardinality.commitUnknown,
    }),
    invariantViolationContract: "fail-closed",
    placeholders,
    orderedPredicates: Object.freeze(orderedPredicates),
    mutations: Object.freeze(mutations),
    projections: Object.freeze([
      Object.freeze({
        kind: isLookup ? "select" : "returning",
        orderedFields: projectionAuthority(returning),
        responsibility: isLookup ? "authoritative-read" : "mutation-result",
        purpose: isLookup ? "lookup" : "returning",
      }),
      Object.freeze({
        kind: "reconciliation",
        orderedFields: projectionAuthority(
          projectionFields(parameters.releasedRereservation.returningBindings),
        ),
        responsibility: "commit-unknown-reconciliation",
        purpose: "reconciliation",
      }),
    ]),
    insertSources: Object.freeze(insertSources),
    successorReferences: Object.freeze({
      revision: successor("revision"),
      last_fencing_token: successor("last_fencing_token"),
      last_reservation_attempt: successor("last_reservation_attempt"),
    }),
  });
};

export const MULTI_CUT_REPLAY_SQL_DEFINITION_CONTRACT_V2:
  MultiCutReplaySqlDefinitionContractV2 = Object.freeze({
  contractVersion: "2.0",
  canonicalPredicateOrder: Object.freeze([
    "identity",
    "fingerprint",
    "state",
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
    "processing",
  ] as const),
  canonicalContinuityOrder: Object.freeze(continuityFields),
  statements: Object.freeze(statementIds.map(makeStatement)),
  successorSources: Object.freeze({
    revision: "revision",
    last_fencing_token: "last_fencing_token",
    last_reservation_attempt: "last_reservation_attempt",
  }),
});
