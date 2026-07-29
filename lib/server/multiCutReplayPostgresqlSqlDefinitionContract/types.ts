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
}>;

export type MultiCutReplaySqlDefinitionProjectionV2 = Readonly<{
  kind: "select" | "returning" | "reconciliation";
  orderedPhysicalFields: readonly string[];
  responsibility: "authoritative-read" | "mutation-result" | "commit-unknown-reconciliation";
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
  }>;
  invariantViolationContract: "fail-closed";
  placeholders: readonly MultiCutReplaySqlDefinitionPlaceholderV2[];
  orderedPredicates: readonly string[];
  mutations: readonly MultiCutReplaySqlDefinitionFieldMutationV2[];
  projections: readonly MultiCutReplaySqlDefinitionProjectionV2[];
  insertSources: readonly Readonly<{
    physicalField: string;
    source: "generated" | "binding" | "literal" | "retained" | "null";
  }>[];
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
}>;
