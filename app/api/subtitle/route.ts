import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { mkdir, readdir, readFile, rm } from "fs/promises";

export async function POST(req: Request) {
  const body = await req.json();
  const url = body.url;

  if (!url) {
    return NextResponse.json(
      { success: false, error: "URLがありません" },
      { status: 400 }
    );
  }

  return new Promise<NextResponse>(async (resolve) => {
    const ytDlpPath =
      process.platform === "win32"
        ? path.resolve("./yt-dlp.exe")
        : "yt-dlp";

    const subtitleDir = path.join(os.tmpdir(), `subtitle-${Date.now()}`);
    const outputBase = path.join(subtitleDir, "subtitle");

    await mkdir(subtitleDir, { recursive: true });

    const cookiesPath = path.join(os.tmpdir(), "cookies.txt");

    if (process.env.YOUTUBE_COOKIES) {
      fs.writeFileSync(cookiesPath, process.env.YOUTUBE_COOKIES);
    }

    const cookiesArg = fs.existsSync(cookiesPath)
      ? `--cookies "${cookiesPath}"`
      : "";

const cmd = `"${ytDlpPath}" ${cookiesArg} --write-auto-subs --write-subs --sub-langs "ja,en" --skip-download --sub-format json3 -o "${outputBase}" "${url}"`;

    console.log("subtitle exec:", cmd);

    exec(cmd, async (error, stdout, stderr) => {
      console.log("subtitle error:", error);
      console.log("subtitle stderr:", stderr);

      if (error) {
        await rm(subtitleDir, { recursive: true, force: true });
        resolve(
          NextResponse.json(
            { success: false, error: stderr || "字幕取得に失敗しました" },
            { status: 500 }
          )
        );
        return;
      }

      try {
        const files = (await readdir(subtitleDir)).filter((file) =>
          file.endsWith(".json3")
        );

        console.log("subtitle files:", files);

        if (files.length === 0) {
          await rm(subtitleDir, { recursive: true, force: true });
          resolve(
            NextResponse.json({
              success: false,
              error: "字幕ファイルが見つかりません",
            })
          );
          return;
        }

        const preferredFile =
          files.find((file) => file.includes(".ja.")) ??
          files.find((file) => file.includes(".en.")) ??
          files[0];

        const subtitlePath = path.join(subtitleDir, preferredFile);
        const subtitleData = JSON.parse(await readFile(subtitlePath, "utf-8"));

        const subtitles =
          subtitleData.events
            ?.filter((event: any) => event.segs && event.segs.length > 0)
            .map((event: any) => ({
              second: Math.floor(event.tStartMs / 1000),
              text: event.segs
                .map((seg: any) => seg.utf8)
                .join("")
                .replace(/\n/g, " ")
                .trim(),
            }))
            .filter((item: any) => item.text !== "") || [];

        const keywords: Record<string, number> = {
          衝撃: 5,
          やばい: 4,
          驚き: 4,
          重要: 3,
          結論: 3,
          知らない: 2,
          稼げる: 2,
          危険: 2,
          never: 5,
          amazing: 4,
          incredible: 4,
          important: 3,
          secret: 3,
        };

        const highlights = subtitles
          .map((subtitle: any) => {
            let score = 0;

            Object.entries(keywords).forEach(([word, value]) => {
              if (subtitle.text.toLowerCase().includes(word.toLowerCase())) {
                score += value;
              }
            });

            return { ...subtitle, score };
          })
          .filter((item: any) => item.score > 0)
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 5);

        const fullText = subtitles.map((s: any) => s.text).join(" ");
        const summary = fullText.slice(0, 500);

        await rm(subtitleDir, { recursive: true, force: true });

        resolve(
          NextResponse.json({
            success: true,
            subtitles,
            highlights,
            fullText,
            summary,
            subtitleFile: preferredFile,
          })
        );
      } catch (e) {
        await rm(subtitleDir, { recursive: true, force: true });

        resolve(
          NextResponse.json(
            { success: false, error: String(e) },
            { status: 500 }
          )
        );
      }
    });
  });
}