import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, unlink } from "fs/promises";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";

export const runtime = "nodejs";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  const body = await req.json();
  const clips = body.clips;

  if (!clips || clips.length === 0) {
    return NextResponse.json(
      { error: "クリップがありません" },
      { status: 400 }
    );
  }

  const inputPath = path.resolve('./downloaded.mp4');

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

      const cmd = `ffmpeg -y -ss ${start} -to ${end} -i "${inputPath}" -c:v copy -c:a aac "${outputPath}"`;

      console.log("生成開始", outputPath);
      await execAsync(cmd);
      console.log("生成完了", outputPath);

      const fileBuffer = await readFile(outputPath);

      zip.addFile(
        `clip${index}_${start}-${end}.mp4`,
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