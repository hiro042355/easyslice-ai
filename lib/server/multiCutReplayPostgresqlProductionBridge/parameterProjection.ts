import type { MultiCutReplayPostgresqlPureExecutionParameter } from "../multiCutReplayPostgresqlAdapter";
import {
  isCanonicalUtcTimestamp,
  isCanonicalUuid,
} from "../productionWorkflowRuntime/postgresqlDriver";
import type { PostgreSQLParameter } from "../productionWorkflowRuntime/postgresqlDriver";

const INT4_MIN = -2_147_483_648;
const INT4_MAX = 2_147_483_647;
const INT8_MIN = -9_223_372_036_854_775_808n;
const INT8_MAX = 9_223_372_036_854_775_807n;
const CANONICAL_DECIMAL = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/;

const invalid = (): never => {
  throw Object.freeze({
    errorVersion: "1.0",
    kind: "query-rejected",
    safeReason: "invalid-postgresql-parameter",
    retryable: false,
    commitUnknown: false,
    originalCauseRetained: false,
    reconciliationRequired: false,
  });
};

export const projectMultiCutReplayPostgresqlParameter = (
  parameter: MultiCutReplayPostgresqlPureExecutionParameter,
): PostgreSQLParameter => {
  const value = parameter.value;
  switch (parameter.postgresqlCast) {
    case "uuid":
      if (typeof value !== "string" || !isCanonicalUuid(value)) return invalid();
      return Object.freeze({ kind: "uuid", value });
    case "text":
      if (typeof value !== "string") return invalid();
      return Object.freeze({ kind: "string", value });
    case "integer":
      if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < INT4_MIN ||
        value > INT4_MAX
      ) {
        return invalid();
      }
      return Object.freeze({ kind: "safe-integer", value });
    case "bigint":
      if (typeof value !== "string" || !CANONICAL_DECIMAL.test(value)) {
        return invalid();
      }
      try {
        const parsed = BigInt(value);
        if (parsed < INT8_MIN || parsed > INT8_MAX) return invalid();
      } catch {
        return invalid();
      }
      return Object.freeze({ kind: "bigint", value });
    case "timestamptz":
      if (typeof value !== "string" || !isCanonicalUtcTimestamp(value)) {
        return invalid();
      }
      return Object.freeze({ kind: "utc-timestamp", value });
  }
};
