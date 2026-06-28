import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

const toSrtTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = 0;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
};

const transcriptToSrt = (text: string) => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line, index) => {
      const start = Math.max(0, index * 2 - 0.3);
const end = start + 2;

      return [
        String(index + 1),
        `${toSrtTime(start)} --> ${toSrtTime(end)}`,
        line,
      ].join("\n");
    })
    .join("\n\n");
};
const transcriptToDualSrt = (mainText: string, subText: string) => {
  const mainLines = mainText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const subLines = subText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const maxLength = Math.max(mainLines.length, subLines.length);

  return Array.from({ length: maxLength })
    .map((_, index) => {
      const start = Math.max(0, index * 2 - 0.3);
      const end = start + 2;
      const mainLine = mainLines[index] ?? "";
      const subLine = subLines[index] ?? "";

      return [
        String(index + 1),
        `${toSrtTime(start)} --> ${toSrtTime(end)}`,
        [mainLine, subLine].filter(Boolean).join("\n"),
      ].join("\n");
    })
    .join("\n\n");
};
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const transcript = String(body.transcript ?? "");
    const subTranscript = String(body.subTranscript ?? "");
const subtitleMode = String(body.subtitleMode ?? "single");
    const start = Math.max(0, Number(body.start ?? 0));
const end = Math.max(start + 1, Number(body.end ?? start + 30));
const duration = end - start;

    if (!transcript.trim()) {
      return NextResponse.json(
        { success: false, error: "字幕テキストがありません" },
        { status: 400 }
      );
    }

    const videoPath = path.join(os.tmpdir(), "downloaded.mp4");
    const srtPath = path.join(os.tmpdir(), "nexcut-subtitle.srt");
    const outputPath = path.join(os.tmpdir(), "burned-subtitle.mp4");

    if (!fs.existsSync(videoPath)) {
      return NextResponse.json(
        { success: false, error: "先に動画をアップロードしてください" },
        { status: 400 }
      );
    }

const srtText =
  subtitleMode === "dual" && subTranscript.trim()
    ? transcriptToDualSrt(transcript, subTranscript)
    : transcriptToSrt(transcript);

fs.writeFileSync(srtPath, srtText, "utf8");

const escapedSrtPath = srtPath
  .replace(/\\/g, "/")
  .replace(":", "\\:");

await execFileAsync("ffmpeg", [
  "-y",
  "-ss",
  String(start),
  "-t",
  String(duration),
  "-i",
  videoPath,
  "-vf",
  `subtitles='${escapedSrtPath}':force_style='Fontsize=28,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=80'`,
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
"18",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  outputPath,
]);

    return NextResponse.json({
      success: true,
      version: "burn-subtitle-v2",
      message: "字幕付き動画を作成しました",
      url: `/api/video?type=burned&t=${Date.now()}`,
    });
  } catch (err) {
    console.error(err);

    const message =
      err instanceof Error
        ? err.message
        : "字幕付き動画の作成に失敗しました";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}