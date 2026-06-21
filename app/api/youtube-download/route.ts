import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import os from "os";

export async function POST(req: Request) {
  const body = await req.json();
  const url = body.url;

  if (!url) {
    return NextResponse.json(
      { success: false, error: "YouTube URL がありません" },
      { status: 400 }
    );
  }

  return new Promise<NextResponse>((resolve) => {
    const ytDlpPath =
      process.platform === "win32"
        ? path.resolve("./yt-dlp.exe")
        : "yt-dlp";

    const outputPath = path.join(os.tmpdir(), "downloaded.mp4");

   exec(
  `"${ytDlpPath}" -f "137+140/136+140/18" --merge-output-format mp4 --force-overwrites -o "${outputPath}" "${url}"`,
  (error, stdout, stderr) => {
    if (error) {
      resolve(
        NextResponse.json(
          { success: false, error: stderr },
          { status: 500 }
        )
      );
      return;
    }

    resolve(
      NextResponse.json({
        success: true,
        file: outputPath,
       })
        );
      }
    );
  });
}