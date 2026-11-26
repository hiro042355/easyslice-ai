import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STAGING_DATABASE_NAME,
  STAGING_IAM_USER,
  STAGING_MIGRATION_MANIFEST,
  buildStagingApplyPlan,
  evaluateStagingFlywayHistory,
  evaluateStagingSchemaReadiness,
  type FlywayHistoryRow,
  type StagingSchemaSnapshot,
} from "../../lib/workflowMigration/stagingMigrationPreflight";

function history(count: number): FlywayHistoryRow[] {
  return STAGING_MIGRATION_MANIFEST.slice(0, count).map((entry, index) => ({
    installed_rank: index + 1,
    version: entry.version,
    description: entry.description,
    type: "SQL",
    success: true,
    checksum: 1000 + index,
  }));
}

function snapshot(overrides: Partial<StagingSchemaSnapshot> = {}): StagingSchemaSnapshot {
  return {
    database: STAGING_DATABASE_NAME,
    flyway: history(9),
    assetImportAuthority: {
      constraintPresent: true,
      constraintDefinition:
        "CHECK (((command_version = '1.0'::text) AND (platform = ANY (ARRAY['youtube'::text, 'tiktok'::text]))))",
      platformColumnType: "text",
      commandVersionColumnType: "text",
    },
    grants: {
      iamUser: STAGING_IAM_USER,
      iamUserExists: true,
      canSelectAssetImportRequests: true,
      canInsertAssetImportRequests: true,
      canUpdateAssetImportRequests: true,
      canSelectJobs: true,
      canSelectMedia: true,
    },
    ...overrides,
  };
}

