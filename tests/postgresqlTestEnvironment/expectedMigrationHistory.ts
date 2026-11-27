/**
 * The ordered Flyway chain applied by `db/workflow/migrations`.
 *
 * Publication support extends the reconciliation/Slice A chain rather than replacing it, so
 * these tests assert the complete, ordered history instead of only their own slice.
 */
export const EXPECTED_SQL_MIGRATION_HISTORY = Object.freeze([
  "000001", "000002", "000003", "000004", "000005", "000006", "000007", "000008",
  "000026", "000027", "000028", "000029", "000035", "000036",
].map(version => Object.freeze({ version, success: true })));

export const EXPECTED_SQL_MIGRATION_VERSIONS: readonly string[] =
  Object.freeze(EXPECTED_SQL_MIGRATION_HISTORY.map(({ version }) => version));
