/**
 * BLK-02: read-only authority for the staging Cloud SQL migration decision.
 *
 * This module performs no I/O. It evaluates snapshots produced by the
 * read-only SQL in db/staging/preflight/ so that the decision to apply V000009
 * is reproducible, testable offline and cannot be satisfied by a production
 * database snapshot.
 */

export const STAGING_DATABASE_NAME = "easyslice_staging";
export const STAGING_IAM_USER = "easyslice-staging-sa@nexcut-staging.iam";
export const STAGING_INSTANCE_ID = "nexcut-staging-postgresql";
export const STAGING_REGION = "asia-northeast1";

export interface StagingMigrationManifestEntry {
  readonly version: string;
  readonly description: string;
  readonly file: string;
}

export const STAGING_MIGRATION_MANIFEST: readonly StagingMigrationManifestEntry[] = Object.freeze([
  { version: "1", description: "initialize slice a workflow schema", file: "V000001__initialize_slice_a_workflow_schema.sql" },
  { version: "2", description: "add workflow reconciliation schema", file: "V000002__add_workflow_reconciliation_schema.sql" },
  { version: "3", description: "align reconciliation store schema", file: "V000003__align_reconciliation_store_schema.sql" },
  { version: "4", description: "add multi cut replay postgresql foundation", file: "V000004__add_multi_cut_replay_postgresql_foundation.sql" },
  { version: "5", description: "add workflow completion state", file: "V000005__add_workflow_completion_state.sql" },
  { version: "6", description: "add durable media ownership", file: "V000006__add_durable_media_ownership.sql" },
  { version: "7", description: "add production workflow api csrf authority", file: "V000007__add_production_workflow_api_csrf_authority.sql" },
  { version: "8", description: "add asset import idempotency", file: "V000008__add_asset_import_idempotency.sql" },
  { version: "9", description: "expand asset import platform", file: "V000009__expand_asset_import_platform.sql" },
]);

export const STAGING_LATEST_VERSION = STAGING_MIGRATION_MANIFEST[STAGING_MIGRATION_MANIFEST.length - 1].version;

export interface FlywayHistoryRow {
  readonly installed_rank: number;
  readonly version: string | null;
  readonly description: string | null;
  readonly type: string;
  readonly success: boolean;
  readonly checksum: number | string | null;
}

export type StagingFlywayStatus = "CURRENT" | "PENDING_MIGRATION" | "BLOCKED";

export interface StagingFlywayAssessment {
  readonly status: StagingFlywayStatus;
  readonly appliedVersions: readonly string[];
  readonly pendingVersions: readonly string[];
  readonly requiresV000009: boolean;
  readonly blockers: readonly string[];
}

const manifestVersions = new Set(STAGING_MIGRATION_MANIFEST.map((entry) => entry.version));

