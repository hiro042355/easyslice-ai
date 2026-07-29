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
  const mutations = physical.table.columns.map(({ name }) => ({
    physicalField: name,
    action: actionByField.get(name) ?? "retain",
  } as const));
  const returning = projectionFields(binding.returningBindings);
  const isLookup = entry.accessMode === "read";
  const orderedPredicates = [
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
  ];
  const insertSources = statementId === "resolve-new-reservation"
    ? physical.table.columns.map(({ name }) => ({
        physicalField: name,
        source: identityFields.includes(name) ||
          fingerprintFields.includes(name as never) ||
          ["internal_record_id", "reservation_identity", "lease_identity"].includes(name)
          ? "binding"
          : ["physical_schema_version", "logical_schema_version", "identity_version", "scope_version", "state"].includes(name)
            ? "literal"
            : [...continuityFields, "fencing_token", "reservation_attempt", "lease_expires_at"].includes(name as never)
              ? "generated"
              : "null",
      } as const))
    : [];
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
    placeholders: makePlaceholders(binding.inputBindings),
    orderedPredicates: Object.freeze(orderedPredicates),
    mutations: Object.freeze(mutations),
    projections: Object.freeze([
      Object.freeze({
        kind: isLookup ? "select" : "returning",
        orderedPhysicalFields: returning,
        responsibility: isLookup ? "authoritative-read" : "mutation-result",
      }),
      Object.freeze({
        kind: "reconciliation",
        orderedPhysicalFields: projectionFields(
          parameters.releasedRereservation.returningBindings,
        ),
        responsibility: "commit-unknown-reconciliation",
      }),
    ]),
    insertSources: Object.freeze(insertSources),
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
