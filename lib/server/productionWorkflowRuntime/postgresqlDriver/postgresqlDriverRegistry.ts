import type { PostgreSQLDriverDescriptor } from "./types";

const descriptors = Object.freeze([
  Object.freeze({ descriptorVersion: "1.0", id: "postgresql-driver-adapter-v1", driver: "pg", driverMajor: 8, sqlStyle: "parameterized-explicit", namedPreparedStatements: false, abortSignal: "unsupported-pg-8.22.0", productionReady: false }),
] satisfies readonly PostgreSQLDriverDescriptor[]);

export const listPostgreSQLDriverDescriptors = (): readonly PostgreSQLDriverDescriptor[] => descriptors.map((value) => Object.freeze({ ...value }));
export const getPostgreSQLDriverDescriptor = (id: string): PostgreSQLDriverDescriptor | undefined => {
  const value = descriptors.find((entry) => entry.id === id);
  return value ? Object.freeze({ ...value }) : undefined;
};
