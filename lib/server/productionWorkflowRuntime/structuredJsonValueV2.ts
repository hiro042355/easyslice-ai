export type ProductionStructuredJsonValueV2 =
  | null
  | string
  | number
  | boolean
  | readonly ProductionStructuredJsonValueV2[]
  | Readonly<{ [key: string]: ProductionStructuredJsonValueV2 }>;

export type ProductionStructuredJsonProjectionFailureReasonV2 =
  | "unsupported-value"
  | "non-finite-number"
  | "cyclic-value";

export type ProductionStructuredJsonProjectionResultV2 =
  | Readonly<{ status: "success"; value: ProductionStructuredJsonValueV2 }>
  | Readonly<{ status: "failure"; reason: ProductionStructuredJsonProjectionFailureReasonV2 }>;

const failed = (reason: ProductionStructuredJsonProjectionFailureReasonV2): ProductionStructuredJsonProjectionResultV2 =>
  Object.freeze({ status: "failure", reason });

function copyValue(value: unknown, ancestors: Set<object>): ProductionStructuredJsonProjectionResultV2 {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return Object.freeze({ status: "success", value });
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? Object.freeze({ status: "success", value })
      : failed("non-finite-number");
  }
  if (typeof value !== "object" || value instanceof Uint8Array || value instanceof Date) {
    return failed("unsupported-value");
  }
  if (ancestors.has(value)) return failed("cyclic-value");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const output: ProductionStructuredJsonValueV2[] = [];
      for (const entry of value) {
        const projected = copyValue(entry, ancestors);
        if (projected.status === "failure") return projected;
        output.push(projected.value);
      }
      return Object.freeze({ status: "success", value: Object.freeze(output) });
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return failed("unsupported-value");
    if (Object.getOwnPropertySymbols(value).length !== 0) return failed("unsupported-value");
    const output: Record<string, ProductionStructuredJsonValueV2> = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.get || descriptor.set) return failed("unsupported-value");
      const projected = copyValue(descriptor.value, ancestors);
      if (projected.status === "failure") return projected;
      output[key] = projected.value;
    }
    return Object.freeze({ status: "success", value: Object.freeze(output) });
  } finally {
    ancestors.delete(value);
  }
}

export function projectProductionStructuredJsonValueV2(value: unknown): ProductionStructuredJsonProjectionResultV2 {
  return copyValue(value, new Set());
}
