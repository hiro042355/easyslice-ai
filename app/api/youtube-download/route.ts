import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";

export async function POST(req: Request) {
  const body = await req.json();
  const url = body.url;

  return new Promise<NextResponse>((resolve) => {
    const ytDlpPath = process.platform === "win32"
      ? path.resolve('./yt-dlp.exe')
      : 'yt-dlp';

    const outputPath = path.join(os.tmpdir(), 'downloaded.mp4');
    
    // cookiesファイルを環境変数から生成
    const cookiesPath = path.join(os.tmpdir(), 'cookies.txt');
  if (process.env.YOUTUBE_COOKIES) {
  fs.writeFileSync(cookiesPath, process.env.YOUTUBE_COOKIES);
}

    const cookiesArg = fs.existsSync(cookiesPath) ? `--cookies "${cookiesPath}"` : '';

    exec(
      `"${ytDlpPath}" --extractor-args "youtube:player_client=android" ${cookiesArg} -f "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]/best" --merge-output-format mp4 --force-overwrites -o "${outputPath}" "${url}"`,
      (error, stdout, stderr) => {
        if (error) {
          resolve(NextResponse.json({ success: false, error: stderr }, { status: 500 }));
          return;
        }
        resolve(NextResponse.json({ success: true, file: outputPath }));
      }
    );
  });
}