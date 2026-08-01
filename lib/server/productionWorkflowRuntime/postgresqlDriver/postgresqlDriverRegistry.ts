import type { PostgreSQLDriverDescriptor } from "./types";
import {
  evaluatePostgreSQLProductionReadiness,
  POSTGRESQL_PRODUCTION_CAPABILITIES,
} from "./postgresqlProductionReadiness";

const readiness = evaluatePostgreSQLProductionReadiness(POSTGRESQL_PRODUCTION_CAPABILITIES);

const descriptors = Object.freeze([
  Object.freeze({
    descriptorVersion: "1.0",
    id: "postgresql-driver-adapter-v1",
    driver: "pg",
    driverMajor: 8,
    sqlStyle: "parameterized-explicit",
    namedPreparedStatements: false,
    abortSignal: POSTGRESQL_PRODUCTION_CAPABILITIES.abortSignal,
    capabilities: POSTGRESQL_PRODUCTION_CAPABILITIES,
    readinessBlockers: readiness.blockers,
    productionReady: readiness.productionReady,
  }),
] satisfies readonly PostgreSQLDriverDescriptor[]);

export const listPostgreSQLDriverDescriptors = (): readonly PostgreSQLDriverDescriptor[] => descriptors.map((value) => Object.freeze({ ...value }));
export const getPostgreSQLDriverDescriptor = (id: string): PostgreSQLDriverDescriptor | undefined => {
  const value = descriptors.find((entry) => entry.id === id);
  return value ? Object.freeze({ ...value }) : undefined;
};
