import assert from "node:assert/strict";
import test from "node:test";
import { validateLocalOnlyConnectionAuthority } from "../../lib/workflowMigration/localConnectionGuard";

test("Scope D: Local-only connection authority guard validation", () => {
  // Permitted local targets
  assert.doesNotThrow(() => validateLocalOnlyConnectionAuthority({ host: "localhost", port: 5432, database: "test_db" }));
  assert.doesNotThrow(() => validateLocalOnlyConnectionAuthority({ host: "127.0.0.1", port: 5432, database: "disposable_local" }));
  assert.doesNotThrow(() => validateLocalOnlyConnectionAuthority({ host: "::1", port: 5432, database: "local_v6" }));
  assert.doesNotThrow(() => validateLocalOnlyConnectionAuthority({ host: "testcontainers", port: 5432, database: "foundation_test" }));

  // Rejected remote / cloud targets
  assert.throws(
    () => validateLocalOnlyConnectionAuthority({ host: "34.120.50.1", port: 5432, database: "easyslice_staging" }),
    /remote cloud database identifier forbidden/,
  );
  assert.throws(
    () => validateLocalOnlyConnectionAuthority({ host: "staging-cloudsql.internal", port: 5432, database: "db" }),
    /remote cloud host forbidden/,
  );
  assert.throws(
    () => validateLocalOnlyConnectionAuthority({ host: "127.0.0.1", port: 5432, database: "easyslice_prod" }),
    /remote cloud database identifier forbidden/,
  );
  assert.throws(
    () => validateLocalOnlyConnectionAuthority({ host: "127.0.0.1", port: 5432, database: "test_db", user: "prod_admin" }),
    /remote cloud user identifier forbidden/,
  );
  assert.throws(
    () => validateLocalOnlyConnectionAuthority({ host: "db.example.com", port: 5432, database: "test" }),
    /non-local connection target rejected/,
  );
  assert.throws(
    () => validateLocalOnlyConnectionAuthority({ host: "", port: 5432, database: "test" }),
    /host cannot be empty/,
  );
});
