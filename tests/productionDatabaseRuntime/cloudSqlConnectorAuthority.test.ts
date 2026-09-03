import assert from "node:assert/strict";
import test from "node:test";
import type { TLSSocket } from "node:tls";
import { AuthTypes, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import type { IdentityPoolClient } from "google-auth-library";
import { createProductionCloudSqlConnectorAuthority } from "../../lib/server/productionDatabaseRuntime/cloudSqlConnectorAuthority";

const configuration = Object.freeze({
  instanceConnectionName: "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql",
  database: "nexcut",
  iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
});

test("shared authority validates exact production identity and preserves connector stream", async () => {
  const stream = (): TLSSocket => ({} as TLSSocket);
  let connectors = 0;
  let closes = 0;
  const calls: unknown[] = [];
  const authority = createProductionCloudSqlConnectorAuthority({} as IdentityPoolClient, configuration, {
    createConnector() {
      connectors += 1;
      return {
        async getOptions(options) { calls.push(options); return { stream }; },
        close() { closes += 1; },
      };
    },
  });

  assert.equal((await authority.getDriverOptions()).stream, stream);
  assert.equal((await authority.getDriverOptions()).stream, stream);
  assert.equal(connectors, 1);
  assert.deepEqual(calls, [{
    instanceConnectionName: configuration.instanceConnectionName,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.IAM,
  }]);
  authority.close();
  authority.close();
  assert.equal(closes, 1);
  await assert.rejects(authority.getDriverOptions(), /closed/);
});

test("getOptions failure closes once and exposes only a closed diagnostic", async () => {
  let closes = 0;
  const secret = "sensitive-connector-value";
  const raw = Object.assign(new Error(secret, { cause: secret }), { credential: secret });
  const authority = createProductionCloudSqlConnectorAuthority({} as IdentityPoolClient, configuration, {
    createConnector() {
      return {
        async getOptions() { throw raw; },
        close() { closes += 1; },
      };
    },
  });

  await assert.rejects(authority.getDriverOptions(), (error: Error) => {
    assert.equal(error.message, "Production Cloud SQL transport is unavailable");
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(error.message, new RegExp(secret));
    assert.doesNotMatch(String(error), new RegExp(secret));
    assert.doesNotMatch(JSON.stringify(error), new RegExp(secret));
    assert.equal(Object.values(error).some((value) => String(value).includes(secret)), false);
    return true;
  });
  authority.close();
  assert.equal(closes, 1);
});

test("Connector construction failure exposes only a closed diagnostic", () => {
  const secret = "sensitive-constructor-value";
  const raw = Object.assign(new Error(secret, { cause: secret }), {
    credential: secret,
    metadata: { nested: secret },
  });

  assert.throws(() => createProductionCloudSqlConnectorAuthority(
    {} as IdentityPoolClient,
    configuration,
    { createConnector() { throw raw; } },
  ), (error: Error) => {
    assert.equal(error.message, "Production Cloud SQL transport is unavailable");
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(error.message, new RegExp(secret));
    assert.doesNotMatch(String(error), new RegExp(secret));
    assert.doesNotMatch(JSON.stringify(error), new RegExp(secret));
    assert.equal(Object.values(error).some((value) => String(value).includes(secret)), false);
    return true;
  });
});

test("Connector close failure exposes only a closed cleanup diagnostic", () => {
  const secret = "sensitive-close-value";
  const authority = createProductionCloudSqlConnectorAuthority({} as IdentityPoolClient, configuration, {
    createConnector() {
      return {
        async getOptions() { return { stream: () => ({} as TLSSocket) }; },
        close() { throw Object.assign(new Error(secret), { credential: secret }); },
      };
    },
  });
  assert.throws(() => authority.close(), (error: Error) => {
    assert.equal(error.message, "Production Cloud SQL authority cleanup failed");
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(String(error), new RegExp(secret));
    assert.doesNotMatch(JSON.stringify(error), new RegExp(secret));
    return true;
  });
  assert.doesNotThrow(() => authority.close());
});

test("invalid authority fails before connector construction", () => {
  let connectors = 0;
  assert.throws(() => createProductionCloudSqlConnectorAuthority({} as IdentityPoolClient, {
    ...configuration,
    database: "other",
  }, {
    createConnector() { connectors += 1; throw new Error("must not construct"); },
  }), /Invalid Production database authority/);
  assert.equal(connectors, 0);
});
