export type PostgreSQLCapabilitySupport = "supported" | "unsupported" | "deferred";

export type PostgreSQLIntegrationEvidence = Readonly<{
  normalPath: PostgreSQLCapabilitySupport;
  failureRecovery: PostgreSQLCapabilitySupport;
  connectionLoss: PostgreSQLCapabilitySupport;
  boundedQueryTimeout: PostgreSQLCapabilitySupport;
  gracefulDrain: PostgreSQLCapabilitySupport;
  staticRegression: PostgreSQLCapabilitySupport;
}>;

export type PostgreSQLProductionCapabilities = Readonly<{
  capabilityVersion: "1.0";
  safeErrorContract: PostgreSQLCapabilitySupport;
  transactionSafety: PostgreSQLCapabilitySupport;
  commitUnknownContainment: PostgreSQLCapabilitySupport;
  connectionRecovery: PostgreSQLCapabilitySupport;
  boundedQueryExecution: PostgreSQLCapabilitySupport;
  boundedGracefulDrain: PostgreSQLCapabilitySupport;
  safeObservability: PostgreSQLCapabilitySupport;
  integrationEvidence: PostgreSQLIntegrationEvidence;
  abortSignal: "unsupported-pg-8.22.0";
}>;

export type PostgreSQLRequiredCapability = Exclude<
  keyof PostgreSQLProductionCapabilities,
  "capabilityVersion" | "abortSignal"
>;

export type PostgreSQLOptionalCapability = "abortSignal";

export type PostgreSQLReadinessBlocker =
  | "safe-error-contract"
  | "transaction-safety"
  | "commit-unknown-containment"
  | "connection-recovery"
  | "bounded-query-execution"
  | "bounded-graceful-drain"
  | "safe-observability"
  | "integration-evidence";

export type PostgreSQLProductionReadiness = Readonly<{
  productionReady: boolean;
  blockers: readonly PostgreSQLReadinessBlocker[];
}>;

export const POSTGRESQL_REQUIRED_CAPABILITIES = Object.freeze([
  "safeErrorContract",
  "transactionSafety",
  "commitUnknownContainment",
  "connectionRecovery",
  "boundedQueryExecution",
  "boundedGracefulDrain",
  "safeObservability",
  "integrationEvidence",
] as const satisfies readonly PostgreSQLRequiredCapability[]);

export const POSTGRESQL_OPTIONAL_CAPABILITIES = Object.freeze([
  "abortSignal",
] as const satisfies readonly PostgreSQLOptionalCapability[]);

const integrationEvidence = Object.freeze({
  normalPath: "supported",
  failureRecovery: "supported",
  connectionLoss: "supported",
  boundedQueryTimeout: "supported",
  gracefulDrain: "supported",
  staticRegression: "supported",
} satisfies PostgreSQLIntegrationEvidence);

export const POSTGRESQL_PRODUCTION_CAPABILITIES = Object.freeze({
  capabilityVersion: "1.0",
  safeErrorContract: "supported",
  transactionSafety: "supported",
  commitUnknownContainment: "supported",
  connectionRecovery: "supported",
  boundedQueryExecution: "supported",
  boundedGracefulDrain: "supported",
  safeObservability: "supported",
  integrationEvidence,
  abortSignal: "unsupported-pg-8.22.0",
} satisfies PostgreSQLProductionCapabilities);

const blockerByCapability = Object.freeze({
  safeErrorContract: "safe-error-contract",
  transactionSafety: "transaction-safety",
  commitUnknownContainment: "commit-unknown-containment",
  connectionRecovery: "connection-recovery",
  boundedQueryExecution: "bounded-query-execution",
  boundedGracefulDrain: "bounded-graceful-drain",
  safeObservability: "safe-observability",
  integrationEvidence: "integration-evidence",
} satisfies Readonly<Record<PostgreSQLRequiredCapability, PostgreSQLReadinessBlocker>>);

const supportsIntegrationEvidence = (evidence: PostgreSQLIntegrationEvidence): boolean =>
  Object.values(evidence).every((support) => support === "supported");

export const evaluatePostgreSQLProductionReadiness = (
  capabilities: PostgreSQLProductionCapabilities,
): PostgreSQLProductionReadiness => {
  const blockers = POSTGRESQL_REQUIRED_CAPABILITIES.flatMap((capability) => {
    const supported = capability === "integrationEvidence"
      ? supportsIntegrationEvidence(capabilities.integrationEvidence)
      : capabilities[capability] === "supported";
    return supported ? [] : [blockerByCapability[capability]];
  });
  return Object.freeze({
    productionReady: blockers.length === 0,
    blockers: Object.freeze(blockers),
  });
};
