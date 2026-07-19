export const POSTGRESQL_TEST_IMAGE =
  "postgres:18.4@sha256:c2d42a104eb6b37b286a2d9c5cf83f349de4d6516d513d00a2bd9610e2c2e5e4" as const;

export const FLYWAY_COMMUNITY_IMAGE =
  "flyway/flyway:12.6.1@sha256:876479697e6f272e7897f9cebc5d43090e4e7ba164de9eb11e07767bff075011" as const;

export const POSTGRESQL_TEST_MAJOR = 18;
export const POSTGRESQL_TEST_PATCH = "18.4";
export const POSTGRESQL_CONTAINER_PORT = 5432;
export const POSTGRESQL_NETWORK_ALIAS = "postgres-test";
export const POSTGRESQL_STARTUP_TIMEOUT_MS = 60_000;
export const POSTGRESQL_READINESS_TIMEOUT_MS = 20_000;
