import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();

  const duration = Number(body.duration);

  const clips = [];

  for (let i = 1; i <= 3; i++) {
    const center = (duration / 4) * i;

    const start = Math.max(
      0,
      Math.floor(center - 10)
    );

    const end = Math.min(
      duration,
      Math.floor(center + 10)
    );

    clips.push({
      start: String(start),
      end: String(end),
      reason: `AI候補 ${i}`,
    });
  }

  return NextResponse.json({
    success: true,
    clips,
  });
}