import type { DurableWorkflowDatabaseCapability, DurableWorkflowDatabaseExecutionResult, DurableWorkflowDatabaseRow } from "../durableTransaction";
import type { PostgreSQLProtectedDigest, PostgreSQLProtectedDigestFactory, PostgreSQLSliceAStatement } from "./types";

export function createPostgreSQLProtectedDigestFactory(key: Uint8Array, domain: string, protect: (key: Uint8Array, domain: string, value: Uint8Array) => Uint8Array): PostgreSQLProtectedDigestFactory {
  const ownedKey = Uint8Array.from(key);
  if (ownedKey.byteLength < 32 || !/^[a-z][a-z0-9.-]{0,127}$/.test(domain)) throw new TypeError("invalid-protection-policy");
  return Object.freeze({
    factoryVersion: "1.0",
    create(value: Uint8Array) {
      const digest = protect(Uint8Array.from(ownedKey), domain, Uint8Array.from(value));
      if (!(digest instanceof Uint8Array) || digest.byteLength !== 32) return undefined;
      return Object.freeze({ algorithm: "sha256", version: 1, bytes: Uint8Array.from(digest) });
    },
  });
}

export function validDigest(value: PostgreSQLProtectedDigest): boolean {
  return value.algorithm === "sha256" && value.version === 1 && value.bytes.byteLength === 32;
}

export function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

export function statementMap(statements: readonly PostgreSQLSliceAStatement[]): ReadonlyMap<string, string> {
  return new Map(statements.map((statement) => [statement.statementId, statement.sql]));
}

export async function execute(database: DurableWorkflowDatabaseCapability, statementId: string, parameters: readonly (null | string | boolean | number | Uint8Array)[], expectedResult: "none" | "single" | "many"): Promise<DurableWorkflowDatabaseExecutionResult> {
  return database.execute(Object.freeze({ commandVersion: "1.0", statementId, parameters: Object.freeze(parameters.map((value) => value instanceof Uint8Array ? Uint8Array.from(value) : value)), expectedResult }));
}

export function stringField(row: DurableWorkflowDatabaseRow, name: string): string | undefined {
  const value = row[name];
  return typeof value === "string" ? value : undefined;
}

export function bytesField(row: DurableWorkflowDatabaseRow, name: string): Uint8Array | undefined {
  const value = row[name];
  return value instanceof Uint8Array ? Uint8Array.from(value) : undefined;
}

export function immutableJsonObject<T extends Record<string, unknown>>(value: T): Readonly<T> {
  const copy = (input: unknown): unknown => {
    if (Array.isArray(input)) return Object.freeze(input.map(copy));
    if (typeof input === "object" && input !== null) return Object.freeze(Object.fromEntries(Object.entries(input).map(([key, nested]) => [key, copy(nested)])));
    return input;
  };
  return copy(value) as Readonly<T>;
}