export function evaluateStagingFlywayHistory(rows: readonly FlywayHistoryRow[]): StagingFlywayAssessment {
  const blockers: string[] = [];
  const ordered = [...rows].sort((left, right) => left.installed_rank - right.installed_rank);

  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].installed_rank === ordered[index - 1].installed_rank) {
      blockers.push(`duplicate-installed-rank:${ordered[index].installed_rank}`);
    }
  }

  const appliedVersions: string[] = [];
  const seenVersions = new Set<string>();

  for (const row of ordered) {
    if (row.type !== "SQL" && row.type !== "BASELINE") {
      blockers.push(`unsupported-history-type:${row.type}`);
      continue;
    }
    if (row.success !== true) {
      blockers.push(`failed-migration:${row.version ?? "unknown"}`);
    }
    if (row.version === null) {
      // A baseline row without a version carries no migration authority.
      continue;
    }
    if (!manifestVersions.has(row.version)) {
      blockers.push(`unknown-migration-version:${row.version}`);
      continue;
    }
    if (seenVersions.has(row.version)) {
      blockers.push(`duplicate-migration-version:${row.version}`);
      continue;
    }
    seenVersions.add(row.version);
    appliedVersions.push(row.version);
  }

  if (blockers.length > 0) {
    return {
      status: "BLOCKED",
      appliedVersions,
      pendingVersions: [],
      requiresV000009: false,
      blockers: Object.freeze(blockers),
    };
  }

  const expectedPrefix = STAGING_MIGRATION_MANIFEST.slice(0, appliedVersions.length).map((entry) => entry.version);
  if (expectedPrefix.join(",") !== appliedVersions.join(",")) {
    blockers.push("migration-order-diverges-from-approved-manifest");
    return {
      status: "BLOCKED",
      appliedVersions,
      pendingVersions: [],
      requiresV000009: false,
      blockers: Object.freeze(blockers),
    };
  }

  const pendingVersions = STAGING_MIGRATION_MANIFEST.slice(appliedVersions.length).map((entry) => entry.version);

  if (pendingVersions.length === 0) {
    return {
      status: "CURRENT",
      appliedVersions,
      pendingVersions: [],
      requiresV000009: false,
      blockers: Object.freeze([]),
    };
  }

  if (appliedVersions.length !== STAGING_MIGRATION_MANIFEST.length - 1) {
    blockers.push("staging-history-behind-approved-baseline-V000008");
    return {
      status: "BLOCKED",
      appliedVersions,
      pendingVersions,
      requiresV000009: false,
      blockers: Object.freeze(blockers),
    };
  }

  return {
    status: "PENDING_MIGRATION",
    appliedVersions,
    pendingVersions,
    requiresV000009: pendingVersions.length === 1 && pendingVersions[0] === "9",
    blockers: Object.freeze([]),
  };
}

export interface StagingAssetImportAuthoritySnapshot {
  readonly constraintPresent: boolean;
  readonly constraintDefinition: string | null;
  readonly platformColumnType: string | null;
  readonly commandVersionColumnType: string | null;
}

export interface StagingGrantSnapshot {
  readonly iamUser: string;
  readonly iamUserExists: boolean;
  readonly canSelectAssetImportRequests: boolean;
  readonly canInsertAssetImportRequests: boolean;
  readonly canUpdateAssetImportRequests: boolean;
  readonly canSelectJobs: boolean;
  readonly canSelectMedia: boolean;
}

export interface StagingSchemaSnapshot {
  readonly database: string;
  readonly flyway: readonly FlywayHistoryRow[];
  readonly assetImportAuthority: StagingAssetImportAuthoritySnapshot;
  readonly grants: StagingGrantSnapshot;
}

export type StagingCheckStatus = "PASS" | "FAIL";

export interface StagingReadinessCheck {
  readonly id: string;
  readonly status: StagingCheckStatus;
  readonly detail: string;
}

export interface StagingReadinessAssessment {
  readonly ready: boolean;
  readonly flywayStatus: StagingFlywayStatus;
  readonly requiresV000009: boolean;
  readonly checks: readonly StagingReadinessCheck[];
  readonly blockers: readonly string[];
}

const FORBIDDEN_PLATFORM_TOKENS = ["'bilibili'", "'instagram'", "'x'"];

