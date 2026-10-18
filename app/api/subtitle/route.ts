import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { parseJson3Subtitles, subtitleSourceUrl } from "@/lib/server/subtitleSafety";
import path from "path";
import os from "os";
import fs from "fs";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import { CLIP_FINAL_SELECTION_POLICY_V1 } from "@/lib/clipCandidates";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";

export async function POST(req: Request) {
  const authentication = await requireAuthenticatedRequest(req);
  if (!authentication.ok) return authentication.response;
  const body = await req.json();
  const url = subtitleSourceUrl(body?.url);

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

    const subtitleDir = await mkdtemp(path.join(os.tmpdir(), "subtitle-"));
    const outputBase = path.join(subtitleDir, "subtitle");

    const cookiesPath = path.join(subtitleDir, "cookies.txt");

    if (process.env.YOUTUBE_COOKIES) {
      fs.writeFileSync(cookiesPath, process.env.YOUTUBE_COOKIES);
    }

    const args = [...(fs.existsSync(cookiesPath) ? ["--cookies", cookiesPath] : []), "--write-auto-subs", "--write-subs", "--sub-langs", "ja,en", "--skip-download", "--sub-format", "json3", "-o", outputBase, "--", url];
    execFile(ytDlpPath, args, {timeout:120000,maxBuffer:1024*1024,windowsHide:true}, async (error) => {

      if (error) {
        await rm(subtitleDir, { recursive: true, force: true });
        resolve(
          NextResponse.json(
            { success: false, error: "字幕取得に失敗しました" },
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

        const subtitles = parseJson3Subtitles(subtitleData);

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
          .map((subtitle) => {
            let score = 0;

            Object.entries(keywords).forEach(([word, value]) => {
              if (subtitle.text.toLowerCase().includes(word.toLowerCase())) {
                score += value;
              }
            });

            return { ...subtitle, score };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, CLIP_FINAL_SELECTION_POLICY_V1.candidatePoolLimit);

        const fullText = subtitles.map((s) => s.text).join(" ");
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
            { success: false, error: "字幕データを処理できませんでした" },
            { status: 500 }
          )
        );
      }
    });
  });
}
