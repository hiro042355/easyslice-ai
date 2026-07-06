import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

type CreatorStyleConfig = {
  style?: string;
  enabled?: boolean;
  intensity?: number;
  subtitleAnimation?: string;
  subtitleScale?: number;
  subtitleSpeed?: number;
};

type SubtitleLine = {
  start: number;
  end: number;
  text: string;
};

const clampIntensity = (value: unknown) => {
  const intensity = Number(value ?? 3);

  if (!Number.isFinite(intensity)) return 3;

  return Math.min(5, Math.max(1, Math.round(intensity)));
};

const getCreatorSubtitleRenderConfig = (config: unknown) => {
  const creatorStyleConfig = config as CreatorStyleConfig | null;
  const enabled =
    creatorStyleConfig?.style === "creator" && creatorStyleConfig?.enabled === true;
  const intensity = clampIntensity(creatorStyleConfig?.intensity);
  const fontScaleByIntensity: Record<number, number> = {
    1: 1,
    2: 1.05,
    3: 1.1,
    4: 1.18,
    5: 1.25,
  };
  const fadeByIntensity: Record<number, { inMs: number; outMs: number }> = {
    1: { inMs: 120, outMs: 80 },
    2: { inMs: 140, outMs: 90 },
    3: { inMs: 170, outMs: 110 },
    4: { inMs: 200, outMs: 130 },
    5: { inMs: 240, outMs: 160 },
  };
  const fontSize = Math.round(28 * fontScaleByIntensity[intensity]);

  return {
    enabled,
    intensity,
    fontSize,
    fade: fadeByIntensity[intensity],
    outline: enabled ? Math.min(5, 2 + Math.ceil(intensity / 2)) : 3,
    shadow: enabled ? Math.min(3, 1 + Math.floor(intensity / 3)) : 1,
  };
};

const toSrtTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = 0;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
};

const toAssTime = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);
  const cs = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 100);

  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

const createSubtitleLines = (text: string): SubtitleLine[] => {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const start = Math.max(0, index * 2 - 0.3);
      const end = start + 2;

      return {
        start,
        end,
        text: line,
      };
    });
};

const createDualSubtitleLines = (mainText: string, subText: string): SubtitleLine[] => {
  const mainLines = mainText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const subLines = subText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const maxLength = Math.max(mainLines.length, subLines.length);

  return Array.from({ length: maxLength }).map((_, index) => {
    const start = Math.max(0, index * 2 - 0.3);
    const end = start + 2;

    return {
      start,
      end,
      text: [mainLines[index] ?? "", subLines[index] ?? ""].filter(Boolean).join("\n"),
    };
  });
};

const subtitleLinesToSrt = (lines: SubtitleLine[]) => {
  return lines
    .map((line, index) =>
      [
        String(index + 1),
        `${toSrtTime(line.start)} --> ${toSrtTime(line.end)}`,
        line.text,
      ].join("\n")
    )
    .join("\n\n");
};

const escapeAssText = (text: string) => {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/[{}]/g, "")
    .replace(/\r?\n/g, "\\N");
};

const subtitleLinesToCreatorAss = (
  lines: SubtitleLine[],
  renderConfig: ReturnType<typeof getCreatorSubtitleRenderConfig>
) => {
  const dialogues = lines
    .map((line) => {
      const text = `{\\fad(${renderConfig.fade.inMs},${renderConfig.fade.outMs})}${escapeAssText(line.text)}`;

      return `Dialogue: 0,${toAssTime(line.start)},${toAssTime(line.end)},Default,,0,0,0,,${text}`;
    })
    .join("\n");

  return `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${renderConfig.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,1,${renderConfig.outline},${renderConfig.shadow},2,40,40,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogues}
`;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const transcript = String(body.transcript ?? "");
    const subTranscript = String(body.subTranscript ?? "");
    const creatorStyleConfig = body.creatorStyleConfig ?? null;
    const subtitleMode = String(body.subtitleMode ?? "single");
    const renderConfig = getCreatorSubtitleRenderConfig(creatorStyleConfig);

    if (creatorStyleConfig) {
      console.log("CreatorStyleConfig received /api/burn-subtitle", creatorStyleConfig);
      console.log("Creator subtitle render config", renderConfig);
    }

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
    const subtitlePath = path.join(
      os.tmpdir(),
      renderConfig.enabled ? "nexcut-creator-subtitle.ass" : "nexcut-subtitle.srt"
    );
    const outputPath = path.join(os.tmpdir(), "burned-subtitle.mp4");

    if (!fs.existsSync(videoPath)) {
      return NextResponse.json(
        { success: false, error: "先に動画をアップロードしてください" },
        { status: 400 }
      );
    }

    const subtitleLines =
      subtitleMode === "dual" && subTranscript.trim()
        ? createDualSubtitleLines(transcript, subTranscript)
        : createSubtitleLines(transcript);

    const subtitleText = renderConfig.enabled
      ? subtitleLinesToCreatorAss(subtitleLines, renderConfig)
      : subtitleLinesToSrt(subtitleLines);

    fs.writeFileSync(subtitlePath, subtitleText, "utf8");

    const escapedSubtitlePath = subtitlePath
      .replace(/\\/g, "/")
      .replace(":", "\\:");
    const subtitleFilter = renderConfig.enabled
      ? `subtitles='${escapedSubtitlePath}'`
      : `subtitles='${escapedSubtitlePath}':force_style='Fontsize=28,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=80'`;

    await execFileAsync("ffmpeg", [
      "-y",
      "-ss",
      String(start),
      "-t",
      String(duration),
      "-i",
      videoPath,
      "-vf",
      subtitleFilter,
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