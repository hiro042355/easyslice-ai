import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";

test("starts PostgreSQL 18.4, validates Flyway, uses UTC, and tears down", async () => {
  let stoppedContainerId = "";
  await withPostgreSqlTestEnvironment(async (environment) => {
    stoppedContainerId = environment.containerId;
    assert.equal(environment.readiness.serverVersion.startsWith("18.4"), true);
    assert.equal(environment.readiness.serverVersionNum, 180004);
    assert.equal(environment.readiness.timezone, "UTC");
    assert.equal(environment.readiness.readWrite, true);
    assert.equal(environment.flyway.migrate.command, "migrate");
    assert.equal(environment.flyway.migrate.succeeded, true);
    assert.equal(environment.flyway.validate.command, "validate");
    assert.equal(environment.flyway.validate.succeeded, true);
    assert.equal(environment.connection.port > 0, true);
  });
  assert.match(stoppedContainerId, /^[a-f0-9]{64}$/);
});
