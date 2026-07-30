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
  MultiCutReplaySqlLookupProjectionGroupV2,
  MultiCutReplaySqlReferenceResolutionV2,
  MultiCutReplaySqlTerminalResolutionV2,
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

const lookupProjectionGroup = (
  group: MultiCutReplaySqlLookupProjectionGroupV2["group"],
  physicalFields: readonly string[],
  availability: MultiCutReplaySqlLookupProjectionGroupV2["availability"],
  resolutionRule: MultiCutReplaySqlLookupProjectionGroupV2["resolutionRule"],
): MultiCutReplaySqlLookupProjectionGroupV2 =>
  Object.freeze({
    group,
    physicalFields: Object.freeze([...physicalFields]),
    availability,
    resolutionRule,
  });

const lookupProjectionRegistry:
  readonly MultiCutReplaySqlLookupProjectionGroupV2[] = Object.freeze([
  lookupProjectionGroup("identity", ["internal_record_id", "physical_schema_version", "logical_schema_version", "identity_version", "key_identity"], "projected", "project-in-order"),
  lookupProjectionGroup("protected-scope", ["scope_version", "replay_namespace", "tenant_identity_version", "protected_tenant_identity", "operation_identity"], "projected", "project-in-order"),
  lookupProjectionGroup("semantic-fingerprint", ["request_fingerprint_identity"], "projected", "project-in-order"),
  lookupProjectionGroup("replay-state", ["state"], "projected", "project-in-order"),
  lookupProjectionGroup("persistent-continuity", continuityFields, "projected", "project-in-order"),
  lookupProjectionGroup("active-processing-evidence", processingFields, "projected", "project-in-order"),
  lookupProjectionGroup("terminal-metadata", ["terminal_metadata_version", "terminal_at", "terminal_classification"], "projected", "project-in-order"),
  lookupProjectionGroup("result-metadata", ["result_reference_version", "result_reference_identity"], "projected", "project-in-order"),
  lookupProjectionGroup("reconciliation-metadata", ["state", ...continuityFields, ...processingFields, "result_reference_version", "result_reference_identity", "terminal_metadata_version", "terminal_at", "terminal_classification"], "projected", "project-in-order"),
  lookupProjectionGroup("created-metadata", [], "not-present-in-physical-schema", "explicitly-omit"),
  lookupProjectionGroup("updated-metadata", [], "not-present-in-physical-schema", "explicitly-omit"),
]);

