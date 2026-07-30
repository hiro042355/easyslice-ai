import type { MultiCutReplayPersistenceStatementIdV2 } from "../multiCutReplayPersistenceParameters/types";
import type { MultiCutReplayPostgresqlStatementCatalogEntry } from "../multiCutReplayPostgresqlStatementCatalog/types";

export type MultiCutReplaySqlDefinitionPlaceholderV2 = Readonly<{
  ordinal: number;
  placeholder: `$${number}`;
  postgresqlCast: "uuid" | "text" | "integer" | "bigint" | "timestamptz";
  physicalField: string;
  logicalField: string;
  parameterBinding: string;
  comparisonRole: "identity" | "fingerprint" | "state" | "concurrency" | "processing" | "none";
  mutationRole: "binding" | "none";
  projectionDependency: boolean;
}>;

export type MultiCutReplaySqlDefinitionFieldMutationV2 = Readonly<{
  physicalField: string;
  action: "retain" | "replace" | "successor" | "clear" | "generated";
  assignmentSource:
    | "physical-field"
    | "parameter-binding"
    | "successor-reference"
    | "literal-reference"
    | "null-reference"
    | "generated-expression-reference";
  sourceReference: string;
}>;

export type MultiCutReplaySqlDefinitionPredicateV2 = Readonly<{
  physicalField: string;
  comparisonOperator: "=" | "<=";
  comparisonSource: "placeholder" | "literal" | "expression-reference";
  sourceReference: string;
  literalSource: "none" | "statement-lifecycle-authority";
  nullSemantics: "null-never-matches" | "null-is-ineligible";
  evaluationRole: "identity" | "fingerprint" | "state" | "concurrency" | "processing" | "stale" | "none";
}>;

export type MultiCutReplaySqlDefinitionProjectionFieldV2 = Readonly<{
  physicalField: string;
  logicalOutput: string;
  canonicalAlias: string;
}>;

export type MultiCutReplaySqlDefinitionProjectionV2 = Readonly<{
  kind: "select" | "returning" | "reconciliation";
  orderedFields: readonly MultiCutReplaySqlDefinitionProjectionFieldV2[];
  responsibility: "authoritative-read" | "mutation-result" | "commit-unknown-reconciliation";
  purpose: "lookup" | "returning" | "reconciliation";
}>;

export type MultiCutReplaySqlDefinitionStatementV2 = Readonly<{
  statementId: MultiCutReplayPersistenceStatementIdV2;
  operationClass: MultiCutReplayPostgresqlStatementCatalogEntry["operationKind"];
  transactionClass: MultiCutReplayPostgresqlStatementCatalogEntry["transactionRequirement"];
  cardinality: Readonly<{
    success: "one";
    zeroAllowed: true;
    multiple: "invariant-violation";
  }>;
  retryClass: string;
  reconciliationClass: string;
  successContract: "project-ordered-authoritative-row";
  zeroRowContract: Readonly<{
    ambiguity: "not-single-cause";
    lookupRequired: boolean;
    reconciliationRequired: boolean;
    commitUnknown: string;
    logicalAttemptReuse:
      | "reuse-intent-and-expectations"
      | "repeat-authoritative-read"
      | "reuse-terminal-intent";
  }>;
  invariantViolationContract: "fail-closed";
  placeholders: readonly MultiCutReplaySqlDefinitionPlaceholderV2[];
  orderedPredicates: readonly MultiCutReplaySqlDefinitionPredicateV2[];
  mutations: readonly MultiCutReplaySqlDefinitionFieldMutationV2[];
  projections: readonly MultiCutReplaySqlDefinitionProjectionV2[];
  insertSources: readonly (
    | Readonly<{ physicalField: string; source: "binding"; binding: string }>
    | Readonly<{ physicalField: string; source: "literal"; exactLiteral: string; sourceAuthority: string }>
    | Readonly<{ physicalField: string; source: "generated"; generatedAuthority: "postgresql"; expressionReference: string }>
    | Readonly<{ physicalField: string; source: "retained"; retainedReference: string }>
    | Readonly<{ physicalField: string; source: "null"; nullAuthority: "physical-state-nullability" }>
  )[];
  successorReferences: Readonly<{
    revision: string | "not-used";
    last_fencing_token: string | "not-used";
    last_reservation_attempt: string | "not-used";
  }>;
}>;

