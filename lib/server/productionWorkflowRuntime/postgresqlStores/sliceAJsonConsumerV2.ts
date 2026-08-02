export type SliceAJsonValueV2 =
  | null
  | string
  | number
  | boolean
  | readonly SliceAJsonValueV2[]
  | Readonly<{ [key: string]: SliceAJsonValueV2 }>;

export type SliceADatabaseValueV2 = SliceAJsonValueV2 | Uint8Array;
export type SliceADatabaseRowV2 = Readonly<Record<string, SliceADatabaseValueV2>>;

export type SliceAJsonValidationFailureV2 = Readonly<{
  resultVersion: "2.0";
  status: "failure";
  kind: "row-validation-failure";
  safeReason: "invalid-structured-json" | "invalid-row";
  retryable: false;
  ownerAction: "do-not-commit";
}>;

export type SliceAJsonProjectionResultV2 =
  | Readonly<{ status: "success"; value: Readonly<Record<string, SliceAJsonValueV2>> }>
  | SliceAJsonValidationFailureV2;

const failure = (safeReason: SliceAJsonValidationFailureV2["safeReason"]): SliceAJsonValidationFailureV2 =>
  Object.freeze({
    resultVersion: "2.0",
    status: "failure",
    kind: "row-validation-failure",
    safeReason,
    retryable: false,
    ownerAction: "do-not-commit",
  });

function copyJson(value: unknown, ancestors: Set<object>): SliceAJsonValueV2 | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "object" || value instanceof Uint8Array || value instanceof Date) return undefined;
  if (ancestors.has(value)) return undefined;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: SliceAJsonValueV2[] = [];
      for (const entry of value) {
        const copied = copyJson(entry, ancestors);
        if (copied === undefined) return undefined;
        result.push(copied);
      }
      return Object.freeze(result);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    if (Object.getOwnPropertySymbols(value).length !== 0) return undefined;
    const result: Record<string, SliceAJsonValueV2> = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.get || descriptor.set) return undefined;
      const copied = copyJson(descriptor.value, ancestors);
      if (copied === undefined) return undefined;
      result[key] = copied;
    }
    return Object.freeze(result);
  } finally {
    ancestors.delete(value);
  }
}

export function projectSliceAJsonObjectV2(value: unknown): SliceAJsonProjectionResultV2 {
  const copied = copyJson(value, new Set());
  if (copied === undefined || copied === null || Array.isArray(copied) || typeof copied !== "object") {
    return failure("invalid-structured-json");
  }
  return Object.freeze({
    status: "success",
    value: copied as Readonly<Record<string, SliceAJsonValueV2>>,
  });
}

export function createSliceAInvalidRowFailureV2(): SliceAJsonValidationFailureV2 {
  return failure("invalid-row");
}
