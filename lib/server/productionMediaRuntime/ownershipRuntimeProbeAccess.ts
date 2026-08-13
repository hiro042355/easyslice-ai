import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

export const isOwnershipRuntimeProbeAuthorized = (
  supplied: string | null,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean => {
  const expected = environment.OWNERSHIP_RUNTIME_PROBE_SECRET;
  if (environment.VERCEL_ENV !== "production" || !expected || expected.length < 32 || !supplied) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
};
