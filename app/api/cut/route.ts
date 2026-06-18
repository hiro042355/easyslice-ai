import { NextResponse } from "next/server";
import { exec } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import path from "path";
import os from "os";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("video") as File | null;
  const isYoutube = formData.get("youtube") === "true";
  const start = formData.get("start") as string;
  const end = formData.get("end") as string;

  if ((!file && !isYoutube) || !start || !end) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  const tmpDir = os.tmpdir();

  let inputPath = "";
  let shouldDeleteInput = false;

  if (isYoutube) {
  inputPath = path.join(tmpDir, "downloaded.mp4");
} else {
  if (!file) {
    return NextResponse.json(
      { error: "動画ファイルがありません" },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    inputPath = path.join(tmpDir, `input-${Date.now()}.mp4`);

    await writeFile(inputPath, buffer);
    shouldDeleteInput = true;
  }

  const outputPath = path.join(tmpDir, `output-${Date.now()}.mp4`);

  const cmd = `ffmpeg -i "${inputPath}" -ss ${start} -to ${end} -c:v libx264 -c:a aac "${outputPath}"`;

  try {
    await new Promise((resolve, reject) => {
      exec(cmd, (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });

    const outputFile = await readFile(outputPath);

    return new Response(outputFile, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": "attachment; filename=cut.mp4",
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to cut video" },
      { status: 500 }
    );
  } finally {
    if (shouldDeleteInput && inputPath) {
      await unlink(inputPath).catch(() => {});
    }

    await unlink(outputPath).catch(() => {});
  }
}