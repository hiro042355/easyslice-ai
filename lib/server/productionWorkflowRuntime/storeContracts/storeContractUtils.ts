import type { DurableDatabaseClock } from "./types";
import type { WorkflowProtectedIdentity } from "../types";

export function createDurableDatabaseClock(initialUtc: string): DurableDatabaseClock {
  let milliseconds = parseUtc(initialUtc);
  let frozen = false;
  return Object.freeze({
    clockVersion: "1.0" as const,
    read: () => formatUtc(milliseconds),
    advance(value: number) {
      if (frozen) return "frozen";
      if (!Number.isSafeInteger(value) || value < 0) return "invalid";
      milliseconds += value;
      return "advanced";
    },
    freeze() {
      frozen = true;
      return "frozen";
    },
  });
}

function parseUtc(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value);
  if (match === null) throw new Error("invalid-clock-fixture");
  const [, year, month, day, hour, minute, second, millisecond] = match;
  return ((((Number(year) * 13 + Number(month)) * 32 + Number(day)) * 24 + Number(hour)) * 60 + Number(minute)) * 60_000 + Number(second) * 1_000 + Number(millisecond);
}

function formatUtc(value: number): string {
  const millisecond = value % 1_000;
  let remaining = Math.floor(value / 1_000);
  const second = remaining % 60;
  remaining = Math.floor(remaining / 60);
  const minute = remaining % 60;
  remaining = Math.floor(remaining / 60);
  const hour = remaining % 24;
  remaining = Math.floor(remaining / 24);
  const day = remaining % 32;
  remaining = Math.floor(remaining / 32);
  const month = remaining % 13;
  const year = Math.floor(remaining / 13);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(millisecond).padStart(3, "0")}Z`;
}

export function protectedIdentity(namespace: string, value: string): WorkflowProtectedIdentity {
  return Object.freeze({ identityVersion: "1.0", namespace, protectedValue: value });
}

export function identityKey(identity: WorkflowProtectedIdentity): string {
  return `${identity.namespace}:${identity.protectedValue}`;
}
