import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { access, readFile, unlink } from "fs/promises";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";

export const runtime = "nodejs";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  const body = await req.json();
  const clips = body.clips;
const outputFormat = body.outputFormat === "shorts" ? "shorts" : "original";
  if (!clips || clips.length === 0) {
    return NextResponse.json(
      { error: "クリップがありません" },
      { status: 400 }
    );
  }

  const inputPath = path.join(os.tmpdir(), "downloaded.mp4");

  try {
    await access(inputPath);
  } catch {
    return NextResponse.json(
      { success: false, error: "ダウンロード済み動画が見つかりません" },
      { status: 404 }
    );
  }

  const zip = new AdmZip();
  const outputPaths: string[] = [];

  try {
    let index = 1;

    for (const clip of clips) {
      const start = Number(clip.start);
      const end = Number(clip.end);

      if (isNaN(start) || isNaN(end) || end <= start) {
        return NextResponse.json(
          { error: "開始・終了時間が不正です" },
          { status: 400 }
        );
      }

      const outputPath = path.join(
        os.tmpdir(),
        `clip-${Date.now()}-${index}.mp4`
      );

      const duration = end - start;

const originalCmd = `ffmpeg -y -ss ${start} -i "${inputPath}" -t ${duration} -map 0:v:0 -map 0:a? -c copy -avoid_negative_ts make_zero -movflags +faststart "${outputPath}"`;

const shortsCmd = `ffmpeg -y -ss ${start} -i "${inputPath}" -t ${duration} -vf "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':(iw-min(iw,ih*9/16))/2:(ih-min(ih,iw*16/9))/2,scale=1080:1920" -map 0:v:0 -map 0:a? -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${outputPath}"`;

const cmd = outputFormat === "shorts" ? shortsCmd : originalCmd;

      console.log("生成開始", outputPath);
      await execAsync(cmd);
      console.log("生成完了", outputPath);

      const fileBuffer = await readFile(outputPath);

      const safeTitle =
        typeof clip.title === "string" && clip.title.trim() !== ""
          ? clip.title.replace(/[\\/:*?"<>|]/g, "_")
          : `clip${index}`;

      const formatLabel = outputFormat === "shorts" ? "shorts-9x16" : "original";

zip.addFile(
  `clip${index}_${formatLabel}_${safeTitle}_${start}-${end}.mp4`,
  fileBuffer
);

      outputPaths.push(outputPath);
      index++;
    }

    const zipBuffer = zip.toBuffer();

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=clips.zip",
      },
    });
  } finally {
    for (const outputPath of outputPaths) {
      await unlink(outputPath).catch(() => {});
    }
  }
}