test("nine successful migrations report CURRENT", () => {
  const assessment = evaluateStagingFlywayHistory(history(9));
  assert.equal(assessment.status, "CURRENT");
  assert.deepEqual(assessment.appliedVersions, ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  assert.deepEqual(assessment.pendingVersions, []);
  assert.equal(assessment.requiresV000009, false);
  assert.deepEqual(assessment.blockers, []);
});

test("eight successful migrations require only V000009", () => {
  const assessment = evaluateStagingFlywayHistory(history(8));
  assert.equal(assessment.status, "PENDING_MIGRATION");
  assert.deepEqual(assessment.pendingVersions, ["9"]);
  assert.equal(assessment.requiresV000009, true);
  assert.deepEqual(assessment.blockers, []);
});

test("a failed migration row blocks the plan", () => {
  const rows = history(8);
  rows[2] = { ...rows[2], success: false };
  const assessment = evaluateStagingFlywayHistory(rows);
  assert.equal(assessment.status, "BLOCKED");
  assert.ok(assessment.blockers.includes("failed-migration:3"));
});

test("unknown, duplicated and out-of-order versions block the plan", () => {
  const unknown = history(8);
  unknown.push({ installed_rank: 9, version: "10", description: "future", type: "SQL", success: true, checksum: 1 });
  assert.ok(evaluateStagingFlywayHistory(unknown).blockers.includes("unknown-migration-version:10"));

  const duplicated = [...history(8), { ...history(8)[7], installed_rank: 9 }];
  assert.ok(evaluateStagingFlywayHistory(duplicated).blockers.includes("duplicate-migration-version:8"));

  const outOfOrder = [...history(8)];
  outOfOrder[7] = { ...outOfOrder[7], version: "6" };
  const assessment = evaluateStagingFlywayHistory(outOfOrder);
  assert.equal(assessment.status, "BLOCKED");
});

test("history behind V000008 blocks instead of guessing a recovery", () => {
  const assessment = evaluateStagingFlywayHistory(history(7));
  assert.equal(assessment.status, "BLOCKED");
  assert.deepEqual(assessment.pendingVersions, ["8", "9"]);
  assert.ok(assessment.blockers.includes("staging-history-behind-approved-baseline-V000008"));
});

test("a fully migrated staging snapshot is ready", () => {
  const assessment = evaluateStagingSchemaReadiness(snapshot());
  assert.equal(assessment.ready, true);
  assert.deepEqual(assessment.blockers, []);
  assert.equal(assessment.flywayStatus, "CURRENT");
});

test("a staging snapshot at V000008 is ready to receive V000009", () => {
  const assessment = evaluateStagingSchemaReadiness(snapshot({ flyway: history(8) }));
  assert.equal(assessment.ready, true);
  assert.equal(assessment.flywayStatus, "PENDING_MIGRATION");
  assert.equal(assessment.requiresV000009, true);
});

test("production database names are rejected", () => {
  const assessment = evaluateStagingSchemaReadiness(snapshot({ database: "nexcut" }));
  assert.equal(assessment.ready, false);
  assert.ok(assessment.blockers.includes("database-is-easyslice-staging"));
});

test("a youtube-only constraint is not accepted as TikTok-ready", () => {
  const assessment = evaluateStagingSchemaReadiness(
    snapshot({
      assetImportAuthority: {
        constraintPresent: true,
        constraintDefinition: "CHECK (((command_version = '1.0'::text) AND (platform = 'youtube'::text)))",
        platformColumnType: "text",
        commandVersionColumnType: "text",
      },
    }),
  );
  assert.equal(assessment.ready, false);
  assert.ok(assessment.blockers.includes("asset-import-authority-accepts-tiktok"));
});

test("foreign platform tokens invalidate the constraint authority", () => {
  const assessment = evaluateStagingSchemaReadiness(
    snapshot({
      assetImportAuthority: {
        constraintPresent: true,
        constraintDefinition:
          "CHECK (((command_version = '1.0'::text) AND (platform = ANY (ARRAY['youtube'::text, 'tiktok'::text, 'instagram'::text]))))",
        platformColumnType: "text",
        commandVersionColumnType: "text",
      },
    }),
  );
  assert.equal(assessment.ready, false);
  assert.ok(assessment.blockers.includes("asset-import-authority-accepts-tiktok"));
});

test("a missing or unpinned IAM database user blocks readiness", () => {
  const wrongUser = evaluateStagingSchemaReadiness(
    snapshot({ grants: { ...snapshot().grants, iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam" } }),
  );
  assert.equal(wrongUser.ready, false);
  assert.ok(wrongUser.blockers.includes("staging-database-iam-user-is-pinned"));

  const missingUser = evaluateStagingSchemaReadiness(
    snapshot({ grants: { ...snapshot().grants, iamUserExists: false } }),
  );
  assert.equal(missingUser.ready, false);
  assert.ok(missingUser.blockers.includes("staging-database-iam-user-is-pinned"));
});

test("missing grants block readiness", () => {
  const assessment = evaluateStagingSchemaReadiness(
    snapshot({ grants: { ...snapshot().grants, canInsertAssetImportRequests: false } }),
  );
  assert.equal(assessment.ready, false);
  assert.ok(assessment.blockers.includes("grant-canInsertAssetImportRequests"));
});

test("apply plan refuses production instances and missing approvals", () => {
  const ready = evaluateStagingSchemaReadiness(snapshot());
  const production = buildStagingApplyPlan({
    instanceConnectionName: "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql",
    assessment: ready,
    poApprovalReference: "CHG-1234",
  });
  assert.equal(production.blocked, true);
  assert.ok(production.blockers.includes("production-instance-forbidden"));
  assert.ok(production.blockers.includes("instance-connection-name-is-not-the-approved-staging-instance"));

  const unapproved = buildStagingApplyPlan({
    instanceConnectionName: "nexcut-staging:asia-northeast1:nexcut-staging-postgresql",
    assessment: ready,
    poApprovalReference: "",
  });
  assert.equal(unapproved.blocked, true);
  assert.ok(unapproved.blockers.includes("po-approval-reference-required"));

  const approved = buildStagingApplyPlan({
    instanceConnectionName: "nexcut-staging:asia-northeast1:nexcut-staging-postgresql",
    assessment: ready,
    poApprovalReference: "CHG-1234",
  });
  assert.equal(approved.blocked, false);
  assert.deepEqual(approved.blockers, []);
  assert.equal(approved.database, STAGING_DATABASE_NAME);
  assert.equal(approved.targetVersion, "9");
});

test("read-only preflight SQL contains no mutating statements", () => {
  for (const path of [
    "db/staging/preflight/001_flyway_history.sql",
    "db/staging/preflight/002_asset_import_authority.sql",
  ]) {
    const sql = readFileSync(path, "utf8");
    // Strip comments and string literals (privilege names are literals) before
    // asserting that the statement itself cannot mutate the database.
    const executable = sql
      .replace(/--[^\n]*/g, " ")
      .replace(/'(?:[^']|'')*'/g, " '' ");
    assert.doesNotMatch(executable, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/i, path);
    assert.match(sql, /SELECT json_build_object/i, path);
  }
  const flywaySql = readFileSync("db/staging/preflight/001_flyway_history.sql", "utf8");
  assert.match(flywaySql, /FROM flyway_schema_history;/);
  const authoritySql = readFileSync("db/staging/preflight/002_asset_import_authority.sql", "utf8");
  assert.match(authoritySql, /ck_asset_import_authority/);
  assert.match(authoritySql, /easyslice-staging-sa@nexcut-staging\.iam/);
});

test("preflight CLI default mode prints the read-only plan and opens no connection", () => {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/staging/preflightStagingCloudSql.ts"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /read-only; no DDL is executed/);
  assert.match(result.stdout, /database:\s+easyslice_staging/);
  assert.match(result.stdout, /DRY_RUN: no database connection was opened/);
});
