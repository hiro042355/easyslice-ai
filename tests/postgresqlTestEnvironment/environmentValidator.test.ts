import assert from "node:assert/strict";
import test from "node:test";
import { FLYWAY_COMMUNITY_IMAGE, POSTGRESQL_TEST_IMAGE, validatePostgreSqlFoundationEnvironment } from "../../lib/postgresqlTestEnvironment";

test("accepts the exact Node and immutable artifact contract", () => {
  assert.doesNotThrow(() => validatePostgreSqlFoundationEnvironment({ nodeVersion: "24.16.0", postgresImage: POSTGRESQL_TEST_IMAGE, flywayImage: FLYWAY_COMMUNITY_IMAGE }));
});

test("rejects floating or substituted artifacts", () => {
  assert.throws(() => validatePostgreSqlFoundationEnvironment({ nodeVersion: "24.16.0", postgresImage: "postgres:18.4", flywayImage: FLYWAY_COMMUNITY_IMAGE }), /postgresql-foundation-image-not-pinned/);
  assert.throws(() => validatePostgreSqlFoundationEnvironment({ nodeVersion: "24.16.0", postgresImage: POSTGRESQL_TEST_IMAGE, flywayImage: "flyway\/flyway:12.6.1" }), /postgresql-foundation-flyway-not-pinned/);
});
