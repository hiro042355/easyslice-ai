import { NextResponse } from "next/server";
import { exec } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import path from "path";
import os from "os";
import type { AiHookConfig, HookPreview } from "../../../lib/aiHook";

function parseJsonField<T>(value: FormDataEntryValue | null): T | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toConcatPath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("video") as File | null;
  const isYoutube = formData.get("youtube") === "true";
  const start = formData.get("start") as string;
  const end = formData.get("end") as string;
  const creatorStyleConfigRaw = formData.get("creatorStyleConfig");
  const aiHookConfig = parseJsonField<AiHookConfig>(formData.get("aiHookConfig"));
  const hookPreview = parseJsonField<HookPreview>(formData.get("hookPreview"));

  if (typeof creatorStyleConfigRaw === "string" && creatorStyleConfigRaw.trim()) {
    try {
      console.log("CreatorStyleConfig received /api/cut", JSON.parse(creatorStyleConfigRaw));
    } catch {
      console.log("CreatorStyleConfig received /api/cut", creatorStyleConfigRaw);
    }
  }
  if (aiHookConfig?.enabled && hookPreview) {
    console.log("AIHookConfig received /api/cut", aiHookConfig, hookPreview);
  }

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

  const timestamp = Date.now();
  const outputPath = path.join(tmpDir, `output-${timestamp}.mp4`);
  const hookClipPath = path.join(tmpDir, `hook-${timestamp}.mp4`);
  const mainClipPath = path.join(tmpDir, `main-${timestamp}.mp4`);
  const concatListPath = path.join(tmpDir, `concat-${timestamp}.txt`);

  const shouldRenderAiHook =
    aiHookConfig?.enabled === true &&
    hookPreview !== null &&
    Number.isFinite(hookPreview.start) &&
    Number.isFinite(hookPreview.end) &&
    hookPreview.end > hookPreview.start;

  const cmd = `ffmpeg -i "${inputPath}" -ss ${start} -to ${end} -c:v libx264 -c:a aac "${outputPath}"`;

  try {
    if (shouldRenderAiHook) {
      const hookDuration = hookPreview.end - hookPreview.start;
      const fadeStart = Math.max(hookDuration - 0.2, 0).toFixed(2);
      const hookCmd = `ffmpeg -y -ss ${hookPreview.start} -to ${hookPreview.end} -i "${inputPath}" -vf "fade=t=out:st=${fadeStart}:d=0.2" -c:v libx264 -c:a aac "${hookClipPath}"`;
      const mainCmd = `ffmpeg -y -ss ${start} -to ${end} -i "${inputPath}" -c:v libx264 -c:a aac "${mainClipPath}"`;

      await new Promise((resolve, reject) => {
        exec(hookCmd, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      await new Promise((resolve, reject) => {
        exec(mainCmd, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      await writeFile(
        concatListPath,
        `file '${toConcatPath(hookClipPath)}'\nfile '${toConcatPath(mainClipPath)}'\n`
      );

      const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`;

      await new Promise((resolve, reject) => {
        exec(concatCmd, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });
    } else {
      await new Promise((resolve, reject) => {
        exec(cmd, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });
    }

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
    await unlink(hookClipPath).catch(() => {});
    await unlink(mainClipPath).catch(() => {});
    await unlink(concatListPath).catch(() => {});
  }
}
