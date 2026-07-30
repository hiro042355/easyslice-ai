import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "lib", "server");
const observability = join(root, "multiCutReplayPostgresqlObservability");

test("observability is a closed type-only boundary without infrastructure SDKs", () => {
  const sources = ["types.ts", "port.ts", "noOp.ts", "index.ts"]
    .map((file) => readFileSync(join(observability, file), "utf8"))
    .join("\n");
  for (const forbidden of [
    "console.",
    "from \"pg\"",
    "from \"pino\"",
    "from \"winston\"",
    "opentelemetry",
    "Record<string, unknown>",
    "sql:",
    "bindings:",
    "rows:",
    "rawError",
    "connectionString",
  ]) {
    assert.equal(sources.includes(forbidden), false, forbidden);
  }
});

test("pure adapter and SQL definitions have no observability dependency", () => {
  for (const directory of [
    "multiCutReplayPostgresqlAdapter",
    "multiCutReplayPostgresqlSqlDefinitions",
  ]) {
    const files = ["index.ts", "types.ts", "pureAdapter.ts", "pureTypes.ts",
      "definitionsV2.ts"].filter((file) => {
        try {
          readFileSync(join(root, directory, file), "utf8");
          return true;
        } catch {
          return false;
        }
      });
    for (const file of files) {
      assert.equal(
        readFileSync(join(root, directory, file), "utf8")
          .includes("multiCutReplayPostgresqlObservability"),
        false,
      );
    }
  }
});
