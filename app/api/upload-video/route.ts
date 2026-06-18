import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import os from "os";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "動画ファイルがありません" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const outputPath = path.join(os.tmpdir(), "downloaded.mp4");

    await writeFile(outputPath, buffer);

    return NextResponse.json({
      success: true,
      file: outputPath,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "動画アップロードに失敗しました" },
      { status: 500 }
    );
  }
}