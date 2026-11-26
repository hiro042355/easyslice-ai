/**
 * BLK-02 operator entry point. It never writes to Cloud SQL.
 *
 *   npx tsx scripts/staging/preflightStagingCloudSql.ts
 *     Prints the read-only evidence plan (default mode).
 *
 *   npx tsx scripts/staging/preflightStagingCloudSql.ts \
 *     --snapshot ./staging-evidence --instance nexcut-staging:asia-northeast1:nexcut-staging-postgresql
 *     Evaluates snapshots produced by db/staging/preflight/*.sql and prints a
 *     redacted readiness report. Exit code 0 only when ready=true.
 *
 *   npx tsx scripts/staging/preflightStagingCloudSql.ts \
 *     --plan --instance ... --po-approval <change-ticket-id> --snapshot ...
 *     Prints the approval-gated Flyway plan. Still performs no writes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STAGING_DATABASE_NAME,
  STAGING_IAM_USER,
  STAGING_INSTANCE_ID,
  STAGING_LATEST_VERSION,
  STAGING_MIGRATION_MANIFEST,
  STAGING_REGION,
  buildStagingApplyPlan,
  evaluateStagingSchemaReadiness,
  type StagingSchemaSnapshot,
} from "../../lib/workflowMigration/stagingMigrationPreflight";

interface Arguments {
  readonly snapshotDirectory: string | null;
  readonly instanceConnectionName: string | null;
  readonly poApprovalReference: string | null;
  readonly plan: boolean;
}

function parseArguments(argv: readonly string[]): Arguments {
  let snapshotDirectory: string | null = null;
  let instanceConnectionName: string | null = null;
  let poApprovalReference: string | null = null;
  let plan = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--snapshot") {
      snapshotDirectory = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--instance") {
      instanceConnectionName = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--po-approval") {
      poApprovalReference = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--plan") {
      plan = true;
    } else if (argument === "--help" || argument === "-h") {
      printPlan();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { snapshotDirectory, instanceConnectionName, poApprovalReference, plan };
}

function printPlan(): void {
  const expectedInstance = `nexcut-staging:${STAGING_REGION}:${STAGING_INSTANCE_ID}`;
  console.log("BLK-02 staging Cloud SQL readiness (read-only; no DDL is executed)");
  console.log(`  database:            ${STAGING_DATABASE_NAME}`);
  console.log(`  instance (expected): ${expectedInstance}`);
  console.log(`  IAM database user:   ${STAGING_IAM_USER}`);
  console.log(`  Flyway target:       V000${STAGING_LATEST_VERSION.padStart(6, "0")}`);
  console.log("");
  console.log("Evidence steps:");
  console.log("  1. Start the Cloud SQL Auth Proxy against the staging instance (port 9470).");
  console.log("  2. psql ... -A -t -f db/staging/preflight/001_flyway_history.sql > flyway-history.json");
  console.log("  3. psql ... -A -t --set=iam_user=... -f db/staging/preflight/002_asset_import_authority.sql > schema-authority.json");
  console.log("  4. Re-run this script with --snapshot <dir> and --instance <connection name>.");
  console.log("");
  console.log("Approved migration manifest:");
  for (const entry of STAGING_MIGRATION_MANIFEST) {
    console.log(`  V${entry.version.padStart(6, "0")}  ${entry.file}`);
  }
}

function readJson(path: string): Record<string, unknown> {
  const text = readFileSync(path, "utf8").trim();
  if (text.length === 0) {
    throw new Error(`Empty snapshot: ${path}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // psql -A -t prints one JSON document per line; tolerate surrounding noise
    // by taking the last non-empty line that parses.
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines[index]) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
    throw new Error(`Snapshot is not JSON: ${path}`);
  }
}

function buildSnapshot(directory: string): StagingSchemaSnapshot {
  const flywaySnapshot = readJson(join(directory, "flyway-history.json"));
  const authoritySnapshot = readJson(join(directory, "schema-authority.json"));

  const flyway = flywaySnapshot.flyway;
  if (!Array.isArray(flyway)) {
    throw new Error("flyway-history.json does not contain a flyway array");
  }
  const assetImportAuthority = authoritySnapshot.assetImportAuthority as StagingSchemaSnapshot["assetImportAuthority"] | undefined;
  const grants = authoritySnapshot.grants as StagingSchemaSnapshot["grants"] | undefined;
  if (assetImportAuthority === undefined || grants === undefined) {
    throw new Error("schema-authority.json does not contain assetImportAuthority and grants");
  }

  return {
    database: String(flywaySnapshot.database ?? ""),
    flyway: flyway as StagingSchemaSnapshot["flyway"],
    assetImportAuthority,
    grants,
  };
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));

  if (args.snapshotDirectory === null) {
    printPlan();
    console.log("");
    console.log("DRY_RUN: no database connection was opened and no SQL was executed.");
    return;
  }

  const snapshot = buildSnapshot(args.snapshotDirectory);
  const assessment = evaluateStagingSchemaReadiness(snapshot);

  console.log("BLK-02 staging Cloud SQL readiness report (redacted)");
  console.log(`  database:     ${snapshot.database}`);
  console.log(`  flyway:       ${assessment.flywayStatus}`);
  console.log(`  requiresV000009: ${assessment.requiresV000009}`);
  for (const check of assessment.checks) {
    console.log(`  [${check.status}] ${check.id} (${check.detail})`);
  }
  console.log(`  ready: ${assessment.ready}`);

  if (args.plan) {
    const plan = buildStagingApplyPlan({
      instanceConnectionName: args.instanceConnectionName ?? "",
      assessment,
      poApprovalReference: args.poApprovalReference ?? "",
    });
    console.log("");
    console.log(`  plan.target:  V000${plan.targetVersion.padStart(6, "0")}`);
    for (const [index, step] of plan.steps.entries()) {
      console.log(`  plan.step.${index + 1}: ${step}`);
    }
    if (plan.blocked) {
      console.log(`  plan.blocked: ${plan.blockers.join(", ")}`);
      process.exitCode = 2;
      return;
    }
  }

  if (!assessment.ready) {
    console.log(`  blockers: ${assessment.blockers.join(", ")}`);
    process.exitCode = 1;
  }
}

main();
