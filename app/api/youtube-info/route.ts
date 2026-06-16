import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

export async function POST(req: Request) {
  const body = await req.json();
  const url = body.url;

  return new Promise<NextResponse>((resolve) => {
    const ytDlpPath = process.platform === "win32" 
      ? path.resolve('./yt-dlp.exe')
      : 'yt-dlp';

    exec(
      `"${ytDlpPath}" "${url}" --dump-json`,
      (error, stdout, stderr) => {
        if (error) {
          resolve(NextResponse.json({ success: false, error: stderr }, { status: 500 }));
          return;
        }
        try {
          const info = JSON.parse(stdout);
          resolve(NextResponse.json({
            success: true,
            title: info.title,
            duration: info.duration,
            thumbnail: info.thumbnail || (info.thumbnails?.length ? info.thumbnails[info.thumbnails.length - 1].url : null),
          }));
        } catch (e) {
          resolve(NextResponse.json({ success: false, error: String(e) }, { status: 500 }));
        }
      }
    );
  });
}