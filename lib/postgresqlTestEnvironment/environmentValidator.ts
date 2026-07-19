import {
  FLYWAY_COMMUNITY_IMAGE,
  POSTGRESQL_TEST_IMAGE,
} from "./constants";

export type PostgreSqlFoundationEnvironment = Readonly<{
  nodeVersion: string;
  postgresImage: string;
  flywayImage: string;
}>;

export function validatePostgreSqlFoundationEnvironment(
  environment: PostgreSqlFoundationEnvironment = {
    nodeVersion: process.versions.node,
    postgresImage: POSTGRESQL_TEST_IMAGE,
    flywayImage: FLYWAY_COMMUNITY_IMAGE,
  },
): void {
  const nodeMajor = Number.parseInt(environment.nodeVersion.split(".")[0] ?? "", 10);

  if (!Number.isInteger(nodeMajor) || nodeMajor < 24) {
    throw new Error("postgresql-foundation-node-version-unsupported");
  }
  if (environment.postgresImage !== POSTGRESQL_TEST_IMAGE) {
    throw new Error("postgresql-foundation-image-not-pinned");
  }
  if (environment.flywayImage !== FLYWAY_COMMUNITY_IMAGE) {
    throw new Error("postgresql-foundation-flyway-not-pinned");
  }
  if (!environment.postgresImage.includes("@sha256:")) {
    throw new Error("postgresql-foundation-image-digest-missing");
  }
  if (!environment.flywayImage.includes("@sha256:")) {
    throw new Error("postgresql-foundation-flyway-digest-missing");
  }
}
