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

    // cookiesファイルを環境変数から生成
    const cookiesPath = path.join(os.tmpdir(), 'cookies.txt');
  if (process.env.YOUTUBE_COOKIES) {
  fs.writeFileSync(cookiesPath, process.env.YOUTUBE_COOKIES);
}

    const cookiesArg = fs.existsSync(cookiesPath) ? `--cookies "${cookiesPath}"` : '';

    exec(
      `"${ytDlpPath}" --extractor-args "youtube:player_client=android" ${cookiesArg} "${url}" --dump-json`,
      (error, stdout, stderr) => {
        if (error) {
          resolve(NextResponse.json({ success: false, error: stderr }, { status: 500 }));
          return;
        }
        try {
          const info = JSON.parse(stdout);
          resolve(NextResponse.json({
            success: true,
            sourceId: typeof info.id === "string" ? info.id : undefined,
            title: info.title,
            description: typeof info.description === "string" ? info.description : undefined,
            duration: info.duration,
            chapters: Array.isArray(info.chapters)
              ? info.chapters.flatMap((chapter: unknown) => {
                  if (!chapter || typeof chapter !== "object") return [];
                  const value = chapter as Record<string, unknown>;
                  return typeof value.title === "string" && Number.isFinite(value.start_time)
                    ? [{ title: value.title, startSeconds: Number(value.start_time), ...(Number.isFinite(value.end_time) ? { endSeconds: Number(value.end_time) } : {}) }]
                    : [];
                })
              : undefined,
            thumbnail: info.thumbnail || (info.thumbnails?.length ? info.thumbnails[info.thumbnails.length - 1].url : null),
          }));
        } catch (e) {
          resolve(NextResponse.json({ success: false, error: String(e) }, { status: 500 }));
        }
      }
    );
  });
}