const lookupProjectionFieldSet = new Set(
  lookupProjectionRegistry
    .filter(({ availability }) => availability === "projected")
    .flatMap(({ physicalFields }) => physicalFields),
);
const lookupProjectionFields = Object.freeze(
  physical.table.columns
    .map(({ name }) => name)
    .filter((name) => lookupProjectionFieldSet.has(name)),
);

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
      sourceReference: `assignment:${statementId}:${name}`,
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
      ? `successor:${statementId}:${field}:checked`
      : !actionByField.has(field)
        ? `successor:${statementId}:${field}:retain`
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
      logicalAttemptReuse:
        statementId === "lookup-authoritative-replay"
          ? "repeat-authoritative-read"
          : [
                "complete-processing-replay",
                "fail-processing-replay",
                "release-processing-replay",
              ].includes(statementId)
            ? "reuse-terminal-intent"
            : "reuse-intent-and-expectations",
    }),
    invariantViolationContract: "fail-closed",
    placeholders,
    orderedPredicates: Object.freeze(orderedPredicates),
    mutations: Object.freeze(mutations),
    projections: Object.freeze([
      Object.freeze({
        kind: isLookup ? "select" : "returning",
        orderedFields: projectionAuthority(
          isLookup ? lookupProjectionFields : returning,
        ),
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

const statements = Object.freeze(statementIds.map(makeStatement));

const reference = (
  referenceId: string,
  authorityOwner: MultiCutReplaySqlReferenceResolutionV2["authorityOwner"],
  resolutionKind: MultiCutReplaySqlReferenceResolutionV2["resolutionKind"],
  physicalFields: readonly string[],
  valueReference: string,
  deterministicResolutionRule: string,
  shared = false,
): MultiCutReplaySqlReferenceResolutionV2 =>
  Object.freeze({
    referenceId,
    authorityOwner,
    resolutionKind,
    targetMetadata: Object.freeze({
      physicalFields: Object.freeze([...physicalFields]),
      valueReference,
    }),
    deterministicResolutionRule,
    expressionSharing: shared
      ? "same-reference-same-authoritative-expression"
      : "not-applicable",
  });

const baseReferences: readonly MultiCutReplaySqlReferenceResolutionV2[] = [
  ...continuityFields.map((field) =>
    reference(
      `parameter-successor:${field}`,
      "parameter-contract",
      "successor",
      [field],
      field,
      "resolve-the-authoritative-successor-declared-by-the-parameter-contract",
      true,
    ),
  ),
  ...[
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
    "expected_revision",
    "fencing_token",
    "reservation_attempt",
    "lease_expires_at",
  ].map((field) =>
    reference(
      `initial:${field}`,
      "parameter-contract",
      "generated",
      [field],
      `initial-${field}`,
      "resolve-the-authoritative-initial-value-declared-by-the-parameter-contract",
      true,
    ),
  ),
  reference("initial:state", "logical-schema", "literal", ["state"], "processing", "resolve-the-initial-state-literal-from-the-logical-schema"),
  reference("initial:schema_version", "physical-schema", "literal", ["physical_schema_version", "logical_schema_version", "identity_version"], "2.0", "resolve-the-version-literal-from-the-version-pinned-schema-contracts"),
  ...(["processing", "completed", "failed", "released"] as const).map((value) =>
    reference(
      `literal:${value}`,
      "logical-schema",
      "literal",
      ["state"],
      value,
      "resolve-the-exact-text-state-literal",
    ),
  ),
  reference(
    "postgresql-expression:authoritative-current-time",
    "parameter-contract",
    "generated",
    ["lease_expires_at"],
    "transaction-clock",
    "resolve-to-the-transaction-stable-postgresql-clock-authority",
    true,
  ),
  ...([
    "initial-lease-expiry",
    "resolve-existing-replay:lease-expiry",
    "renew-processing-reservation:lease-expiry",
    "takeover-stale-processing-replay:lease-expiry",
  ] as const).map((name) =>
    reference(
      `postgresql-expression:${name}`,
      "parameter-contract",
      "generated",
      ["lease_expires_at"],
      "lease-expiry-from-transaction-clock-and-validated-duration",
      "resolve-to-authoritative-time-plus-the-lease-duration-milliseconds-binding",
      true,
    ),
  ),
  ...(["lookup", "returning", "reconciliation"] as const).map((purpose) =>
    reference(
      `projection:${purpose}`,
      "sql-definition-contract",
      "projection",
      purpose === "lookup" ? lookupProjectionFields : [],
      purpose,
      "resolve-the-canonical-projection-for-the-declared-purpose",
    ),
  ),
];

const successorReferenceRegistry = statements.flatMap((statement) =>
  continuityFields.flatMap((field) => {
    const referenceId = statement.successorReferences[field];
    if (referenceId === "not-used") {
      return [];
    }
    const checked = referenceId.endsWith(":checked");
    return [
      reference(
        referenceId,
        checked ? "parameter-contract" : "physical-schema",
        checked ? "successor" : "retained",
        [field],
        checked ? `parameter-successor:${field}` : `physical-field:${field}`,
        checked
          ? "resolve-once-from-the-checked-parameter-successor-and-share-with-all-consumers"
          : "retain-the-authoritative-persisted-value",
        checked,
      ),
    ];
  }),
);

const assignmentReferenceRegistry = statements.flatMap((statement) =>
  statement.statementId === "resolve-new-reservation" ||
  statement.statementId === "lookup-authoritative-replay"
    ? []
    : statement.mutations.map((mutation) => {
    const field = mutation.physicalField;
    const placeholder = statement.placeholders.find(
      ({ physicalField }) => physicalField === field,
    );
    const successorField =
      field === "fencing_token"
        ? "last_fencing_token"
        : field === "reservation_attempt"
          ? "last_reservation_attempt"
          : continuityFields.includes(field as never)
            ? field
            : undefined;
    const statementSuccessor = successorField
      ? statement.successorReferences[
          successorField as keyof typeof statement.successorReferences
        ]
      : "not-used";
    const stateLiteralByStatement: Readonly<Record<string, string>> = {
      "resolve-existing-replay": "processing",
      "complete-processing-replay": "completed",
      "fail-processing-replay": "failed",
      "release-processing-replay": "released",
      "takeover-stale-processing-replay": "processing",
    };
    const source =
      mutation.action === "retain"
        ? `physical-field:${field}`
        : mutation.action === "clear"
          ? "null"
          : mutation.action === "successor"
            ? statementSuccessor
            : mutation.action === "generated"
              ? `initial:${field}`
              : field === "state"
                ? stateLiteralByStatement[statement.statementId]
                : field === "lease_expires_at"
                  ? `postgresql-expression:${statement.statementId}:lease-expiry`
                  : field.endsWith("_version")
                    ? "1.0"
                    : field === "expected_revision"
                      ? statement.successorReferences.revision
                      : field === "fencing_token"
                        ? statement.successorReferences.last_fencing_token
                        : field === "reservation_attempt"
                          ? statement.successorReferences.last_reservation_attempt
                  : placeholder
                    ? `binding:${placeholder.parameterBinding}`
                    : `binding:${field}`;
    const kind =
      mutation.action === "retain"
        ? "retained"
        : mutation.action === "clear"
          ? "cleared"
          : mutation.action === "successor"
            ? "successor"
            : mutation.action === "generated"
              ? "generated"
              : source.startsWith("binding:")
                ? "binding"
                : source.startsWith("literal:")
                  ? "literal"
                  : "generated";
    return reference(
      mutation.sourceReference,
      mutation.action === "retain" || mutation.action === "clear"
        ? "physical-schema"
        : mutation.action === "successor" || mutation.action === "generated"
          ? "parameter-contract"
          : "sql-definition-contract",
      kind,
      [field],
      source,
      `resolve-the-${kind}-assignment-source-without-projection-fallback`,
      mutation.action === "successor",
    );
    }),
);

const referenceRegistry = Object.freeze([
  ...baseReferences,
  ...successorReferenceRegistry,
  ...assignmentReferenceRegistry,
]);

const referenceIds = new Set(
  referenceRegistry.map(({ referenceId }) => referenceId),
);

const statementFromReference = (
  referenceId: string,
): MultiCutReplaySqlTerminalResolutionV2["ownerStatement"] => {
  const statement = statementIds.find((id) => referenceId.includes(`:${id}:`));
  return statement ?? "shared";
};

const castForTerminal = (
  physicalField: string,
): MultiCutReplaySqlTerminalResolutionV2["postgresqlCast"] =>
  castByPhysicalType[columnByName.get(physicalField)?.type ?? "text"];

const terminalResolutionRegistry:
  readonly MultiCutReplaySqlTerminalResolutionV2[] = Object.freeze(
  referenceRegistry.map((entry) => {
    const referenceId = entry.referenceId;
    const physicalField = entry.targetMetadata.physicalFields[0] ?? "*";
    const valueReference = entry.targetMetadata.valueReference;
    const targetReferenceId = referenceIds.has(valueReference)
      ? valueReference
      : undefined;
    const isInitialOne =
      referenceId.startsWith("initial:") &&
      [
        "revision",
        "last_fencing_token",
        "last_reservation_attempt",
        "expected_revision",
        "fencing_token",
        "reservation_attempt",
      ].includes(referenceId.slice("initial:".length));
    const isExpression = referenceId.startsWith("postgresql-expression:");
    const isSuccessor =
      referenceId.startsWith("parameter-successor:") ||
      (referenceId.startsWith("successor:") &&
        referenceId.endsWith(":checked"));
    const isRetainedSuccessor =
      referenceId.startsWith("successor:") &&
      referenceId.endsWith(":retain");
    const isProjection = referenceId.startsWith("projection:");
    const isAssignment = referenceId.startsWith("assignment:");
    const assignmentKind = isAssignment ? entry.resolutionKind : undefined;
    const resolutionKind:
      MultiCutReplaySqlTerminalResolutionV2["resolutionKind"] =
      isInitialOne || referenceId === "initial:schema_version" ||
      referenceId === "initial:state" || referenceId.startsWith("literal:")
        ? "literal"
        : isExpression
          ? "postgresql-generated"
          : isSuccessor
            ? "checked-successor"
            : isRetainedSuccessor
              ? "retained"
              : isProjection
                ? "projection"
                : assignmentKind === "binding"
                  ? "binding"
                  : assignmentKind === "literal"
                    ? "literal"
                    : assignmentKind === "generated"
                      ? "postgresql-generated"
                      : assignmentKind === "successor"
                        ? "checked-successor"
                        : assignmentKind === "retained"
                          ? "retained"
                          : assignmentKind === "cleared"
                            ? "cleared"
                            : "persisted-field";
    const terminalResolutionKind:
      MultiCutReplaySqlTerminalResolutionV2["terminalResolutionKind"] =
      resolutionKind === "literal"
        ? "exact-literal"
        : resolutionKind === "binding"
          ? "exact-placeholder-binding"
          : resolutionKind === "postgresql-generated"
            ? "exact-postgresql-generated-expression-authority"
            : resolutionKind === "checked-successor"
              ? "exact-checked-successor-definition"
              : resolutionKind === "retained"
                ? "exact-retained-field"
                : resolutionKind === "cleared"
                  ? "exact-cleared-field"
                  : resolutionKind === "projection"
                    ? "exact-projection-field-and-alias"
                    : "exact-persisted-physical-field";
    const terminalTarget =
      isInitialOne
        ? "1"
        : referenceId === "initial:schema_version"
          ? "2.0"
          : referenceId === "initial:state"
            ? "processing"
            : referenceId.startsWith("literal:")
              ? referenceId.slice("literal:".length)
              : referenceId ===
                  "postgresql-expression:authoritative-current-time"
                ? "transaction_timestamp()"
                : isExpression ||
                    valueReference.includes("lease-expiry")
                  ? "transaction_timestamp()+validated-lease-duration-milliseconds"
                  : isSuccessor ||
                      (isAssignment &&
                        entry.resolutionKind === "successor")
                    ? `checked-exactly-one-successor:${physicalField}`
                    : isRetainedSuccessor ||
                        entry.resolutionKind === "retained"
                      ? `retained-physical-field:${physicalField}`
                      : entry.resolutionKind === "cleared"
                        ? "NULL"
                        : entry.resolutionKind === "binding"
                          ? valueReference.replace(/^binding:/, "")
                          : entry.resolutionKind === "literal"
                            ? valueReference
                            : isProjection
                              ? `canonical-${referenceId.slice("projection:".length)}-projection`
                              : valueReference;
    const ownerStatement = statementFromReference(referenceId);
    const sqlClause: MultiCutReplaySqlTerminalResolutionV2["sqlClause"] =
      isAssignment
        ? "assignment"
        : isProjection
          ? "projection"
          : isSuccessor || isRetainedSuccessor
            ? "successor"
            : referenceId.startsWith("initial:")
              ? "insert-source"
              : referenceId.startsWith("literal:") ||
                  referenceId ===
                    "postgresql-expression:authoritative-current-time"
                ? "predicate"
                : "insert-source";
    const authoritySource:
      MultiCutReplaySqlTerminalResolutionV2["authoritySource"] =
      isExpression || terminalTarget.includes("lease-duration")
        ? "lease-and-attempt-policy-adr-v1"
        : isSuccessor ||
            terminalResolutionKind === "exact-checked-successor-definition"
          ? "parameter-contract-v2"
          : resolutionKind === "literal"
            ? "logical-schema-v2"
            : resolutionKind === "retained" ||
                resolutionKind === "cleared" ||
                resolutionKind === "persisted-field"
              ? "physical-schema-v2"
              : resolutionKind === "binding"
                ? "parameter-contract-v2"
                : "sql-definition-contract-v2";
    return Object.freeze({
      referenceId,
      ownerStatement,
      sqlClause,
      physicalField,
      logicalField:
        columnByName.get(physicalField)?.logicalSource ?? physicalField,
      resolutionKind,
      terminalResolutionKind,
      terminalTarget,
      authoritySource,
      postgresqlCast: castForTerminal(physicalField),
      nullableBehavior:
        entry.resolutionKind === "cleared"
          ? "null-clears-field"
          : columnByName.get(physicalField)?.nullable
            ? "nullable-value"
            : "not-null",
      reuseSharingIdentity:
        entry.expressionSharing ===
        "same-reference-same-authoritative-expression"
          ? referenceId
          : ownerStatement === "shared"
            ? `shared:${referenceId}`
            : `statement:${ownerStatement}:${referenceId}`,
      deterministicResolutionRule:
        terminalTarget === "transaction_timestamp()"
          ? "use-the-sole-transaction-stable-postgresql-clock-function"
          : terminalTarget.includes("lease-duration")
            ? "combine-the-shared-transaction-clock-with-the-validated-bigint-millisecond-duration"
            : terminalResolutionKind ===
                "exact-checked-successor-definition"
              ? "increment-the-persisted-source-by-exactly-one-with-overflow-rejection"
              : `resolve-directly-to-${terminalResolutionKind}`,
      ...(targetReferenceId ? { targetReferenceId } : {}),
      recursiveResolutionPath: Object.freeze(
        targetReferenceId
          ? [referenceId, targetReferenceId]
          : [referenceId],
      ),
      usageClassification:
        ownerStatement === "shared" ? "shared-authority" : "statement-owned",
    });
  }),
);

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
  statements,
  successorSources: Object.freeze({
    revision: "revision",
    last_fencing_token: "last_fencing_token",
    last_reservation_attempt: "last_reservation_attempt",
  }),
  referenceRegistry,
  terminalResolutionRegistry,
  lookupProjectionRegistry,
});
