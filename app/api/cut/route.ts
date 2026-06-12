import { NextResponse } from "next/server";
import { exec } from "child_process";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import os from "os";
import { readFile } from "fs/promises";


export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("video") as File;
  const isYoutube = formData.get("youtube") === "true";
  const start = formData.get("start") as string;
  const end = formData.get("end") as string;

  if ((!file && !isYoutube) || !start || !end) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  // 一時ファイルとして保存
  const tmpDir = os.tmpdir();

let inputPath = "";

if (isYoutube) {
  inputPath = path.resolve("./downloaded.mp4");
} else {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  inputPath = path.join(
    tmpDir,
    `input-${Date.now()}.mp4`
  );

  await writeFile(inputPath, buffer);
}

const outputPath = path.join(
  tmpDir,
  `output-${Date.now()}.mp4`
);

const cmd = `ffmpeg -i "${inputPath}" -ss ${start} -to ${end} -c:v libx264 -c:a aac "${outputPath}"`;


  await new Promise((resolve, reject) => {
    exec(cmd, (err) => {
      if (err) reject(err);
      else resolve(true);
    });
  });

  // 出力ファイルを返す
  const outputFile = await readFile(outputPath);


  // 一時ファイル削除
  await unlink(inputPath);
  await unlink(outputPath);

  return new Response(outputFile, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": "attachment; filename=cut.mp4",
    },
  });
}