export function evaluateStagingSchemaReadiness(snapshot: StagingSchemaSnapshot): StagingReadinessAssessment {
  const checks: StagingReadinessCheck[] = [];
  const blockers: string[] = [];
  const push = (id: string, passed: boolean, detail: string) => {
    checks.push({ id, status: passed ? "PASS" : "FAIL", detail });
    if (!passed) {
      blockers.push(id);
    }
  };

  push(
    "database-is-easyslice-staging",
    snapshot.database === STAGING_DATABASE_NAME,
    `database=${snapshot.database}`,
  );

  const flyway = evaluateStagingFlywayHistory(snapshot.flyway);
  push(
    "flyway-history-ordered-and-successful",
    flyway.blockers.length === 0,
    flyway.blockers.length === 0 ? `status=${flyway.status}` : flyway.blockers.join(", "),
  );
  push(
    "flyway-target-is-V000009",
    flyway.status === "CURRENT" || flyway.requiresV000009,
    `applied=${flyway.appliedVersions.join(".")} pending=${flyway.pendingVersions.join(".") || "none"}`,
  );

  const definition = snapshot.assetImportAuthority.constraintDefinition ?? "";
  const definitionHasTikTok = /'tiktok'/.test(definition);
  const definitionHasYouTube = /'youtube'/.test(definition);
  const definitionHasCommandVersion = /command_version/.test(definition);
  const definitionHasForbiddenPlatform = FORBIDDEN_PLATFORM_TOKENS.some((token) => definition.includes(token));
  push(
    "asset-import-authority-constraint-present",
    snapshot.assetImportAuthority.constraintPresent === true,
    snapshot.assetImportAuthority.constraintPresent ? "ck_asset_import_authority present" : "ck_asset_import_authority missing",
  );
  push(
    "asset-import-authority-accepts-tiktok",
    definitionHasTikTok && definitionHasYouTube && definitionHasCommandVersion && !definitionHasForbiddenPlatform,
    `tiktok=${definitionHasTikTok} youtube=${definitionHasYouTube} commandVersion=${definitionHasCommandVersion} forbidden=${definitionHasForbiddenPlatform}`,
  );
  push(
    "asset-import-platform-column-is-text",
    snapshot.assetImportAuthority.platformColumnType === "text",
    `platform=${snapshot.assetImportAuthority.platformColumnType ?? "missing"}`,
  );
  push(
    "asset-import-command-version-column-is-text",
    snapshot.assetImportAuthority.commandVersionColumnType === "text",
    `command_version=${snapshot.assetImportAuthority.commandVersionColumnType ?? "missing"}`,
  );

  push(
    "staging-database-iam-user-is-pinned",
    snapshot.grants.iamUser === STAGING_IAM_USER && snapshot.grants.iamUserExists === true,
    `iamUser=${snapshot.grants.iamUser} exists=${snapshot.grants.iamUserExists}`,
  );
  for (const grant of [
    "canSelectAssetImportRequests",
    "canInsertAssetImportRequests",
    "canUpdateAssetImportRequests",
    "canSelectJobs",
    "canSelectMedia",
  ] as const) {
    push(`grant-${grant}`, snapshot.grants[grant] === true, `${grant}=${snapshot.grants[grant]}`);
  }

  return {
    ready: blockers.length === 0,
    flywayStatus: flyway.status,
    requiresV000009: flyway.requiresV000009,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
  };
}

export interface StagingApplyPlan {
  readonly database: string;
  readonly instanceConnectionName: string;
  readonly targetVersion: string;
  readonly steps: readonly string[];
  readonly blocked: boolean;
  readonly blockers: readonly string[];
}

export function buildStagingApplyPlan(input: {
  readonly instanceConnectionName: string;
  readonly assessment: StagingReadinessAssessment;
  readonly poApprovalReference: string;
}): StagingApplyPlan {
  const steps: string[] = [
    "Confirm PO approval reference is recorded in the change ticket.",
    "Take an on-demand Cloud SQL backup and record its name.",
    `Verify Flyway history against db/staging/preflight (${input.assessment.flywayStatus}).`,
    `Run Flyway migrate -target=${STAGING_LATEST_VERSION} with a dedicated staging operator identity.`,
    "Re-run the read-only preflight and require ready=true.",
    "Run the staging smoke verification and record redacted evidence.",
  ];
  const blockers: string[] = [];
  const isStagingInstance = /^nexcut-staging:[a-z0-9-]+:nexcut-staging-postgresql$/.test(input.instanceConnectionName);
  if (!isStagingInstance) {
    blockers.push("instance-connection-name-is-not-the-approved-staging-instance");
  }
  if (input.instanceConnectionName.includes("nexcut-prod-jp-2026")) {
    blockers.push("production-instance-forbidden");
  }
  if (input.poApprovalReference.trim().length < 3) {
    blockers.push("po-approval-reference-required");
  }
  if (!input.assessment.ready && input.assessment.flywayStatus !== "PENDING_MIGRATION") {
    blockers.push("staging-preflight-not-ready");
  }
  if (input.assessment.flywayStatus === "BLOCKED") {
    blockers.push("staging-flyway-history-blocked");
  }
  return {
    database: STAGING_DATABASE_NAME,
    instanceConnectionName: input.instanceConnectionName,
    targetVersion: STAGING_LATEST_VERSION,
    steps: Object.freeze(steps),
    blocked: blockers.length > 0,
    blockers: Object.freeze(blockers),
  };
}
