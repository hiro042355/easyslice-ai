import { NextResponse } from "next/server";

const RETIRED_RESPONSE = Object.freeze({ error: "legacy-youtube-route-retired" });

export async function POST() {
  return NextResponse.json(RETIRED_RESPONSE, { status: 410 });
}
