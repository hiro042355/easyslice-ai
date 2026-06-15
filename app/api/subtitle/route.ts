import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

export async function POST(req: Request) {
  const body = await req.json();
  const url = body.url;

  return new Promise((resolve) => {
    const ytDlpPath = path.resolve('./yt-dlp.exe');

    // 古い字幕ファイルを削除
const oldFiles = fs.readdirSync('.').filter((f: string) => f.startsWith('subtitle') && f.endsWith('.json3'));
oldFiles.forEach((f: string) => {
  try {
    fs.unlinkSync(f);
  } catch (e) {
    // ロック中は無視
  }
});

    console.log("exec開始:", ytDlpPath);
exec(
  `"${ytDlpPath}" --write-auto-sub --sub-lang en --skip-download --sub-format json3 -o "subtitle" "${url}"`,
  async (error, stdout, stderr) => {
        console.log("error:", error);
        console.log("stderr:", stderr);
        if (error) {
          resolve(NextResponse.json({ success: false, error: stderr }));
          return;
        }

        try {
          const files = fs.readdirSync('.').filter((f: string) => f.startsWith('subtitle') && f.endsWith('.json3'));
console.log("files:", files);

if (files.length === 0) {
            resolve(NextResponse.json({ success: false, error: "字幕ファイルが見つかりません" }));
            return;
          }

          const subtitleData = JSON.parse(fs.readFileSync(files[0], 'utf-8'));

          const subtitles =
            subtitleData.events
              ?.filter((event: any) => event.segs && event.segs.length > 0)
              .map((event: any) => ({
                second: Math.floor(event.tStartMs / 1000),
                text: event.segs.map((seg: any) => seg.utf8).join(""),
              })) || [];

          const keywords: Record<string, number> = {
            "衝撃": 5,
            "やばい": 4,
            "驚き": 4,
            "重要": 3,
            "結論": 3,
            "知らない": 2,
            "稼げる": 2,
            "危険": 2,
            "never": 5,
            "amazing": 4,
            "incredible": 4,
            "important": 3,
            "secret": 3,
          };

          const highlights = subtitles
            .map((subtitle: any) => {
              let score = 0;
              Object.entries(keywords).forEach(([word, value]) => {
                if (subtitle.text.toLowerCase().includes(word.toLowerCase())) {
                  score += value as number;
                }
              });
              return { ...subtitle, score };
            })
            .filter((item: any) => item.score > 0)
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, 5);

          const fullText = subtitles
            .map((s: any) => s.text)
            .join(" ");

          const summary = fullText.slice(0, 500);

          console.log(summary);

          resolve(NextResponse.json({ success: true, highlights, summary, fullText, subtitles }));
        } catch (e) {
          resolve(NextResponse.json({ success: false, error: String(e) }));
        }
      }
    );
  });
}