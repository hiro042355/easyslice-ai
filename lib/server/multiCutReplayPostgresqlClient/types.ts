import type {
  MultiCutReplayPostgresqlStatementParameters,
} from "../multiCutReplayPostgresqlAdapterPort";
import type {
  MultiCutReplayPostgresqlStatementId,
} from "../multiCutReplayPostgresqlStatementCatalog/types";

export type MultiCutReplayPostgresqlClientTransactionScope =
  | "read-consistent"
  | "required"
  | "workflow-completion";

export type MultiCutReplayPostgresqlClientCancellationBoundary =
  Readonly<{
    cancellationVersion: "1.0";
    requested: boolean;
    propagation: "client-boundary";
    opaqueSignalReference?: string;
  }>;

export type MultiCutReplayPostgresqlClientTransaction = Readonly<{
  transactionVersion: "1.0";
  scope: MultiCutReplayPostgresqlClientTransactionScope;
  ownership: "caller" | "connection-lifetime-capability";
  opaqueTransactionReference: string;
}>;

export type MultiCutReplayPostgresqlPreparedStatementExpectedResultMetadata =
  Readonly<{
    metadataVersion: "1.0";
    resultShape: "opaque";
    affectedRowMetadata: "available" | "not-applicable";
  }>;

export type MultiCutReplayPostgresqlPreparedStatement = Readonly<{
  preparedStatementVersion: "1.0";
  statementIdentifier: MultiCutReplayPostgresqlStatementId;
  parameters: MultiCutReplayPostgresqlStatementParameters;
  expectedResult:
    MultiCutReplayPostgresqlPreparedStatementExpectedResultMetadata;
}>;

export type MultiCutReplayPostgresqlQueryResult = Readonly<{
  resultVersion: "1.0";
  statementIdentifier: MultiCutReplayPostgresqlStatementId;
  opaqueResult: unknown;
  metadata: Readonly<{
    metadataVersion: "1.0";
    affectedRowCount?: number;
    cancellationPropagated: boolean;
  }>;
}>;

export type MultiCutReplayPostgresqlQueryExecutionRequest = Readonly<{
  requestVersion: "1.0";
  preparedStatement: MultiCutReplayPostgresqlPreparedStatement;
  transaction?: MultiCutReplayPostgresqlClientTransaction;
  cancellation: MultiCutReplayPostgresqlClientCancellationBoundary;
}>;

export type MultiCutReplayPostgresqlQueryExecution = Readonly<{
  execute(
    request: MultiCutReplayPostgresqlQueryExecutionRequest,
  ): Promise<MultiCutReplayPostgresqlQueryResult>;
}>;

export type MultiCutReplayPostgresqlConnection = Readonly<{
  connectionVersion: "1.0";
  opaqueConnectionReference: string;
  ownership: "connection-lifetime-capability";
  query: MultiCutReplayPostgresqlQueryExecution;
}>;

export type MultiCutReplayPostgresqlConnectionAcquisitionRequest =
  Readonly<{
    requestVersion: "1.0";
    ownership: "connection-lifetime-capability";
    cancellation: MultiCutReplayPostgresqlClientCancellationBoundary;
  }>;

export type MultiCutReplayPostgresqlConnectionReleaseRequest = Readonly<{
  requestVersion: "1.0";
  connection: MultiCutReplayPostgresqlConnection;
  ownership: "connection-lifetime-capability";
}>;

export type MultiCutReplayPostgresqlConnectionLifetimeCapability =
  Readonly<{
    acquire(
      request: MultiCutReplayPostgresqlConnectionAcquisitionRequest,
    ): Promise<MultiCutReplayPostgresqlConnection>;
    release(
      request: MultiCutReplayPostgresqlConnectionReleaseRequest,
    ): Promise<void>;
  }>;

export type MultiCutReplayPostgresqlClientMetadata = Readonly<{
  clientVersion: "1.0";
  connectionBoundary: "capability-only";
  transactionBoundary: "context-only";
  preparedStatementBoundary: "identifier-and-parameters-only";
  cancellationBoundary: "metadata-only";
  queryTextBoundary: "not-exposed";
}>;

export type MultiCutReplayPostgresqlClient = Readonly<{
  metadata: MultiCutReplayPostgresqlClientMetadata;
  acquire(
    request: MultiCutReplayPostgresqlConnectionAcquisitionRequest,
  ): Promise<MultiCutReplayPostgresqlConnection>;
  release(
    request: MultiCutReplayPostgresqlConnectionReleaseRequest,
  ): Promise<void>;
}>;

export type MultiCutReplayPostgresqlClientFactoryDependencies =
  Readonly<{
    connectionLifetime:
      MultiCutReplayPostgresqlConnectionLifetimeCapability;
  }>;

export type MultiCutReplayPostgresqlClientFactory = Readonly<{
  create(
    dependencies: MultiCutReplayPostgresqlClientFactoryDependencies,
  ): MultiCutReplayPostgresqlClient;
}>;
