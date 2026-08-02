import {
  resolvePostgreSQLSliceAStatementV1,
} from "../postgresqlStores/postgresqlStatementResolver";
import type { PostgreSQLSliceAStatementResolutionV1 } from "../postgresqlStores/postgresqlStatementResolver";
import { POSTGRESQL_SLICE_A_STATEMENT_CATALOG } from "../postgresqlStores/postgresqlStatementCatalog";
import { classifyDurableWorkflowPostgresqlFailureV1 } from "./postgresqlFailureClassifier";
import { createDurableWorkflowResolverFailureV2 } from "./resolverFailureV2";
import {
  projectDurableWorkflowDatabaseCardinalityConflictV2,
  projectDurableWorkflowDatabaseNotFoundV2,
  projectDurableWorkflowGeneralQueryFailureV2,
} from "./safeDatabaseFailureV2";
import { projectPostgresqlQuerySuccessToDurableSuccessV2 } from "./durableQuerySuccessEvidenceV2";
import type {
  DurableWorkflowPostgresqlFailureClassificationInputV1,
  DurableWorkflowPostgresqlFailureClassificationV1,
} from "./postgresqlFailureClassifier";
import type {
  DurableWorkflowQuerySuccessEvidenceSourceV2,
} from "./durableQuerySuccessEvidenceV2";
import type { DurableWorkflowGeneralSameSessionQueryCapabilityV1 } from "./sameSessionQueryTypes";
import type {
  DurableWorkflowDatabaseCapabilityV2,
  DurableWorkflowDatabaseCommand,
  DurableWorkflowDatabaseExecutionResultV2,
  DurableWorkflowDatabaseRowProjectionFailureV2,
  DurableWorkflowDatabaseSuccessResultV2,
} from "./types";

export type PostgreSQLDurableWorkflowStatementResolverV2 = (
  command: DurableWorkflowDatabaseCommand,
) => PostgreSQLSliceAStatementResolutionV1;

export type PostgreSQLDurableWorkflowRowProjectorV2 = (
  source: DurableWorkflowQuerySuccessEvidenceSourceV2,
  mutationAttempted: boolean,
) => DurableWorkflowDatabaseSuccessResultV2 | DurableWorkflowDatabaseRowProjectionFailureV2;

export type PostgreSQLDurableWorkflowFailureClassifierV2 = (
  input: DurableWorkflowPostgresqlFailureClassificationInputV1,
) => DurableWorkflowPostgresqlFailureClassificationV1;

export type PostgreSQLDurableWorkflowDatabaseCapabilityV2Dependencies = Readonly<{
  sameSessionQueryCapability: DurableWorkflowGeneralSameSessionQueryCapabilityV1;
  statementResolver: PostgreSQLDurableWorkflowStatementResolverV2;
  rowProjector: PostgreSQLDurableWorkflowRowProjectorV2;
  failureClassifier: PostgreSQLDurableWorkflowFailureClassifierV2;
}>;

export type DefaultPostgreSQLDurableWorkflowDatabaseCapabilityV2Dependencies = Readonly<{
  sameSessionQueryCapability: DurableWorkflowGeneralSameSessionQueryCapabilityV1;
}>;

function copyCommand(command: DurableWorkflowDatabaseCommand): DurableWorkflowDatabaseCommand {
  return Object.freeze({
    commandVersion: command.commandVersion,
    statementId: command.statementId,
    parameters: Object.freeze(command.parameters.map((value) =>
      value instanceof Uint8Array ? Uint8Array.from(value) : value)),
    expectedResult: command.expectedResult,
  });
}

function unreachable(value: never): never {
  throw new TypeError(`unreachable-result:${String(value)}`);
}

export function createPostgresqlDurableWorkflowDatabaseCapabilityV2(
  dependencies: PostgreSQLDurableWorkflowDatabaseCapabilityV2Dependencies,
): DurableWorkflowDatabaseCapabilityV2 {
  const captured = Object.freeze({ ...dependencies });
  return Object.freeze({
    capabilityVersion: "1.0",
    failureContractVersion: "2.0",
    async execute(command): Promise<DurableWorkflowDatabaseExecutionResultV2> {
      const resolution = captured.statementResolver(copyCommand(command));
      if (resolution.status !== "resolved") {
        return createDurableWorkflowResolverFailureV2(resolution);
      }
      const queryResult = await captured.sameSessionQueryCapability.executeQuery(resolution.value.query);
      switch (queryResult.status) {
        case "success":
          return captured.rowProjector(
            Object.freeze({
              rows: queryResult.rows,
              rowCount: queryResult.rowCount,
              command: queryResult.command,
            }),
            resolution.value.statement.accessMode === "write",
          );
        case "not-found":
          return projectDurableWorkflowDatabaseNotFoundV2(queryResult);
        case "cardinality-conflict":
          return projectDurableWorkflowDatabaseCardinalityConflictV2(queryResult);
        case "execution-failure": {
          const classification = captured.failureClassifier(Object.freeze({
            classificationVersion: "1.0",
            issue: queryResult.classification,
            phase: "query-execution",
            statement: Object.freeze({ accessMode: resolution.value.statement.accessMode }),
          }));
          return projectDurableWorkflowGeneralQueryFailureV2(queryResult, classification.failure);
        }
        default:
          return unreachable(queryResult);
      }
    },
  });
}

export function createDefaultPostgresqlDurableWorkflowDatabaseCapabilityV2(
  dependencies: DefaultPostgreSQLDurableWorkflowDatabaseCapabilityV2Dependencies,
): DurableWorkflowDatabaseCapabilityV2 {
  return createPostgresqlDurableWorkflowDatabaseCapabilityV2(Object.freeze({
    sameSessionQueryCapability: dependencies.sameSessionQueryCapability,
    statementResolver: (command) => resolvePostgreSQLSliceAStatementV1(
      POSTGRESQL_SLICE_A_STATEMENT_CATALOG,
      command,
    ),
    rowProjector: projectPostgresqlQuerySuccessToDurableSuccessV2,
    failureClassifier: classifyDurableWorkflowPostgresqlFailureV1,
  }));
}
