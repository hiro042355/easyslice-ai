import assert from "node:assert/strict";
import { Duplex } from "node:stream";
import test from "node:test";
import { createPostgreSQLNativePoolConfig } from "../../lib/server/productionWorkflowRuntime/postgresqlDriver/postgresqlConnectionPool";
import type { PostgreSQLConnectionConfig, PostgreSQLConnectorConnectionConfig } from "../../lib/server/productionWorkflowRuntime/postgresqlDriver/types";

const common = Object.freeze({
  database: "nexcut",
  user: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
  maxConnections: 8,
  connectionTimeoutMs: 10_000,
  idleTimeoutMs: 30_000,
  queryTimeoutMs: 10_000,
  applicationName: "connector-options-test",
});

const directTypeAuthority: PostgreSQLConnectionConfig = {
  ...common, host: "127.0.0.1", port: 5432, password: "test-only", tls: { mode: "disabled" },
};
const connectorTypeAuthority: PostgreSQLConnectorConnectionConfig = {
  ...common, connectorDriverOptions: { stream: () => new Duplex() },
};
void directTypeAuthority;
void connectorTypeAuthority;

// @ts-expect-error Connector authority must reject host.
const connectorWithHost: PostgreSQLConnectorConnectionConfig = { ...connectorTypeAuthority, host: "127.0.0.1" };
// @ts-expect-error Connector authority must reject port.
const connectorWithPort: PostgreSQLConnectorConnectionConfig = { ...connectorTypeAuthority, port: 5432 };
// @ts-expect-error Connector authority must reject password.
const connectorWithPassword: PostgreSQLConnectorConnectionConfig = { ...connectorTypeAuthority, password: "forbidden" };
// @ts-expect-error Connector authority must reject custom TLS.
const connectorWithTls: PostgreSQLConnectorConnectionConfig = { ...connectorTypeAuthority, tls: { mode: "verify-full" } };
// @ts-expect-error Direct authority must reject Connector driver options.
const directWithConnector: PostgreSQLConnectionConfig = { ...directTypeAuthority, connectorDriverOptions: connectorTypeAuthority.connectorDriverOptions };
void connectorWithHost;
void connectorWithPort;
void connectorWithPassword;
void connectorWithTls;
void directWithConnector;

test("connector stream reaches native pg config without TCP, password, or TLS translation", () => {
  const stream = (): Duplex => new Duplex();
  const result = createPostgreSQLNativePoolConfig({
    ...common,
    connectorDriverOptions: Object.freeze({ stream }),
  });

  assert.equal(result.stream, stream);
  assert.equal(result.database, common.database);
  assert.equal(result.user, common.user);
  assert.equal(result.max, common.maxConnections);
  assert.equal(result.connectionTimeoutMillis, common.connectionTimeoutMs);
  assert.equal(result.idleTimeoutMillis, common.idleTimeoutMs);
  assert.equal(result.statement_timeout, common.queryTimeoutMs);
  assert.equal(result.host, undefined);
  assert.equal(result.port, undefined);
  assert.equal(result.password, undefined);
  assert.equal(result.ssl, undefined);
});

test("existing direct TCP configuration remains compatible", () => {
  const result = createPostgreSQLNativePoolConfig({
    ...common,
    host: "127.0.0.1",
    port: 5432,
    password: "test-only-password",
    tls: Object.freeze({ mode: "verify-full" }),
  });

  assert.equal(result.host, "127.0.0.1");
  assert.equal(result.port, 5432);
  assert.equal(result.password, "test-only-password");
  assert.deepEqual(result.ssl, { rejectUnauthorized: true });
  assert.equal(result.stream, undefined);
});
