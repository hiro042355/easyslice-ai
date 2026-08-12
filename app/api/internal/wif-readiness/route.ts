import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createProductionWifReadinessOperations,
  executeWifReadiness,
} from "@/lib/server/productionIdentity/wifReadiness";

export const runtime = "nodejs";

const isAuthorized = (request: Request): boolean => {
  const expected = process.env.WIF_READINESS_PROBE_SECRET;
  const presented = request.headers.get("x-nexcut-wif-readiness-key");
  if (!expected || !presented) return false;
  const expectedBytes = Buffer.from(expected);
  const presentedBytes = Buffer.from(presented);
  return expectedBytes.length === presentedBytes.length
    && timingSafeEqual(expectedBytes, presentedBytes);
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ status: "not-found" }, { status: 404 });
  }
  const result = await executeWifReadiness(createProductionWifReadinessOperations());
  return NextResponse.json(result, {
    status: result.status === "ready" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