export type MultiCutReplaySqlReferenceResolutionV2 = Readonly<{
  referenceId: string;
  authorityOwner:
    | "parameter-contract"
    | "physical-schema"
    | "logical-schema"
    | "statement-catalog"
    | "sql-definition-contract";
  resolutionKind:
    | "binding"
    | "literal"
    | "generated"
    | "retained"
    | "cleared"
    | "successor"
    | "projection";
  targetMetadata: Readonly<{
    physicalFields: readonly string[];
    valueReference: string;
  }>;
  deterministicResolutionRule: string;
  expressionSharing: "same-reference-same-authoritative-expression" | "not-applicable";
}>;

export type MultiCutReplaySqlLookupProjectionGroupV2 = Readonly<{
  group:
    | "identity"
    | "protected-scope"
    | "semantic-fingerprint"
    | "replay-state"
    | "persistent-continuity"
    | "active-processing-evidence"
    | "terminal-metadata"
    | "result-metadata"
    | "reconciliation-metadata"
    | "created-metadata"
    | "updated-metadata";
  physicalFields: readonly string[];
  availability: "projected" | "not-present-in-physical-schema";
  resolutionRule: "project-in-order" | "explicitly-omit";
}>;

export type MultiCutReplaySqlTerminalResolutionV2 = Readonly<{
  referenceId: string;
  ownerStatement: MultiCutReplayPersistenceStatementIdV2 | "shared";
  sqlClause:
    | "insert-source"
    | "predicate"
    | "assignment"
    | "projection"
    | "successor";
  physicalField: string;
  logicalField: string;
  resolutionKind:
    | "literal"
    | "binding"
    | "persisted-field"
    | "postgresql-generated"
    | "checked-successor"
    | "null"
    | "retained"
    | "cleared"
    | "projection";
  terminalResolutionKind:
    | "exact-literal"
    | "exact-placeholder-binding"
    | "exact-persisted-physical-field"
    | "exact-postgresql-generated-expression-authority"
    | "exact-checked-successor-definition"
    | "exact-null"
    | "exact-retained-field"
    | "exact-cleared-field"
    | "exact-projection-field-and-alias";
  terminalTarget: string;
  authoritySource:
    | "logical-schema-v2"
    | "physical-schema-v2"
    | "parameter-contract-v2"
    | "lease-and-attempt-policy-adr-v1"
    | "terminal-continuity-adr-v1"
    | "sql-definition-contract-v2";
  postgresqlCast:
    | "uuid"
    | "text"
    | "integer"
    | "bigint"
    | "timestamptz"
    | "boolean";
  nullableBehavior:
    | "not-null"
    | "nullable-value"
    | "null-clears-field"
    | "null-is-ineligible";
  reuseSharingIdentity: string;
  deterministicResolutionRule: string;
  targetReferenceId?: string;
  recursiveResolutionPath: readonly string[];
  usageClassification: "statement-owned" | "shared-authority";
}>;

export type MultiCutReplaySqlDefinitionContractV2 = Readonly<{
  contractVersion: "2.0";
  canonicalPredicateOrder: readonly [
    "identity",
    "fingerprint",
    "state",
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
    "processing",
  ];
  canonicalContinuityOrder: readonly [
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
  ];
  statements: readonly MultiCutReplaySqlDefinitionStatementV2[];
  successorSources: Readonly<{
    revision: "revision";
    last_fencing_token: "last_fencing_token";
    last_reservation_attempt: "last_reservation_attempt";
  }>;
  referenceRegistry: readonly MultiCutReplaySqlReferenceResolutionV2[];
  terminalResolutionRegistry:
    readonly MultiCutReplaySqlTerminalResolutionV2[];
  lookupProjectionRegistry:
    readonly MultiCutReplaySqlLookupProjectionGroupV2[];
}>;
